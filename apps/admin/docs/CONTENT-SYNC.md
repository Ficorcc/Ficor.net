# 内容数据通道

后台（SvelteKit on Workers）与主站（Astro 静态站）之间的内容流向说明。

## 一句话模型

**R2 是后台的写入端，仓库 `src/content` 是主站的读取端，两者之间由同一套同步脚本打通。**
本地开发与生产构建跑的是同一个脚本、同一份逻辑，唯一区别是「内容源」指向哪里。

## 三个存储位置

| 场景 | 后台写入 | 主站读取 |
|---|---|---|
| 本地开发 | 本地模拟 R2（wrangler/miniflare 落盘）<br>`apps/admin/.wrangler/state/v3/r2/admin-r2` | `src/content/`（由同步脚本从本地模拟 R2 拉取） |
| 生产环境 | 真实 R2 `admin-r2` | `src/content/`（构建时由同步脚本从真实 R2 拉取） |

同步脚本会自动选择内容源：

- 配置了 `ADMIN_R2_ACCOUNT_ID` / `ADMIN_R2_ACCESS_KEY_ID` / `ADMIN_R2_SECRET_ACCESS_KEY` → 直连真实 R2（Cloudflare Pages 构建走这条）；
- 未配置凭据但存在本地模拟 R2 → 读取本地落盘数据（本地开发走这条）；
- 两者都没有 → 告警并跳过（`ADMIN_R2_SYNC_STRICT=1` 时改为报错退出）。

因此「本地改了看不到」不会再发生：本地后台保存 → 本地模拟 R2 → 监听器自动同步 → 前端热更新。

## 命令

```bash
npm run dev              # Astro dev + 内容监听（本地开发用这个）
npm run dev:astro        # 只启动 Astro，不启动监听
npm run content:watch    # 单独启动内容监听
npm run content:sync     # 手动同步一次（等价于 content:sync:admin）
npm run content:check    # 检查后台与前端内容差异
npm run content:push     # 反向：把仓库内容推回 R2（默认只出计划）
npm run site-data:push   # 反向：把仓库站点数据快照推回 R2（默认只出计划）
```

同步脚本额外参数：

```bash
node ./scripts/sync-admin-r2-content.mjs --dry-run                  # 只看会做什么，不写文件
node ./scripts/sync-admin-r2-content.mjs --source=local             # 强制用本地模拟 R2
node ./scripts/sync-admin-r2-content.mjs --on-conflict=overwrite    # 冲突时以 R2 覆盖仓库
```

## 冲突策略（重要）

同一份内容在 R2 与仓库里都存在、但内容不同时，是否覆盖仓库版本由冲突策略决定。
**默认一律 `overwrite`** —— R2 是唯一真源，本地开发与生产构建必须跑同一套逻辑。

被覆盖的文件会在同步结束时逐个列出，所以「手改过的文件被冲掉」是看得见的：

```
[admin-r2] 已用 R2 版本覆盖 1 个仓库文件：
    ~ src/data/links.ts
    这是预期行为（R2 是唯一真源）。若其中有你手写的改动，用 `git diff` 检查。
```

想先人工确认再落盘，有两种方式：

```bash
node ./scripts/sync-admin-r2-content.mjs --dry-run             # 只看会改什么
node ./scripts/sync-admin-r2-content.mjs --on-conflict=skip    # 保守：不覆盖，只报告
```

或用 `ADMIN_R2_SYNC_ON_CONFLICT=skip` 长期设为保守模式。

> 历史说明：早期本地源默认是 `skip`，用来挡住本地模拟 R2 里一批历史导入的旧格式副本。
> 那批数据已对账清理（`content:check` 报 0 差异），`skip` 只剩下副作用：
> 后台改了已有文章 / 友链 / 订阅，前端不更新（新建的文件不受影响，仍然会同步），
> 并且造成本地 `skip`、生产 `overwrite` 的行为分叉。因此统一改为 `overwrite`。

## 站点数据骤减告警（重要）

`overwrite` 策略有一个代价：R2 里的数据如果被写坏了，同步会**照单全收**。
线上出过一次真实事故 —— R2 的 `data/links.json` 只剩 1 条友链，同步脚本老老实实
把 `src/data/links.ts` 覆盖成 1 条，前端友链页几乎空白，而**全程没有任何提示**，
只有翻 `git diff` 才看得出来。

因此同步在写 `data/links.json` / `data/feed.json` 之前，会先比一遍「规模指标」：

| 对象 | 指标 | 基线 | 触发条件 |
|---|---|---|---|
| `data/links.json` | 可见友链数（`is_active !== false`） | ≥ 5 | 跌破基线的 50% |
| `data/feed.json` | 订阅数（`subscriptions` 长度） | ≥ 5 | 跌破基线的 50% |

```
[admin-r2] ⚠ 站点数据骤减：R2 里的规模远小于仓库当前值。
    · links.json：可见友链 41 → 0
  同步已按 R2 版本覆盖仓库文件（R2 是唯一真源），前端会跟着变。
  ...
```

几个刻意的设计：

- **只告警，不阻断**。在后台批量下架友链/订阅是正常操作，把它做成构建错误
  只会逼人绕过校验。要硬失败时显式设 `ADMIN_R2_SYNC_STRICT=1`。
- **先取 body 再比对**。`downloadObject` 一落盘，仓库里的旧值就没了，
  所以比对必须发生在写入之前。
- **口径与前端对齐**。可见友链的过滤条件（`is_active && show_in_links`）必须与
  `publicCommunity` 完全一致，否则告警会在「友链本来就被隐藏」时误报。
- **订阅数与可见友链分开计数**。一条友链可以只做订阅、不显示在友链页，
  两个指标互相独立，不能合并。
- **解析不了就不告警**。宁可漏报也不误报：读不出结构时返回 `null` 而不是猜一个数。

### 口径镜像：改了 `community.ts` 就要改 `content-sync.mjs`

`src/lib/community.ts` 是 TypeScript，`scripts/lib/content-sync.mjs` 是给 Node 脚本用的
`.mjs`，没法直接 import。所以 `content-sync.mjs` 里有三个**手抄副本**：

| 副本 | 原版 | 抄了什么 |
|---|---|---|
| `textOf` | `text()` | 只有字符串算数，并 trim |
| `webUrl` | `webUrl()` | 补尾斜杠；非 http(s)、带凭据、解析失败一律视为空 |
| `normalizedLink` | `normalizeLinks()` | 丢缺 `name`/`url` 的条目；`feed` 回退到 `feedUrl`；`feed_enabled` 缺省跟随 `is_active` |

**改一边就必须改另一边。** 这条约束由 `apps/admin/tests/community-parity.test.ts` 里
「口径镜像：content-sync.mjs 与 community.ts 必须一致」那一组钉住 ——
它用 16 个畸形载荷（缺字段、非 http 协议、带凭据的 URL、混入 `null`/数字的条目、
只差尾斜杠的重复 feed……）逐条比对两边的结果。真实数据整整齐齐，覆盖不到这些边角，
所以这组用例不能删。

> 手抄副本容易漏掉 `show_in_links` 这一层 —— 曾经 `expectedVisible` 就只按 `is_active` 数，
> 而 `show_in_links: false` 正是「在线但不显示在友链页」的开关，用它下掉一条友链时，
> 还原脚本的自检会误报「数量与预期不符」。

指标与判定逻辑在 `scripts/lib/content-sync.mjs`（`visibleLinkCount` /
`subscriptionCount` / `visibleLinksOf` / `subscriptionsOf` / `detectDataCollapse` /
`DATA_METRICS`），有单元测试覆盖（`apps/admin/tests/content-sync.test.ts`）。

## 环境变量一览

仓库根目录放 `.env` 即可（模板见 `.env.example`）：脚本启动时会自动合并进来，
**已存在的环境变量优先**，所以 Cloudflare Pages / CI 注入的值不会被本地文件盖掉。
本机没有 `.env` 时加载器就是一次文件存在性判断，零副作用。

| 变量 | 默认值 | 说明 |
|---|---|---|
| `ADMIN_R2_ACCOUNT_ID` / `ADMIN_R2_ACCESS_KEY_ID` / `ADMIN_R2_SECRET_ACCESS_KEY` | 空 | R2 S3 凭据；缺失则回退本地模拟存储 |
| `ADMIN_R2_BUCKET` | `admin-r2` | 存储桶名 |
| `ADMIN_R2_PREFIX` | `content/` | 正文前缀 |
| `ADMIN_R2_SETTINGS_PREFIX` | `settings/` | 设置前缀 |
| `ADMIN_R2_DATA_PREFIX` | `data/` | 站点数据前缀 |
| `ADMIN_R2_SOURCE` | `auto` | `auto` / `remote` / `local` |
| `ADMIN_R2_LOCAL_STATE` | `apps/admin/.wrangler/state/v3` | 本地模拟 R2 根目录 |
| `ADMIN_R2_SYNC_ON_CONFLICT` | `overwrite` | `skip` / `overwrite` |
| `ADMIN_R2_SYNC_PRUNE` | 关闭 | `=1` 时删除仓库里 R2 已不存在的内容 |
| `ADMIN_R2_SYNC_STRICT` | 关闭 | `=1` 时找不到内容源、或站点数据骤减，直接失败退出 |
| `ADMIN_WATCH_INTERVAL` | `2000` | 监听轮询间隔（毫秒） |
| `ADMIN_WATCH_SYNC_ARGS` | 空 | 透传给同步脚本的额外参数 |
| `ADMIN_PUSH_BACKUP_DIR` | 系统临时目录 | `content:push` 写入本地 R2 前的备份目录 |

## 为什么默认不清理（`ADMIN_R2_SYNC_PRUNE` 关闭）

同步是「R2 → 仓库」的单向镜像，但仓库里可能存在 R2 里没有的文章
（例如直接通过 git 提交、或尚未导入后台的旧文章）。默认不清理可避免误删。

## 反向通道：仓库 → R2

两个方向都通了，才算真正一致。反向通道有两条路：

**1. 脚本对账（推荐，可批量）**

```bash
npm run content:push                                          # 只查看计划，不写入
npm run content:push -- --apply                               # 推送 R2 里缺失的文章
npm run content:push -- --apply --include-divergent           # 连内容不一致的一起用仓库版本覆盖
```

默认是计划模式，先列出「R2 缺失」与「内容不一致」两类，确认后再加 `--apply`。
写入本地 R2 前会自动备份到系统临时目录（可用 `ADMIN_PUSH_BACKUP_DIR` 指定）。

**2. 后台界面导入**

后台内置「从主站仓库导入」功能（`CONTENT_IMPORT_MARKDOWN`，每次 12 篇分页），
直接把 GitHub 仓库的 Markdown 写进 R2，适合少量补录。

### 什么时候需要反向通道

- 文章是直接以 Markdown 提交进仓库的，后台列表里看不到；
- 后台 R2 里残留历史导入的旧格式副本（缺 `slug` / `description` / 配图），
  需要用仓库里更完整的版本覆盖回去。

判断「以哪边为准」的原则：**默认以仓库为准**。仓库受 git 版本控制、
经过主站 schema 校验，且是生产构建的实际输入。

### 站点数据的反向通道（友链 / 订阅 / 小记）

正文之外的 `data/*.json` 走的是**另一个脚本**，因为它们的形态与正文完全不同：

```bash
npm run site-data:push                       # 只查看计划，不写入
npm run site-data:push -- --apply            # 用仓库快照覆盖 R2
npm run site-data:push -- --only=links --apply
npm run site-data:push -- --source=remote --apply
npm run site-data:push -- --emit-console     # 生成浏览器控制台还原脚本
```

快照存放在 `scripts/data/`，目前有 `links.original.json`（前台原始友链数据：
46 条，41 条可见、5 条离线隐藏）。脚本会把它与 R2 的 `data/links.json` 逐字段对比。

快照存的是**后台归一化后的形态**（`normalizeLinks` 会把裸域名补成带尾斜杠的
`https://example.com/`）。写入是幂等的：下次从后台保存，存下来的也是这个样子。
不要手工把尾斜杠去掉 —— 那会让仓库快照与线上 R2 长期不同形，同步时反复抖动。

**两道闸门**（正文脚本没有，因为站点数据一旦丢失会整块消失）：

1. 默认计划模式，加 `--apply` 才写入；
2. 若写入后条目数会**减少**，直接中止并报错，必须显式加 `--force`。

> 为什么需要它：`data/links.json` 是单向权威源，构建时会把它的内容写进
> `src/data/links.ts`。一旦 R2 里这份数据丢条目（线上真实发生过：
> 46 条友链只剩 1 条可见、`siteInfo` 变空），整站友链页就只剩一张卡片，
> 而 `/friends/` 因为订阅数仍从 `feed.json` 补齐，看起来还正常 ——
> 两个页面互相矛盾，排查时极易误判。此时必须能把仓库快照推回 R2。

#### 没有 R2 凭据时：用浏览器里的登录会话写入

`--emit-console` 会生成 `scripts/data/restore-<name>.console.js`：一段自带载荷的
脚本，登录后台后在开发者工具 Console 整段粘贴即可。它调用的是后台自己的接口
（`CSRF_ISSUE` → `DATA_SAVE` → `CONTENT_PUBLISH`），因此不需要交出任何凭据。

载荷内联在产物里，快照更新后要重新生成，不要手改产物文件。

**友链可见性的判定链**（改数据前先理解它）：

```
publicCommunity.links = links.filter(is_active !== false && show_in_links !== false)
communityData.subscriptions = links.filter(feed_enabled && feed)   // 与 is_active 无关
```

所以「友链页只剩几条」而「友圈动态数不变」是完全可能的组合，
说明坏的是 `is_active` / `show_in_links`，而不是整份数据丢了。

修复线上后，**还需要触发一次「保存并部署」**：`CONTENT_PUBLISH` 才会
重建站点并把 `published/community.json` 重新发布。前台页面在加载后会用
`/admin/api/community/` 的返回值覆盖服务端渲染的内容，而那个接口读的正是
`published/community.json` —— 只修 `data/links.json` 不重新发布，
浏览器里看到的仍是旧快照。

#### 第三种方式：直接用 Cloudflare API 写 R2（本机 wrangler 已登录时）

如果本机已经 `wrangler login` 过，就不需要任何 S3 凭据，也不需要浏览器会话：

```bash
# 1) 拿 token（wrangler 自己存的那份）
TOKEN=$(sed -nE 's/^oauth_token = "(.*)"/\1/p' ~/Library/Preferences/.wrangler/config/default.toml)
ACCT=<account id>

# 2) 写数据对象（key 必须做 URL 编码，否则含 / 的 key 会失败）
curl -X PUT -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json; charset=utf-8' \
  --data-binary @scripts/data/links.original.json \
  "https://api.cloudflare.com/client/v4/accounts/$ACCT/r2/buckets/admin-r2/objects/data%2Flinks.json"

# 3) 触发 Pages 生产构建
curl -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"branch":"main"}' \
  "https://api.cloudflare.com/client/v4/accounts/$ACCT/pages/projects/vii-ink/deployments"
```

几个容易踩的点：

- **`wrangler whoami` 不会列出 R2 权限，但 R2 的 REST API 依然可用**。
  不要因为 scope 列表里没有 `workers_r2:write` 就断定这条路走不通 —— 实测能读写。
  反过来，`wrangler r2 object get/put` 走的 S3 端点在本机代理下会 `fetch failed`，
  所以**别用 wrangler 的 r2 子命令，直接用 REST API**。
- **key 要 URL 编码**（`data%2Flinks.json`）。不编码时 `data/links.json` 有时能过，
  `published/community.json` 会直接连接失败。
- **必须同时写 `published/community.json`**，否则前台加载后仍会用旧快照覆盖渲染。
  它的内容就是 `JSON.stringify(publicCommunity(communityData(links, feed)))`
  （紧凑格式，无缩进）。`data/links.json` 则是 `JSON.stringify(x, null, 2) + '\n'`。
  两者的序列化格式不同，别写混。
- `customMetadata`（`updatedAt` / `publishedAt`）通过 REST API 写不上去。
  目前没有任何代码读它，所以无功能影响；但要知道这个差异存在。
- **Pages 生产环境只注入了 3 个 `ADMIN_R2_*`，没有 `GITHUB_CONTENT_PUSH_TOKEN`**，
  所以构建里的 `commit-admin-content.mjs` 会跳过，不会把同步结果推回 main。
  （仓库历史里也确实一条 `vii-ink-bot` 的提交都没有。）

## Slug 身份：文件名 vs 公开 URL（重要）

同一篇文章有两个「slug」，职责不同，**不要混用**：

| 名称 | 位置 | 作用 |
|---|---|---|
| **存储身份** | R2 对象 key / 文件名：`content/essay/出发.md` | 后台列表、编辑器路由、增删改查的唯一标识 |
| **公开 URL** | frontmatter 的 `slug:` 字段（如 `chu-fa`） | 决定前台地址 `/chu-fa/` |

前台取值规则与主站 `src/lib/content.ts` 完全一致：

```ts
publicSlug = frontmatter.slug ?? 文件名
```

仓库里这两个值普遍不同（89 篇中有 54 篇不一致，例如 `出发.md` ↔ `slug: chu-fa`），
这是历史导入的既成事实，**不需要强行对齐**。

⚠️ 由此推导出一条硬规则：**后台保存时必须写回原文件名**。
如果拿 `frontmatter.slug` 当写入路径，保存一篇 `出发.md` 会另建一个 `chu-fa.md`，
同一篇文章变成两份，随后同步进仓库还会因为公开 slug 重复而**构建失败**。
编辑器已按此实现（`+page.svelte` 中的 `storageSlug` / `publicSlug` 分离）。

## 本地模拟 R2 的直写与垃圾回收

`content:push` 写本地模拟 R2 时**不走 `wrangler r2 object put`**，而是直接写
miniflare 的落盘结构（`blobs/<blob_id>` + SQLite 的 `_mf_objects` 表）。
原因：wrangler 会把 objectPath 当 URL 处理，对非 ASCII key 做百分号编码，
`出发.md` 会被写成 `%E5%87%BA%E5%8F%91.md`，凭空多出一份对不上的重复对象。

注意事项：

- 运行中的 `wrangler dev`（`workerd` 进程）与直写共用同一份落盘数据，
  写入期间可能短暂争用；适配器已设 `PRAGMA busy_timeout`，冲突时会重试。
- 覆盖已有对象后，旧 blob 文件理论上会被顺带清理；miniflare 自身也会回收
  未被 `_mf_objects` 引用的孤儿 blob。若发现 `blobs/` 里文件数明显多于对象数，
  属于可安全回收的垃圾，不影响前台与后台的读取结果。
- 生产 R2 走 S3 接口（SigV4 签名），不存在上述本地存储细节。

## 同步范围：正文 + 设置 + 站点数据

同步不只搬 `content/`，还有另外两个前缀，它们同样属于「后台写、前端读」：

| R2 前缀 | 仓库目标 | 说明 |
|---|---|---|
| `content/<集合>/*.md` | `src/content/<集合>/` | 文章正文 |
| `settings/*.json` | `src/data/settings/` | 主题设置 |
| `data/links.json` | `src/data/links.ts` | **派生文件**，由 `linksModuleSource()` 生成 |
| `data/feed.json` | `src/config/feed.json` | 订阅源缓存（`/links/` 与 `/friends/` 用） |
| `data/<其它>.json` | `src/data/<其它>.json` | 原样拷贝 |

⚠️ `src/data/links.ts` 是**生成文件**，不要手改 —— 下次同步会覆盖。
生成器刻意保留了 `LinkItem` / `SiteInfo` 接口与类型注解，与原有手写版本形状一致，
消费方 `src/lib/community-snapshot.ts` 无需改动。要改友链请改后台数据。

判断「数据以哪边为准」：和正文一样，**一律以 R2 为准**（后台是写入端，冲突策略默认
`overwrite`）。`npm run content:check` 会单独列出这两个前缀的差异，不会混在正文里。

### 友链与订阅的字段归属

`data/links.json` 是友链与订阅的**唯一注册表**；`data/feed.json` 只是抓取缓存。
`communityData()` 组装订阅列表时：

| 字段 | 来源 |
|---|---|
| `name` / `url` / `avatar` / `description` / `feedUrl` | **友链记录**（`links.json`） |
| `latestItems` / `updated` / `lastError` | 抓取缓存（`feed.json`） |

也就是说 `feed.json` 里同名条目的展示字段会被忽略 —— 改站点名称或头像请改友链，
改「最新文章」列表才会动到 `feed.json`。后台 `/feeds` 页面的「刷新」按钮写的就是后者。

`/links/` 只渲染友链；`/friends/` 渲染缓存下来的文章条目。

## 排查

```bash
npm run content:check
```

正文输出四类差异：

1. **仅 R2 有** —— 后台写了但从未同步到仓库，前端看不到；
2. **仅仓库有** —— 仓库里有但后台没有，后台列表看不到；
3. **内容不一致** —— 两边都有但正文不同（同步默认不覆盖，需人工判断以哪边为准）；
4. **非法 / 冲突的公开 slug** —— 两篇文章算出同一个公开 URL，或 slug 含非法字符，**构建会直接失败**。

第 4 类尤其值得在提交前跑一次：文章文件名里如果带全角标点（`，` `“”` `｜`）、空格或 ` - `，
算出的公开 slug 会不合法，需要在 frontmatter 里显式补一个 `slug:`。

之后还会单独报告 `设置` 与 `站点数据` 两个前缀的差异（见上一节）。
加 `--strict` 时任一差异都会让命令以退出码 1 结束，可用作 CI 门禁。

### 看到「站点数据骤减」告警怎么办

按这个顺序走，不要跳步：

1. **先看后台列表**（友链页 / 订阅页）。条目是不是真的少了？
   少了就是你刚做的改动，属于正常；没少说明是 R2 里的那份被写坏了。
2. **确认口径**。`/links/` 只剩几张卡片、而 `/friends/` 动态数没变，
   说明坏的是 `is_active` / `show_in_links` 这几个字段，不是整份数据丢了。
3. **还原**：用仓库快照推回 R2 —— 有凭据时 `npm run site-data:push -- --apply`，
   没有凭据时 `npm run site-data:push -- --emit-console` 生成脚本，
   登录后台后在 Console 整段粘贴（走后台自己的接口，不需要交出凭据）。
4. **必须再点一次「保存并部署」**。只修 `data/links.json` 不重新发布，
   前台页面加载后仍会用 `/admin/api/community/` 的旧发布快照覆盖渲染结果，
   浏览器里看不出任何变化。

本地要复现这个告警，可以把 `ADMIN_R2_LOCAL_STATE` 指到本地模拟 R2 的一份**副本**
（不要动原件），改小副本里的 `data/links.json`，再跑
`ADMIN_R2_SOURCE=local ADMIN_R2_LOCAL_STATE=<副本> node scripts/sync-admin-r2-content.mjs --dry-run`。

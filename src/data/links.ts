export interface LinkItem {
  id: string;
  name: string;
  url: string;
  description: string;
  avatar: string;
  feed?: string;
  is_active?: boolean;
  status?: "unknown" | "online" | "offline";
  statusCode?: number;
  lastChecked?: string;
  lastError?: string;
}

export interface SiteInfo {
  title: string;
  url: string;
  description: string;
  avatar: string;
}

export const siteInfo: SiteInfo = {
  "title": "柒色墨笺",
  "url": "https://vii.ink",
  "description": "柒色入墨，落笔成诗，墨染流年，笺载心事",
  "avatar": "/author/avatar.webp"
};

export const links: LinkItem[] = [
  {
    id: "f72d9842-adf4-4378-8a39-39c709a1a1c2",
    name: "Lawpan",
    url: "https://lawpan.cc/",
    description: "一个简洁优雅的博客",
    avatar: "https://lawpan.cc/favicon.png",
    feed: "https://lawpan.cc/feed",
    is_active: false,
    status: "offline",
    statusCode: 404,
    lastChecked: "2026-06-19T08:21:37.785Z",
    lastError: "HTTP 404"
  },
  {
    id: "ficor",
    name: "荒野菲克",
    url: "https://ficor.net",
    description: "在路上的思绪与脚印",
    avatar: "https://ficor.net/favicon.ico",
    feed: "https://ficor.net/feed",
    is_active: true,
    status: "online",
    statusCode: 200,
    lastChecked: "2026-06-19T08:21:37.844Z"
  },
  {
    id: "acevs",
    name: "ACEVS",
    url: "https://acevs.com",
    description: "你坚持过什么事情？",
    avatar: "https://cravatar.cn/avatar/ffc1ac2ecde17b2eb1caff3e94c119fdaea4dc1a947a08a3092b388bf9b454d0?s=32&d=identicon&r=g",
    feed: "https://acevs.com/feed",
    is_active: true,
    status: "online",
    statusCode: 200,
    lastChecked: "2026-06-19T08:21:38.520Z"
  },
  {
    id: "xu19",
    name: "我是军爸",
    url: "https://me.xu19.com",
    description: "记录单片机编程教学、生活与成长点滴",
    avatar: "https://cravatar.cn/avatar/6e688e8773b5bd7dd15d86d97bbb3561",
    feed: "https://me.xu19.com/feed",
    is_active: true,
    status: "online",
    statusCode: 200,
    lastChecked: "2026-06-19T08:21:37.738Z"
  },
  {
    id: "airy",
    name: "瓦匠不舟",
    url: "https://airy.ink",
    description: "大家都是倔强的人",
    avatar: "https://cravatar.cn/avatar/060afceaea08afc40f8bcef99fe8542a",
    feed: "https://airy.ink/feed",
    is_active: true,
    status: "online",
    statusCode: 200,
    lastChecked: "2026-06-19T08:21:38.419Z"
  },
  {
    id: "knay",
    name: "Yang's Blog",
    url: "https://knay.net",
    description: "一亩三分地，记录生活，分享见闻",
    avatar: "https://knay.net/avatar/yang.webp",
    feed: "https://knay.net/feed",
    is_active: true,
    status: "online",
    statusCode: 200,
    lastChecked: "2026-06-19T08:21:38.110Z"
  },
  {
    id: "wang618",
    name: "旺东自留地",
    url: "https://wang618.cn",
    description: "爱生活、爱摸鱼",
    avatar: "https://wang618.cn/logo.gif",
    feed: "https://wang618.cn/rss.php",
    is_active: true,
    status: "online",
    statusCode: 200,
    lastChecked: "2026-06-19T08:21:38.840Z"
  },
  {
    id: "zhujay",
    name: "朱小呆",
    url: "https://zhujay.com",
    description: "记录生活分享美好",
    avatar: "https://zhujay.com/images/webhead/wh2.png",
    feed: "https://zhujay.com/feed",
    is_active: true,
    status: "online",
    statusCode: 200,
    lastChecked: "2026-06-19T08:21:37.827Z"
  },
  {
    id: "xifeng",
    name: "西风",
    url: "https://xifeng.net",
    description: "源于热爱而去创造",
    avatar: "https://xifeng.net/images/avatar.svg",
    feed: "https://xifeng.net/feed",
    is_active: true,
    status: "online",
    statusCode: 200,
    lastChecked: "2026-06-19T08:21:38.312Z"
  },
  {
    id: "yufan",
    name: "且听书吟",
    url: "https://yufan.me",
    description: "诗与梦想的远方",
    avatar: "https://yufan.me/logo.svg",
    feed: "https://yufan.me/feed",
    is_active: true,
    status: "online",
    statusCode: 200,
    lastChecked: "2026-06-19T08:21:37.872Z"
  },
  {
    id: "synyan",
    name: "旅行漫记",
    url: "https://synyan.cn",
    description: "博物馆爱好者",
    avatar: "https://synyan.cn/wp-content/themes/hera-develop/build/images/logo-s.png",
    feed: "https://synyan.cn/feed",
    is_active: true,
    status: "online",
    statusCode: 200,
    lastChecked: "2026-06-19T08:21:38.304Z"
  },
  {
    id: "synyan-t",
    name: "竹炉山房",
    url: "https://synyan.cn/t",
    description: "旅游点打卡员",
    avatar: "https://synyan.cn/wp-content/themes/hera-develop/build/images/logo-s.png",
    feed: "https://synyan.cn/t/feed",
    is_active: true,
    status: "online",
    statusCode: 200,
    lastChecked: "2026-06-19T08:21:38.301Z"
  },
  {
    id: "1900",
    name: "1900'Blog",
    url: "https://1900.live",
    description: "孤独的互联网冲浪大师",
    avatar: "https://1900.live/logo.svg",
    feed: "https://1900.live/rss",
    is_active: true,
    status: "online",
    statusCode: 200,
    lastChecked: "2026-06-19T08:21:37.685Z"
  },
  {
    id: "laozhang",
    name: "老张博客",
    url: "https://laozhang.org",
    description: "生活琐记，技术折腾，乐在记录点滴与分享",
    avatar: "http://pic.laozhang.org/i/2023/04/07/642f72584c9a1.png",
    feed: "https://laozhang.org/feed",
    is_active: true,
    status: "online",
    statusCode: 200,
    lastChecked: "2026-06-19T08:21:38.116Z"
  },
  {
    id: "iliu",
    name: "老刘博客",
    url: "https://iliu.org",
    description: "热爱传统文化，验光师",
    avatar: "https://iliu.org/img/favicon.ico",
    feed: "https://iliu.org/index.xml",
    is_active: true,
    status: "online",
    statusCode: 200,
    lastChecked: "2026-06-19T08:21:43.431Z"
  },
  {
    id: "my1981",
    name: "似水流年",
    url: "https://my1981.cn",
    description: "如花美眷，怎敌得过似水流年",
    avatar: "https://weavatar.com/avatar/65cd1f408c1cc0949b34d3cd2acad0cb5a2b8c362ebf31ca9ee0dc9edcc63e81?s=100&r=g",
    feed: "https://my1981.cn/feed",
    is_active: true,
    status: "online",
    statusCode: 200,
    lastChecked: "2026-06-19T08:21:39.027Z"
  },
  {
    id: "chenrui",
    name: "陈锐—响石潭",
    url: "https://www.chenrui.com",
    description: "记录活着",
    avatar: "https://www.chenrui.com/zb_users/upload/2026/01/20260103005431176737287110422.png",
    feed: "https://www.chenrui.com/feed.php",
    is_active: true,
    status: "online",
    statusCode: 200,
    lastChecked: "2026-06-19T08:21:37.882Z"
  },
  {
    id: "hjyl",
    name: "皇家园林",
    url: "https://hjyl.org",
    description: "欢迎来到皇家元林",
    avatar: "https://img.hjyl.org/uploads/2019/10/about-me.png",
    feed: "https://hjyl.org/feed",
    is_active: true,
    status: "online",
    statusCode: 200,
    lastChecked: "2026-06-19T08:21:37.880Z"
  },
  {
    id: "xyzbz",
    name: "子夜松声",
    url: "https://xyzbz.cn",
    description: "互联网爱好者",
    avatar: "https://cn.cravatar.com/avatar/120340d1df519f4e28613fe5d404b286?s=96&d=mp&r=g",
    feed: "https://xyzbz.cn/feed",
    is_active: true,
    status: "online",
    statusCode: 200,
    lastChecked: "2026-06-19T08:21:38.651Z"
  },
  {
    id: "hux",
    name: "Counting Stars💫",
    url: "https://hux.ink",
    description: "欲买桂花同载酒，终不似，少年游",
    avatar: "https://weavatar.com/avatar/d44fe4344f5b822fe55c92d04b874cbad2e22babd866c8a462d71afb0e86e9b5?d=letter&letter=%E8%90%BD",
    feed: "https://hux.ink/index.xml",
    is_active: true,
    status: "online",
    statusCode: 200,
    lastChecked: "2026-06-19T08:21:38.346Z"
  },
  {
    id: "lawtee",
    name: "老T博客",
    url: "https://lawtee.com",
    description: "聚焦法律、科技和生活",
    avatar: "https://lawtee.com/images/favicon.png",
    feed: "https://lawtee.com/index.xml",
    is_active: true,
    status: "online",
    statusCode: 200,
    lastChecked: "2026-06-19T08:21:38.062Z"
  },
  {
    id: "jiangcl",
    name: "蒙需",
    url: "https://jiangcl.com",
    description: "律师",
    avatar: "https://img.ficor.net/uploads/2025/11/6914480601006.webp",
    feed: "https://jiangcl.com/feed",
    is_active: true,
    status: "online",
    statusCode: 200,
    lastChecked: "2026-06-19T08:21:37.827Z"
  },
  {
    id: "pewae",
    name: "破袜子",
    url: "https://pewae.com",
    description: "一个脱离不了低级趣味的人",
    avatar: "https://pewae.com/wp-content/uploads/cropped-logo-20251231-1-270x270.png",
    feed: "https://pewae.com/feed",
    is_active: true,
    status: "online",
    statusCode: 200,
    lastChecked: "2026-06-19T08:21:39.619Z"
  },
  {
    id: "vrast",
    name: "Keyle's Blog",
    url: "https://vrast.cn",
    description: "记录一些偶尔冒出来转眼就会忘的灵感",
    avatar: "https://vrast.cn/favicon.ico",
    feed: "https://vrast.cn/atom.xml",
    is_active: true,
    status: "online",
    statusCode: 200,
    lastChecked: "2026-06-19T08:21:38.575Z"
  },
  {
    id: "d-d",
    name: "孤鬥",
    url: "https://d-d.design",
    description: "做自己，不隨波逐流，不妥協",
    avatar: "https://img.ficor.net/uploads/2025/11/6914480601006.webp",
    feed: "https://d-d.design/feed",
    is_active: true,
    status: "online",
    statusCode: 200,
    lastChecked: "2026-06-19T08:21:37.806Z"
  },
  {
    id: "laomuzhu",
    name: "木竹",
    url: "https://www.laomuzhu.cn",
    description: "在字里行间慢慢生长",
    avatar: "https://www.laomuzhu.cn/img/touxiang.jpg",
    feed: "https://www.laomuzhu.cn/feed",
    is_active: true,
    status: "online",
    statusCode: 200,
    lastChecked: "2026-06-19T08:21:38.580Z"
  },
  {
    id: "ihaihe",
    name: "三十海河",
    url: "https://ihaihe.cn",
    description: "扩大自己的自由边界",
    avatar: "https://ihaihe.cn/wp-content/uploads/2025/03/touxiang.png",
    feed: "https://ihaihe.cn/feed",
    is_active: true,
    status: "online",
    statusCode: 200,
    lastChecked: "2026-06-19T08:21:37.701Z"
  },
  {
    id: "redcha",
    name: "彬红茶日记",
    url: "https://note.redcha.cn",
    description: "生活原本沉闷，但跑起来就有风",
    avatar: "https://note.redcha.cn/upload/favicon-256x256.png",
    feed: "https://note.redcha.cn/rss.xml",
    is_active: true,
    status: "online",
    statusCode: 200,
    lastChecked: "2026-06-19T08:21:39.179Z"
  },
  {
    id: "zhongxiaojie",
    name: "obaby@mars",
    url: "https://zhongxiaojie.com",
    description: "黑客程序媛",
    avatar: "https://gg.lang.bi/avatar/d6ebc088df916bcc9e8b94a09f9b0f604e57be54b04bd520c6db2492740fc563?s=90&d=identicon&r=r",
    feed: "https://zhongxiaojie.com/feed",
    is_active: true,
    status: "online",
    statusCode: 200,
    lastChecked: "2026-06-19T08:21:43.474Z"
  },
  {
    id: "pipishe",
    name: "皮皮社",
    url: "https://www.pipishe.com",
    description: "皮一下~很开心",
    avatar: "https://www.pipishe.com/tx.webp",
    feed: "https://www.pipishe.com/feed",
    is_active: true,
    status: "online",
    statusCode: 200,
    lastChecked: "2026-06-19T08:21:37.722Z"
  },
  {
    id: "veryjack",
    name: "Jack's Space",
    url: "https://veryjack.com",
    description: "Everything happens for the best",
    avatar: "https://veryjack.com/wp-content/uploads/2025/05/avatar_transparent.webp",
    feed: "https://veryjack.com/feed",
    is_active: true,
    status: "online",
    statusCode: 200,
    lastChecked: "2026-06-19T08:21:38.098Z"
  },
  {
    id: "yayu",
    name: "雅余",
    url: "https://yayu.net",
    description: "茶余饭后，闲情雅致",
    avatar: "https://yayu.net/wp-content/themes/yayu/assets/images/icon.png",
    feed: "https://yayu.net/feed",
    is_active: true,
    status: "online",
    statusCode: 200,
    lastChecked: "2026-06-19T08:21:37.826Z"
  },
  {
    id: "bestcherish",
    name: "灰常记忆",
    url: "https://bestcherish.com",
    description: "记录生活 珍藏回忆",
    avatar: "https://bestcherish.com/image/favicon.svg",
    feed: "https://bestcherish.com/feed",
    is_active: true,
    status: "online",
    statusCode: 200,
    lastChecked: "2026-06-19T08:21:37.847Z"
  },
  {
    id: "hxy",
    name: "韩情脉脉",
    url: "https://www.hxy.cc",
    description: "任何记录都是为了让以后有迹可循",
    avatar: "https://www.hxy.cc/ico.png",
    feed: "https://www.hxy.cc/feed",
    is_active: true,
    status: "online",
    statusCode: 200,
    lastChecked: "2026-06-19T08:21:39.423Z"
  },
  {
    id: "ilogs",
    name: "全局变量",
    url: "https://ilogs.cn",
    description: "记录生活中的平凡事",
    avatar: "https://img.ficor.net/uploads/2025/11/6914480601006.webp",
    feed: "https://ilogs.cn/feed",
    is_active: true,
    status: "online",
    statusCode: 200,
    lastChecked: "2026-06-19T08:21:38.746Z"
  },
  {
    id: "heitaosan",
    name: "黑桃三",
    url: "https://heitaosan.com",
    description: "有梦想的人，永远年轻",
    avatar: "https://cn.cravatar.com/avatar/afcb21221b3785f83e89cb3c63ed4020",
    feed: "https://heitaosan.com/feed",
    is_active: true,
    status: "online",
    statusCode: 200,
    lastChecked: "2026-06-19T08:21:37.780Z"
  },
  {
    id: "amrx",
    name: "缓坡日记",
    url: "https://amrx.me",
    description: "网页中的诗意与宁静",
    avatar: "https://thirdqq.qlogo.cn/g?b=qq&nk=160860446&s=100",
    feed: "https://amrx.me/feed",
    is_active: false,
    status: "offline",
    lastChecked: "2026-06-19T08:21:37.608Z",
    lastError: "fetch failed"
  },
  {
    id: "note-star",
    name: "笔记星球",
    url: "https://note-star.cn",
    description: "网页中的诗意与宁静",
    avatar: "https://note-star.cn/shortcut/logo.ico",
    feed: "https://note-star.cn/feed",
    is_active: true,
    status: "online",
    statusCode: 200,
    lastChecked: "2026-06-19T08:21:37.840Z"
  },
  {
    id: "hisherry",
    name: "燕渡寒潭",
    url: "https://hisherry.com",
    description: "别为活命而败坏生存之根",
    avatar: "https://cravatar.cn/avatar/c822f896a44080703a0845eb6a1ead02d72859e9e0273df32806698db9516512?s=42&r=g",
    feed: "https://hisherry.com/feed",
    is_active: true,
    status: "online",
    statusCode: 200,
    lastChecked: "2026-06-19T08:21:38.392Z"
  },
  {
    id: "hollowman",
    name: "我心向阳",
    url: "https://www.hollowman.cn",
    description: "看清生活的真相后依然热爱生活",
    avatar: "https://www.hollowman.cn/favicon.png",
    feed: "https://www.hollowman.cn/feed",
    is_active: true,
    status: "online",
    statusCode: 200,
    lastChecked: "2026-06-19T08:21:38.093Z"
  },
  {
    id: "onojyun",
    name: "莫比乌斯",
    url: "https://onojyun.com",
    description: "写作，是一场自我悖驳的旅程",
    avatar: "https://onojyun.com/wp-content/uploads/2024/03/a2d42-cropped-mobius_icon_black-edited.png",
    feed: "https://onojyun.com/feed",
    is_active: true,
    status: "online",
    statusCode: 200,
    lastChecked: "2026-06-19T08:21:40.761Z"
  },
  {
    id: "mhcf",
    name: "梦幻辰风",
    url: "https://www.mhcf.net",
    description: "壹个永恒的部落格",
    avatar: "https://www.mhcf.net/mhcf.ico",
    feed: "https://www.mhcf.net/rss.php",
    is_active: true,
    status: "online",
    statusCode: 200,
    lastChecked: "2026-06-19T08:21:38.779Z"
  },
  {
    id: "pwsz",
    name: "品味苏州",
    url: "https://pwsz.com",
    description: "生活在人间天堂",
    avatar: "https://pwsz.com/myimg/pwsz_logo.png",
    feed: "https://pwsz.com/feed",
    is_active: true,
    status: "online",
    statusCode: 200,
    lastChecked: "2026-06-19T08:21:38.378Z"
  },
  {
    id: "xulog",
    name: "徐建伟",
    url: "http://www.xulog.cn",
    description: "记录生活 珍藏回忆",
    feed: "http://www.xulog.cn/index.php?act=rss",
    is_active: true,
    status: "online",
    statusCode: 200,
    lastChecked: "2026-06-19T08:21:37.783Z"
  },
  {
    id: "cuixiping",
    name: "崔话记",
    url: "https://cuixiping.com",
    description: "向着理想的方向，爬一会儿，躺一会儿",
    avatar: "https://cuixiping.com/logo-cat.svg",
    feed: "https://cuixiping.com/blog/feed/atom/",
    is_active: true,
    status: "online",
    statusCode: 200,
    lastChecked: "2026-06-19T08:21:40.349Z"
  },
  {
    id: "zhoutian",
    name: "周天记",
    url: "https://zhoutian.com",
    description: "记录生活里的小美好",
    avatar: "https://bu.dusays.com/2023/01/29/63d5bf7fa0d2c.png",
    feed: "https://zhoutian.com/rss.xml",
    is_active: true,
    status: "online",
    statusCode: 200,
    lastChecked: "2026-06-19T08:21:37.719Z"
  }
];

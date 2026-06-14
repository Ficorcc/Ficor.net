# Waline for vii.ink

这个目录用于部署 `https://waline1.ficor.cc`，评论服务只绑定到 `vii.ink`。

## 部署

1. 确认 DNS：把 `waline1.ficor.cc` 解析到服务器 IP。
2. 把本目录上传到服务器，例如 `/opt/waline1`。
3. 复制环境变量文件：

```bash
cp .env.example .env
```

4. 把 `.env` 里的 `JWT_TOKEN` 改成随机字符串：

```bash
openssl rand -hex 32
```

5. 启动 Waline：

```bash
docker compose up -d
```

6. 给 `waline1.ficor.cc` 签发 HTTPS 证书，并按 `nginx.conf` 反代到 `127.0.0.1:8361`。
7. 打开 `https://waline1.ficor.cc/ui` 注册第一个用户，它会成为管理员。

## 站点配置

当前博客已经在 `site.config.mjs` 中指向：

```js
serverURL: 'https://waline1.ficor.cc'
```

部署完成后重新构建并发布 vii.ink 即可启用新评论服务。

# Unified Waline on Cloudflare

This worker serves one Waline-compatible backend for multiple sites.

- Worker: `ficor-waline`
- Domain: `https://waline.ficor.cc`
- D1 database: `ficor-waline`
- D1 database ID: `dc44b5d8-2686-4ede-b790-6540af6fb7a7`
- Admin email: `ficor@qq.com`

Supported site groups:

- `vii.ink`
- `warmpaper.pages.dev`
- `linglingtu.com` / `fangtang.pages.dev`

Each site only needs this client config:

```js
serverURL: "https://waline.ficor.cc"
```

The worker isolates comment paths by request `Origin` / `Referer`, so the same
article path on different sites is stored separately while the admin UI uses one
shared account.

## Deploy

```sh
npx wrangler deploy --config wrangler.toml
```

## Initialize D1 schema

```sh
npx wrangler d1 execute ficor-waline --file=./schema.sql --remote --config wrangler.toml
```

## Set admin password

```sh
npx wrangler secret put ADMIN_PASSWORD --config wrangler.toml
```

The first admin account is bootstrapped from `ADMIN_EMAIL` and `ADMIN_PASSWORD`
when `/ui` is opened for the first time. New users can also register through the
Waline admin UI.

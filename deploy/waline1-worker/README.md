# vii.ink Waline on Cloudflare

This worker serves Waline-compatible comments for `https://vii.ink`.

- Worker: `vii-ink-waline`
- Domain: `https://waline1.ficor.cc`
- D1 database: `vii-ink-waline`
- D1 database ID: `fed0ca8e-25b8-49a9-a6ca-8d77767fa380`
- Admin email: `ficor@qq.com`

## Deploy

```sh
npx wrangler deploy --config wrangler.toml
```

## Initialize D1 schema

```sh
npx wrangler d1 execute vii-ink-waline --file=./schema.sql --remote --config wrangler.toml
```

## Set admin password

```sh
npx wrangler secret put ADMIN_PASSWORD --config wrangler.toml
```

The first admin account is bootstrapped from `ADMIN_EMAIL` and `ADMIN_PASSWORD`
when `/ui` is opened for the first time. New users can also register through the
Waline admin UI.

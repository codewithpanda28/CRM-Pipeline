# Railway / Railpack deploy notes (ThinkAIQ CRM monorepo)

## Why the build failed

```
npm error Unsupported URL Type "workspace:": workspace:*
```

This repo is a **pnpm workspace**. Internal packages use `workspace:*`.
Railpack fell back to **npm**, which cannot resolve that protocol.

## Fix applied in repo

- `packageManager` / `devEngines` → pnpm@10.33.2
- `mise.toml` → pin Node 20 + pnpm 10.33.2
- `railpack.json` → force node provider + pnpm package + API start
- Root scripts: `build:api` / `start:api`

## Railway service settings (required)

For **API** service:

| Setting | Value |
|---------|--------|
| Root Directory | *(empty / repo root)* — **not** `apps/api` |
| Build Command | leave blank (Railpack) **or** `pnpm install --frozen-lockfile && pnpm --filter "@vencore/api..." build` |
| Start Command | `pnpm --filter "@vencore/api" start` (or blank to use railpack.json) |
| Node | 20.x via mise / engines |

For **Web** service (separate):

| Setting | Value |
|---------|--------|
| Root Directory | repo root |
| Build Command | `pnpm install --frozen-lockfile && pnpm --filter "@vencore/web..." build` |
| Start Command | `pnpm --filter "@vencore/web" start` |

## Env vars (API)

Copy from `.env.example` — at minimum:

- `DATABASE_URL` (Railway Postgres)
- `JWT_SECRET`
- `REDIS_URL` / `JOBS_REDIS_URL` if worker/jobs needed
- `APP_URL` / public URL as configured

Do **not** point app SoR at `DATABASE_URL_TEST`.

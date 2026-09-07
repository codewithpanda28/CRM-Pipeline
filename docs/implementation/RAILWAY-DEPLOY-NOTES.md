# Railway / Railpack / Docker deploy notes (ThinkAIQ CRM monorepo)

## Why deploy failed

```
npm error Unsupported URL Type "workspace:": workspace:*
```

Railpack defaulted to **npm**. This repo is a **pnpm workspace** (`workspace:*`).

CI/Docker image publish can be green while **Railway production deploy** still fails — they are different pipelines.

## Fix in repo (current)

1. `railway.json` → **force `DOCKERFILE` builder** using `docker/Dockerfile.api`  
   (same path that already builds successfully in GitHub Actions)
2. `railpack.json` → hard pnpm install if anyone switches builder back to Railpack
3. `mise.toml` + `packageManager` → pnpm@10.33.2

## Railway dashboard checklist

1. Service Root Directory = **empty** (repo root) — not `apps/api`
2. Builder = **Dockerfile** (or leave to `railway.json`)
3. Dockerfile path = `docker/Dockerfile.api` (or env `RAILWAY_DOCKERFILE_PATH=docker/Dockerfile.api`)
4. Start command = `node apps/api/dist/index.js` (Dockerfile CMD is fine)
5. Redeploy latest `main`

## Env (API)

At minimum from `.env.example`:

- `DATABASE_URL` → Railway Postgres (real SoR)
- `JWT_SECRET`
- `REDIS_URL` if jobs needed
- public `APP_URL` / CORS origins as configured

Never use `DATABASE_URL_TEST` for the live app.

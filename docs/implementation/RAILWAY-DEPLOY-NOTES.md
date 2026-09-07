# Railway / Railpack / Docker deploy notes (ThinkAIQ CRM monorepo)

## Why deploy failed

```
npm error Unsupported URL Type "workspace:": workspace:*
```

Railpack defaulted to **npm**. This repo is a **pnpm workspace** (`workspace:*`).

CI/Docker image publish can be green while **Railway production deploy** still fails — they are different pipelines.

## Fix in repo (current)

1. **Root `Dockerfile`** — Railway build context must include `apps/` + `packages/`
2. `railway.json` → `dockerfilePath: "Dockerfile"` (repo root, not `docker/…`)
3. `docker/Dockerfile.api` kept for GHCR publish matrix
4. Railpack/pnpm pins remain as fallback

### Important Railway dashboard settings

| Setting | Must be |
|---------|---------|
| **Root Directory** | **Empty** (repo root) |
| Builder | Dockerfile |
| Dockerfile path | `Dockerfile` |
| Env `RAILWAY_DOCKERFILE_PATH` | delete it, or set to `Dockerfile` |

If Root Directory is `docker` or `apps/api`, you get:
`"/apps": not found` — because those folders are not inside that context.

## Env (API)

At minimum from `.env.example`:

- `DATABASE_URL` → Railway Postgres (real SoR)
- `JWT_SECRET`
- `REDIS_URL` if jobs needed
- public `APP_URL` / CORS origins as configured

Never use `DATABASE_URL_TEST` for the live app.

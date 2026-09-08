# Railway deploy — READ THIS

## Why you still see `npm` + `workspace:*` errors

That log means Railway is still using **Railpack + npm**, NOT our Dockerfile.

Our repo **requires**:

| Setting | Value |
|---------|--------|
| **Root Directory** | **EMPTY** (repo root) |
| **Builder** | **Dockerfile** |
| **Dockerfile path** | `Dockerfile` |
| **Start Command** | `node apps/api/dist/index.js` |

### Wrong (causes this exact error)

- Root Directory = `apps/api` → only sees `apps/api/package.json` → **no pnpm**, `workspace:*` → boom
- Builder = Railpack → runs `npm install`

### Proof in your log

```
using build driver railpack-v0.39.0
Using npm package manager
$ npm install
Unsupported URL Type "workspace:"
```

If Dockerfile builder was active you would see:

```
load build definition from Dockerfile
FROM node:20-bookworm-slim
RUN corepack enable && corepack prepare pnpm@...
```

## Fix in Railway UI (required — code alone cannot override a bad Root Directory)

1. Open project **calm-purpose** → your API service  
2. **Settings → Source / Root Directory** → clear it (blank)  
3. **Settings → Build** → Builder = **Dockerfile**  
4. Dockerfile path = `Dockerfile`  
5. Remove any Start Command that says `npm run start` (or set `node apps/api/dist/index.js`)  
6. **Deploy** latest `main` (`075fa88` or newer)

## Files already on `main`

- `/Dockerfile` — pnpm monorepo API image  
- `/railway.json` + `/railway.toml` — force Dockerfile builder  
- `/package.json` — `"packageManager": "pnpm@10.33.2"`

## Optional: skip build, run GHCR image

GitHub already publishes `ghcr.io/codewithpanda28/crm-api:latest`.  
You can point the Railway service at that image instead of building from Git.

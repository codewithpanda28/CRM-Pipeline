# VENCORE_DEPENDENCIES.md

## Repository license

**MIT** (`LICENSE`) — permissive for commercial use of *Vencore’s own code*.

**Critical rule:** MIT on the app does **not** make every dependency MIT.

## Important direct dependencies

| Package | Version (declared) | Purpose | Commercial note |
|---------|-------------------|---------|------------------|
| next | 16.2.6 | Web | MIT |
| react / react-dom | 19.x | UI | MIT |
| express | ^4.19 | API | MIT |
| kysely | ^0.27 | Query builder | MIT |
| zod | ^3.23 | Validation | MIT |
| pg | ^8.20 | Postgres driver | MIT |
| ioredis | ^5.10 | Redis | MIT |
| bcrypt | ^6 | Password hash | OK |
| jsonwebtoken | ^9 | JWT | MIT |
| pino | ^9 | Logging | MIT |
| nodemailer | ^8 | Email | MIT |
| @aws-sdk/client-s3 | ^3 | Object storage | Apache-2.0 |
| ws | ^8 | WebSocket | MIT |
| vitest | ^1/^2 | Tests | MIT |
| turbo | ^2 | Monorepo | MIT |
| stripe | ^15 | Payments SDK | **Present but SaaS billing removed** — review usage |
| @clerk/express | ^1 | Auth SDK | **Likely vestigial** — remove or justify |
| svix | ^1.21 | Webhooks vendor SDK | Commercial service SDK; check usage |
| mongodb / mysql2 | present | Infra DB connectors | MIT/other — fine |
| ssh2 | ^1.17 | SSH/SFTP | Dual license historically — verify current |
| googleapis / imapflow | present | Mail integrations | Check ToS + licenses |
| timescale/postgres image | compose | Metrics hypertable | **Product license** — verify for SaaS hosting/redistribution |

## Copyleft

No AGPL-named npm packages spotted in a name-level scan. **Run `license-checker` / FOSSA / Scancode** before shipping white-label SaaS.

## Recommendation

1. Remove unused Clerk/Stripe if unused  
2. Document Timescale: use plain Postgres if Timescale license conflicts with distribution  
3. Add CI license gate for ThinkAIQ commercial builds  

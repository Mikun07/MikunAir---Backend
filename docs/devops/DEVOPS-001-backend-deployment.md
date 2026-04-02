# Backend DevOps & Deployment Strategy

**Service:** MikunAir Backend API  
**Version:** v1.0.0  
**Status:** Approved  
**Date:** 2026-04-26  
**Author:** Festus-Olaleye Ayomikun  
**Depends On:** QUALITY-001-backend-testing-strategy.md

---

## 1. Operational Requirements

### Availability
- Target: 99.5% uptime (NFR-002) — ~3.6 hours acceptable downtime per month
- Recovery: Docker restart policies; Azure managed PostgreSQL with automatic failover

### Recovery Targets
- RTO (Recovery Time Objective): < 30 minutes
- RPO (Recovery Point Objective): < 1 hour (continuous WAL archiving)

### Scalability
- Baseline: 100 concurrent users (NFR-001)
- Burst: 500 concurrent users (NFR-013)
- Mechanism: Stateless API — horizontal container replication (NFR-009)

### Compliance
- GDPR: personal data processed in EU regions only (Azure North Europe / West Europe)
- Data retention: booking records kept for 7 years minimum (NFR-015)

---

## 2. Environment Strategy

### Development
- **Purpose:** Local feature development and testing
- **Infrastructure:** Docker Compose (backend container + PostgreSQL container)
- **Access:** Developer only (localhost:3000)
- **Config:** `.env.local` (gitignored — never committed)
- **Start:** `docker compose up --build` or `npm run dev`

### Staging
- **Purpose:** Pre-production validation, integration testing
- **Infrastructure:** Azure Container Instance (1 vCPU, 1.5GB RAM)
- **Access:** Developer only (no public access)
- **Config:** Environment variables injected via GitHub Actions secrets
- **Deploy:** Automated on push to `main` after all CI gates pass

### Production
- **Purpose:** Live portfolio demonstration
- **Infrastructure:** Azure Container Apps (scale-to-zero; 0.5–1 vCPU, scales 0→3 replicas)
- **Access:** Public API (JWT-protected); only `/health` and `/graphql` unauthenticated
- **Config:** Azure Key Vault references injected as container environment variables
- **Deploy:** Automated on git tag `vX.Y.Z` after staging validation

---

## 3. Docker Strategy

### Multi-Stage Dockerfile

The backend `Dockerfile` has three named stages:

| Stage | Base Image | Purpose |
|---|---|---|
| `builder` | `node:20-alpine` | Compile TypeScript → `dist/` |
| `development` | `node:20-alpine` | Hot-reload dev server via `tsx watch` |
| `production` | `node:20-alpine` | Minimal runtime — only production deps, compiled output |

**Production image security hardening:**
- Non-root user (`appuser` in group `appgroup`)
- Only `--omit=dev` dependencies installed
- `--ignore-scripts` on `npm ci` to prevent postinstall attacks
- Health check: `wget -qO- http://localhost:3000/health`

### Build Commands

```bash
# Development image (hot-reload)
docker build --target development -t mikunair-backend:dev .
docker run -p 3000:3000 --env-file .env.local mikunair-backend:dev

# Production image
docker build --target production -t mikunair-backend:prod .
docker run -p 3000:3000 --env-file .env.production mikunair-backend:prod
```

---

## 4. CI/CD Pipeline

### Continuous Integration

Defined in `.github/workflows/ci.yml`. Triggered on every push and pull request to any branch.

```
Step 1:  Checkout code
Step 2:  Setup Node.js 20 + npm cache
Step 3:  npm ci (install dependencies)
Step 4:  TypeScript type check (tsc --noEmit)
Step 5:  ESLint (zero errors required)
Step 6:  Unit tests + V8 coverage (≥80% on business logic)
Step 7:  Run DB migrations (against CI PostgreSQL service)
Step 8:  Integration tests (Supertest + real DB)
Step 9:  npm audit --audit-level=high
Step 10: GraphQL schema validation (npm run validate:schema)
Step 11: Docker build --target production (verify image builds)
```

All steps must pass. Any failure blocks the PR.

### Continuous Delivery

Triggered on push to `main` after CI passes:

```
Step 1:  CI pipeline (above) — must pass
Step 2:  Docker build + push to Azure Container Registry
Step 3:  Deploy to Staging (Azure Container Instance)
Step 4:  Run k6 performance tests against staging
Step 5:  Notify: pass or fail
```

### Continuous Deployment

Triggered on git tag `vX.Y.Z`:

```
Step 1:  CD pipeline — must pass
Step 2:  Deploy to Production (Azure Container Apps)
Step 3:  Health check: GET /health → 200 OK
Step 4:  Smoke test: one integration test scenario against production
```

### Rollback

```bash
# Azure Container Apps instant revision rollback
az containerapp revision set-mode --revision <previous-revision-name>
```

Automated rollback triggers if health check fails post-deployment.

---

## 5. Infrastructure

### Compute

| Environment | Resource | Spec |
|---|---|---|
| Development | Docker Compose (local) | No cloud cost |
| Staging | Azure Container Instance | 1 vCPU, 1.5GB RAM |
| Production | Azure Container Apps | 0.5–1 vCPU, scale 0–3 replicas |

### Database

| Environment | Resource | Notes |
|---|---|---|
| Development | PostgreSQL 16 Docker container | Local volume for persistence |
| Staging | Azure Database for PostgreSQL (Flexible Server, Burstable B1ms) | Managed; automated backups |
| Production | Azure Database for PostgreSQL (Flexible Server, General Purpose D2s_v3) | Managed; point-in-time restore; 7-year backup retention |

### Networking

| Component | Purpose |
|---|---|
| Azure Container Apps Ingress | TLS termination, HTTPS enforcement, reverse proxy |
| CORS (Express `cors` middleware) | Restricts allowed origins to `FRONTEND_URL` env var |
| VNet integration (production) | Backend container not directly internet-accessible; traffic routes via Container Apps managed ingress |

---

## 6. Configuration Management

All configuration via environment variables — nothing hardcoded.

| Variable | Development | Staging | Production |
|---|---|---|---|
| `DATABASE_URL` | `postgres://localhost:5432/...` | GitHub Actions secret | Azure Key Vault |
| `JWT_SECRET` | `.env.local` | GitHub Actions secret | Azure Key Vault |
| `JWT_REFRESH_SECRET` | `.env.local` | GitHub Actions secret | Azure Key Vault |
| `SMTP_HOST` | Mailhog (localhost:1025) | GitHub Actions secret | Azure Key Vault |
| `NODE_ENV` | `development` | `staging` | `production` |
| `FRONTEND_URL` | `http://localhost:5173` | Staging frontend URL | Production frontend URL |
| `PORT` | `3000` | `3000` | `3000` |

**Secrets rule:** No secret ever appears in source code, Docker image layer, or git history. CI uses GitHub encrypted secrets; production uses Azure Key Vault references.

---

## 7. Monitoring & Observability

### Health Check

```
GET /health → 200 { "status": "ok", "service": "mikunair-backend" }
```

Used by Docker health check, Azure Container Apps liveness probe, and CI smoke test.

### Structured Logging (Winston)

All log entries are JSON:

```json
{
  "timestamp": "2026-06-26T19:00:00.000Z",
  "level": "info",
  "correlationId": "a1b2c3d4-...",
  "service": "booking",
  "action": "booking.created",
  "entityId": "booking-uuid",
  "message": "Booking created successfully"
}
```

**PII rule:** Name, email, date of birth, and document fields are **never** logged. The `sanitiser.ts` module strips these fields before any log output.

**Log retention:**
- Development: console only
- Staging: Azure Monitor Logs (30-day retention)
- Production: Azure Monitor Logs (90-day retention); booking AuditLog retained 7 years

### Application Metrics

| Metric | Source | Threshold | Alert |
|---|---|---|---|
| P95 API response time | Express middleware → `/metrics` | > 2000ms | Azure Monitor alert |
| HTTP 5xx error rate | Express middleware | > 1% over 5 min | Azure Monitor alert |
| Container CPU | Azure Monitor | > 80% sustained 5 min | Email alert |
| DB connection count | Azure Monitor | > 80% of pool max | Email alert |

### Request Tracing

Every inbound request receives a UUID correlation ID (injected by `correlationIdMiddleware`). This ID is:
- Attached to every structured log entry for that request
- Written to the `AuditLog` row for booking events
- Returned in `500` error responses so users can report it

Trace a booking failure: API log → `BookingService` log → `AuditLog` entry — all share the same `correlationId`.

---

## 8. Security Operations

| Area | Control |
|---|---|
| Secrets | Azure Key Vault (production); GitHub encrypted secrets (CI); `.env.local` (dev, gitignored) |
| Container images | Scanned with `trivy` in CI; base images pinned to specific digest |
| Dependencies | `npm audit` in CI; Dependabot enabled on GitHub repo |
| Container hardening | Non-root user; `--ignore-scripts` on install |
| Infrastructure access | Azure RBAC; no shared credentials; MFA required |

---

## 9. Backup & Disaster Recovery

| Resource | Backup Method | Frequency | Retention |
|---|---|---|---|
| Production PostgreSQL | Azure automated backups + WAL | Continuous | 7 days point-in-time; AuditLog data 7 years |
| Container images | Azure Container Registry | Every CI build | Latest 10 tagged versions retained |

**RTO:** < 30 minutes (redeploy from registry; restore from latest DB backup)  
**RPO:** < 1 hour (continuous WAL archiving)

---

## 10. Scalability

### Current Design

- Stateless Node.js API (JWT, no server-side sessions): horizontal replication requires no architectural change
- PostgreSQL connection pool: 20 connections per container instance (configurable via `DATABASE_URL`)

### Scaling Path

| Layer | Mechanism | Trigger |
|---|---|---|
| API (horizontal) | Azure Container Apps scale-out (0 → 3 replicas) | CPU > 70% or request queue depth |
| Database | Azure PostgreSQL vertical tier upgrade | Connection count > 80% of max |

### Cost Analysis (portfolio estimates)

| Resource | Tier | Estimated Monthly Cost |
|---|---|---|
| Azure Container Apps (backend) | Scale-to-zero; ~2 vCPU-hours/day | ~£5–10 |
| Azure Database for PostgreSQL | Flexible Server, Burstable B1ms | ~£12–15 |
| Azure Container Registry | Basic | ~£4 |
| Azure Monitor Logs | 5GB/month | ~£2–5 |
| **Total backend** | | **~£23–34/month** |

---

*Document controlled under the MikunAir Backend documentation governance.*  
*Next review: triggered by any infrastructure change, new CI step, or deployment strategy revision.*

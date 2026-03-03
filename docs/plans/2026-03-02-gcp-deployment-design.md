# GCP Deployment Design

## Goal

Deploy the dragons-all monorepo to Google Cloud Platform using OpenTofu for infrastructure-as-code, with automated CI/CD through GitHub Actions.

## Architecture

```
                         ┌──────────────┐
                         │  Cloud DNS   │
                         │  (external)  │
                         └──┬────────┬──┘
                            │        │
              api.domain.com         app.domain.com
                            │        │
                    ┌───────▼────────▼──────┐
                    │  Global HTTPS LB      │
                    │  (Google-managed SSL)  │
                    │  URL Map: host-based   │
                    └───┬────────────┬──────┘
                        │            │
                ┌───────▼──┐  ┌─────▼─────┐
                │Cloud Run │  │ Cloud Run  │
                │  API     │  │   Web      │
                │ min:1    │  │  min:0     │
                │ port:8080│  │ port:3000  │
                │ +VPC conn│  │            │
                └──┬────┬──┘  └────────────┘
                   │    │
           ┌───────▼┐ ┌▼──────────────┐
           │CloudSQL│ │Memorystore    │
           │Postgres│ │Valkey 8.0     │
           │  17    │ │(private VPC)  │
           └────────┘ └───────────────┘
```

## Decisions

### Environment: Production only
Single environment to keep costs low. Staging can be added later by duplicating the environment directory.

### Routing: Subdomains
- `app.<domain>` routes to the Next.js web service
- `api.<domain>` routes to the Hono API service
- Each gets a Google-managed SSL certificate (auto-renewal)
- DNS records managed externally (user's registrar), pointing A records to the LB static IP

### Cache: Memorystore for Valkey 8.0
Wire-compatible with Redis/ioredis/BullMQ. Newer engine than Redis 7.2, multi-threaded I/O, actively developed by Google and the Linux Foundation.

### Database: Cloud SQL PostgreSQL 17
Matches the project's local dev setup (postgres:17). Connected via Cloud SQL Proxy Unix socket.

### API min-instances: 1
The BullMQ sync worker runs embedded in the API process and must stay alive for scheduled cron jobs (04:00 daily sync).

### Web min-instances: 0
Scales to zero when no traffic. Next.js standalone output keeps the image small.

### State: GCS bucket
OpenTofu remote state stored in a GCS bucket with prefix-based isolation.

### Migrations: Automatic
Run as part of the deploy workflow via Cloud SQL Proxy before deploying the new API image. Also available as a manual workflow for ad-hoc operations.

### Auth: Workload Identity Federation
GitHub Actions authenticates to GCP via OIDC (no service account keys stored as secrets).

## Runtime Versions

| Component | Version |
|-----------|---------|
| Node.js | 24 LTS (Alpine 3.21) |
| PostgreSQL | 17 (Cloud SQL) |
| Valkey | 8.0 (Memorystore) |
| OpenTofu | >= 1.6.0 |
| pnpm | 10.29.3 |

## File Structure

```
infra/
├── versions.tf                           # Provider requirements
├── .gitignore                            # Ignore .terraform, tfplan, tfvars
├── modules/
│   ├── network/main.tf                   # VPC + subnet + VPC connector + private service access
│   ├── cloud-run/main.tf                 # Generic Cloud Run v2 service
│   ├── cloud-sql/main.tf                 # PostgreSQL 17 instance + database + user
│   ├── valkey/main.tf                    # Memorystore Valkey 8.0 instance
│   ├── load-balancer/main.tf             # Global HTTPS LB + SSL certs + URL map
│   ├── secrets/main.tf                   # Secret Manager + IAM
│   ├── artifact-registry/main.tf         # Docker repo with cleanup policies
│   └── workload-identity/main.tf         # WIF pool + provider + SA + roles
└── environments/
    └── production/
        ├── main.tf                       # Wires modules together
        ├── variables.tf                  # Input variables
        └── terraform.tfvars.example      # Template for secrets

apps/api/Dockerfile                       # Multi-stage: build with tsup, run as non-root
apps/web/Dockerfile                       # Multi-stage: next build standalone, run as non-root

.github/workflows/
├── deploy.yml                            # Build + push + deploy (after CI)
├── db-migrations.yml                     # Manual migration operations
└── opentofu.yml                          # Plan on PR, apply on push to main
```

## Secrets (Secret Manager)

| Secret Name | Source |
|---|---|
| `database-url-production` | Constructed from Cloud SQL Unix socket URL |
| `redis-url-production` | Constructed from Valkey host/port/auth |
| `sdk-username-production` | `var.sdk_username` |
| `sdk-password-production` | `var.sdk_password` |
| `auth-secret-production` | `random_password` (64 chars, auto-generated) |

## GitHub Repository Configuration

### Secrets (production environment)
- `GCP_WORKLOAD_IDENTITY_PROVIDER` — from `tofu output workload_identity_provider`
- `GCP_SERVICE_ACCOUNT` — from `tofu output github_service_account`

### Variables (production environment)
- `GCP_PROJECT_ID` — GCP project ID
- `GCP_REGION` — e.g. `europe-west3`
- `WEB_DOMAIN` — e.g. `app.dragons.example.com`
- `API_DOMAIN` — e.g. `api.dragons.example.com`

## Deploy Pipeline

```
push to main
  → CI workflow runs (lint, typecheck, test, coverage, build)
  → Deploy workflow triggers (on CI success)
      ├── Determine changes (dorny/paths-filter)
      │     web: apps/web/**, packages/ui/**, packages/shared/**
      │     api: apps/api/**, packages/db/**, packages/sdk/**, packages/shared/**
      │     db:  packages/db/src/schema/**, packages/db/drizzle/**
      ├── Run migrations (if db/api changed) via Cloud SQL Proxy
      ├── Build & push web image (if web changed) with Docker Buildx + GHA cache
      ├── Build & push API image (after migrations, if api changed) with Docker Buildx + GHA cache
      └── Deployment summary
```

## Manual Setup Steps (before first deploy)

1. Create GCP project and note project ID + project number
2. Create GCS bucket for OpenTofu state: `gsutil mb gs://<project-id>-tofu-state`
3. Enable initial APIs manually (or via first `tofu apply`):
   - `run.googleapis.com`, `artifactregistry.googleapis.com`, `sqladmin.googleapis.com`
   - `secretmanager.googleapis.com`, `iam.googleapis.com`, `redis.googleapis.com`
   - `vpcaccess.googleapis.com`, `servicenetworking.googleapis.com`, `compute.googleapis.com`
4. Copy `terraform.tfvars.example` to `terraform.tfvars`, fill in values
5. Run `tofu init && tofu plan && tofu apply`
6. Note outputs: `workload_identity_provider`, `github_service_account`, `load_balancer_ip`
7. Configure GitHub repository secrets and variables from outputs
8. Add DNS A records at your registrar pointing both subdomains to the LB IP
9. Wait for SSL certificate provisioning (can take up to 24 hours)
10. Push to main to trigger first deployment

## Cost Estimate (low traffic)

| Service | Spec | ~Monthly |
|---------|------|----------|
| Cloud Run API | min 1, 1 vCPU, 512Mi | ~$15-25 |
| Cloud Run Web | scales to zero | ~$0-5 |
| Cloud SQL PostgreSQL | db-f1-micro, 10GB SSD | ~$10 |
| Memorystore Valkey | Basic 1GB | ~$35 |
| Load Balancer | Global HTTPS | ~$18 |
| Artifact Registry | Storage | ~$1 |
| **Total** | | **~$80-95/mo** |

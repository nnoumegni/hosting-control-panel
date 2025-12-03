# Hosting Control Panel Architecture

## Goals
- Provision and manage shared hosting accounts on an Amazon Linux 2023 AMI EC2 instance.
- Provide a secure REST API to replace core WHM/cPanel workflows (account, domain, database, mail, DNS, SSL, backups, metrics).
- Power a modern Next.js dashboard for administrators, resellers, and end users.
- Automate server maintenance with auditable workflows, strong observability, and zero-downtime updates.

## Monorepo Layout
- `apps/api`: Node.js Express API written in TypeScript.
- `apps/web`: Next.js 15 App Router frontend.
- `packages/common`: Shared TypeScript types, validation schemas, and utilities.
- `packages/config`: Centralized ESLint, Prettier, TS configs.
- `packages/sdk`: Automatically generated client for the API (OpenAPI + `openapi-typescript-codegen`).

## Core Platform Components

### 1. Control Plane API (Express + TypeScript)
- Modular hexagonal architecture: `controllers` (HTTP), `services` (business logic), `providers` (system integrations), `repositories` (database), `jobs` (async workers).
- Domain modules:
  - **Auth & Identity**: OAuth2/JWT, multi-factor optional, RBAC (admin/reseller/end-user). Integrates with AWS Cognito or self-hosted Keycloak. Session revocation, API tokens, audit trails. MongoDB collections for users, sessions, audit logs.
  - **Account Provisioning**: Creates Linux users, home dirs, quotas via `systemd-run` + Cloud-Init scripts executed through AWS SSM. Manages plan templates (disk, inode, bandwidth limits) persisted in MongoDB.
  - **Domain & DNS**: Uses Route 53 for public DNS. Supports vanity nameservers, DNS templates, record CRUD, DNS zone import/export.
  - **Web Server Management**: Manages Nginx/Apache vhosts, PHP-FPM pools. Templates stored in S3, applied through Ansible playbooks triggered by API.
  - **Database Management**: Provision MySQL/MariaDB databases/users via RDS Data API or local MariaDB admin accounts. Password rotation, privilege templates. Metadata for database accounts tracked in MongoDB.
  - **Email**: Optional Postfix/Dovecot stack on EC2; or integrate with Amazon WorkMail/SES. Manage mailboxes, aliases, spam filtering rules.
  - **SSL & Security**: Automated certificate issuance through ACME (Let's Encrypt) using Certbot + DNS challenge. Security scanning (ClamAV), firewall rules (AWS Security Groups + `ufw`), WAF integration.
  - **Backups & Snapshots**: Schedule filesystem/database backups to S3 with lifecycle policies. Snapshot orchestration using AWS Backup. Allow per-account restore and store backup manifests in MongoDB.
  - **Metrics & Monitoring**: Collect via Prometheus node exporter, CloudWatch metrics, log streams (Fluent Bit -> CloudWatch Logs). Provide API endpoints for resource graphs, alerts, uptime.
  - **Billing & Quotas**: Track usage, integrate with Stripe for payments, automated account suspension/reactivation. Usage records and plan definitions stored in MongoDB collections.
- Async processing: Future implementation for long-running tasks (provisioning, certificate issuance, snapshots).
- Configuration: `dotenv` + AWS Secrets Manager; environment-specific overrides via `config` package.
- Validation: Zod schemas for inputs. Consistent error handling middleware.
- API schema: OpenAPI 3.1 auto-generated (via `express-openapi-validator`).

### 2. Frontend Dashboard (Next.js)
- App Router, RSC friendly architecture.
- Authentication using NextAuth.js (Cognito/Keycloak provider) with middleware-protected routes.
- Role-based navigation, feature flags via LaunchDarkly (optional).
- Real-time updates with `@tanstack/query` + SSE/WebSockets for job status.
- UI toolkit: Tailwind CSS + shadcn/ui. Charts with `@nivo/line`, tables with `@tanstack/react-table`.
- Primary sections:
  - Overview dashboard (system health, alerts, usage).
  - Account management (create/suspend/upgrade plans, resource usage, file manager embed via WebDAV).
  - Domains & DNS editors.
  - Databases, Email, SSL, Backups, Jobs, Billing.
  - Observability (logs, metrics, monitors) using embedded Grafana panel links.

### 3. Infrastructure & Deployment
- AWS baseline: Dedicated VPC, public/private subnets, EC2 auto recovery.
- Infrastructure as Code: Terraform modules for VPC, EC2, Amazon DocumentDB or MongoDB Atlas (with VPC peering), Elasticache, S3, CloudWatch, Route53.
- CI/CD: GitHub Actions -> deploy API via Docker images to ECS/Fargate or EC2 w/ CodeDeploy; Next.js to Amplify or S3+CloudFront.
- Secrets via AWS Secrets Manager + SSM Parameter Store.
- AMI Hardening: CIS benchmark, `cloud-init` bootstrap installing Docker, Nginx/Apache, PHP versions, Node.js, Certbot, fail2ban.
- Observability stack: OpenTelemetry instrumentation, logs to CloudWatch, metrics to Prometheus/AMP, traces to AWS X-Ray.

### 4. Data Layer
- Primary metadata store: MongoDB (Atlas or self-managed) for accounts, plans, DNS records, job logs, billing history, audit events.
- Caching & queue: Future implementation for session store and job queues.
- Object storage: S3 buckets for backups, site archives, certificate bundles.
- Audit log retention in DynamoDB Streams or OpenSearch.

### 5. Security Model
- Principle of least privilege across IAM roles.
- API authentication via OAuth2 client credentials for automation, JWT for dashboard, short-lived signed requests.
- Mandatory TLS (ACM certificates). Rate limiting (Express Rate Limit), WAF integration.
- Per-action audit logs, tamper-evident (hash chain stored in DynamoDB).
- Compliance: GDPR-ready data export/delete, configurable retention.

## Roadmap (High Level)
1. **Foundation**: Monorepo tooling, lint/test/typecheck pipelines, shared config packages.
2. **Auth & User Model**: RBAC implementation, JWT issuance, initial admin bootstrap.
3. **Provisioning MVP**: Linux user creation, vhost template deployment, DNS + SSL automation.
4. **Database & Email Modules**: Manage MariaDB/RDS, Postfix mailboxes.
5. **Backups & Monitoring**: Scheduled backups, metrics endpoints, log streaming.
6. **Billing & Automation**: Stripe integration, quotas, suspension workflows.
7. **Frontend UX**: Build dashboard flows per module, integrate API client SDK.
8. **Hardening & Scalability**: Load testing, blue/green deploys, multi-region support.

## Open Questions
- Which existing infrastructure must be integrated (existing DNS/email providers)?
- Desired billing model (usage-based vs flat plans)?
- Preference for self-hosted identity provider vs managed (Cognito/Okta)?
- Required compliance/certification targets?

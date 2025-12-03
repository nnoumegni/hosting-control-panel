# Hosting Control Panel

A modern alternative to cPanel/WHM for managing shared hosting workloads on Amazon Linux EC2 instances. The platform consists of a TypeScript-based Express API and a Next.js dashboard, packaged in a Yarn workspaces monorepo.

## Status
Planning and scaffolding. See `docs/architecture.md` for the current design outline.

## Repository Layout
- `apps/api` – Node.js Express control-plane API.
- `apps/web` – Next.js dashboard for administrators, resellers, and end-users.
- `packages` – Shared TypeScript configs, utilities, and generated SDK clients.

## Getting Started

This project uses Yarn 4.11.0, which is installed locally in the project. Corepack (included with Node.js) will automatically use the correct version.

```sh
# Enable Corepack (if not already enabled)
corepack enable

# Install dependencies
yarn install
```

Once the workspaces are scaffolded:
```sh
yarn dev:api   # starts the API server
yarn dev:web   # starts the Next.js app
```

## API Environment Setup

The API requires several infrastructure credentials (MongoDB, JWT keys, AWS region). For local development or first-time server installs, run:

```sh
./scripts/install-api.sh
```

The script will:
- generate `apps/api/.env.local` (or another target specified via `ENV_FILE`) with sensible defaults and a fresh RSA key pair
- install workspace dependencies
- build the shared packages and API bundle
- launch local MongoDB container via Docker (configurable with `SETUP_CONTAINERS=0`)
- optionally configure AWS synchronization by setting `FIREWALL_SECURITY_GROUP_ID` (required for allow rules) and `FIREWALL_NETWORK_ACL_ID` (optional for deny rules) before running the API
- provide an optional `FIREWALL_CREDENTIAL_PASSPHRASE` to encrypt AWS access keys stored through the firewall settings UI (generated automatically when omitted)

When finished, start the API with:

```sh
ENV_FILE=apps/api/.env.local yarn workspace @hosting/api dev
```

For production, supply real infrastructure values beforehand (either via environment variables when running the script or by editing the generated env file) and run `yarn workspace @hosting/api start`.

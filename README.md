# MediRecover

MediRecover is a cloud-based hospital disaster recovery management dashboard for a college cloud-computing hackathon. It uses fictional synthetic records only.

## What is implemented

The app includes overview, system monitoring, failure simulation, deterministic clinical recovery prioritization, real JSON backup snapshots, Web Crypto SHA-256 verification, isolated recovery restore, record-difference checks, recovery metrics, an illustrative cost estimator, append-only audit events, demo role gating, and a three-person recovery runbook.

## Cloud connection

The managed project injects `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` as protected environment values. The runtime exposes only these browser-safe values through `/api/config`, and the client uses the Supabase publishable key with RLS. Application state is persisted to `mr_app_state` when the Supabase schema is available. If either value is missing or the cloud write is unavailable, the UI visibly switches to `DEMO MODE` and persists snapshots/state in browser storage instead.

The demo role selector is not production authentication. Before using real clinical data, add Supabase Auth, tenant-scoped RLS, audit retention, key rotation, backup retention, monitoring, and an independently tested failover design.

## Local development

```bash
pnpm install
pnpm dev
```

The app listens on port 3000. Run `pnpm check` for TypeScript diagnostics and `pnpm build` for the production bundle.

## Safety

All hospitals, records, alerts, and service events are fictional. This is a disaster-recovery demonstration, not production-grade medical data protection and not an automatic production failover system.

# MediRecover implementation plan

## Scope
MediRecover is a responsive disaster-recovery demonstration dashboard for four fictional hospitals. It will never use real patient data and will visibly distinguish cloud-connected operation from local demo mode.

## Implementation approach
- React + TypeScript + Tailwind CSS with a polished shadcn-style component system.
- A single dashboard shell with responsive sidebar navigation and route-aware sections for Overview, Monitoring, Recovery, Backups, Cost Estimator, Audit Log, and Runbook.
- Deterministic synthetic seed data for four fictional hospitals and four service categories.
- A state layer that persists to browser storage immediately, and uses Supabase when the project URL/key are configured. Cloud writes are isolated behind repository-style functions so local demo mode remains fully functional.
- Backup flow serializes synthetic records to JSON, computes SHA-256 with Web Crypto, stores metadata, verifies the digest, exports the snapshot, restores into a distinct recovery dataset, and compares record counts/differences.
- Failure simulation transitions the primary data centre and affected services, creates an alert and audit event, and derives recovery order from clinical impact and target values. Reset/resolve returns the demo to a healthy state with an audit entry.
- Admin-gated controls use a clearly labeled demo role selector (Viewer, Operator, Administrator); this is not represented as production authentication.
- Supabase schema/migrations and RLS policies will be included for hospitals, services, backups, recovery records, alerts, and audit events when cloud credentials are available. Missing credentials produce a prominent DEMO MODE indicator instead of pretending cloud failover.
- Deployment will run on the managed web runtime with a route manifest, diagnostics, build script, and a checkpoint suitable for connecting to GitHub.

## Project structure
- `src/` — React application, shared types, seed data, state/repository logic, components, and feature views.
- `src/components/` — dashboard shell, cards, charts, tables, dialogs, badges, and toasts.
- `src/features/` — monitoring, recovery, backup/restore, cost, audit, and runbook modules.
- `src/lib/` — persistence adapters, hashing, formatting, role guards, and utilities.
- `supabase/migrations/` — additive schema and RLS SQL for cloud persistence.
- `public/manus-routes.json` — complete page route manifest.
- `README.md` — setup, local demo behavior, cloud configuration, limitations, and safety notes.

## Design direction
Three candidate directions: Quiet Clinical Instrument (0.06), Blueglass Operations Console (0.08), and Human-Centered Resilience Atlas (0.04). Chosen: **Blueglass Operations Console**.

- **Design Movement:** restrained healthcare SaaS precision with a subtle glass-and-grid operations-console feel.
- **Core Principles:** calm under pressure, high signal density, explicit state, and accessible contrast.
- **Color Philosophy:** white and cool slate surfaces keep the dashboard clinical; cobalt and cyan show continuity and active systems; amber and coral are reserved for risk and failure states.
- **Layout Paradigm:** a persistent command rail paired with a wide operational canvas; key status sits in a compact top band while detail panels expand progressively.
- **Signature Elements:** a blue pulse status marker, recovery-priority ribbons, and a thin “data centre spine” line connecting service states.
- **Interaction Philosophy:** dangerous actions are conspicuous, role-gated, and confirmation-backed; all async operations visibly disable and explain their result.
- **Animation:** brief status pulse and progress transitions only; no distracting motion during failure states.
- **Typography System:** Inter for operational UI and a slightly heavier display weight for section headings; monospaced numerals for hashes, timestamps, and metrics.
- **Brand Essence:** calm, credible recovery coordination for hospital IT teams; resilient, transparent, practical.
- **Brand Voice:** direct and reassuring. Example lines: “Recover in clinical order.” “Every snapshot is verified before restore.”
- **Wordmark & Logo:** a compact cross-shaped recovery mark intersected by a protected data line, paired with the MediRecover wordmark.
- **Signature Brand Color:** MediRecover cobalt `#2563EB`.

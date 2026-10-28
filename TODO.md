# MediRecover delivery outcomes

- [ ] Dashboard overview shows four fictional hospitals, system availability, backup health, last backup time, active alerts, and recovery statistics.
- [ ] System Monitoring shows synthetic patient records, laboratory reports, pharmacy records, and administration services with Online, Failed, Recovering, and Restored states plus sensible health details.
- [ ] Failure Simulation has a prominent “Simulate Data Centre Failure” action that marks the primary server failed, changes affected services to Failed, creates a timestamped alert and audit entry, and shows a clinically ordered recovery priority list; reset/resolve is available with clear confirmation.
- [ ] Recovery prioritization exposes configurable clinical importance and recovery target values and orders services deterministically with visible priorities and reasons.
- [ ] Backup and restore generate synthetic JSON records, serialize a snapshot, compute a Web Crypto SHA-256 integrity hash, save snapshot metadata, verify the hash, restore into a separate recovery dataset, compare restored records with the selected backup, report counts/differences, and offer JSON download/export.
- [ ] When cloud credentials are absent, the application visibly uses local DEMO MODE and keeps browser-storage backup, verification, restore, and hash flows real rather than claiming cloud failover.
- [ ] Recovery metrics show actual timestamps and measured recovery duration, last recoverable backup, restored records, detected differences, and configurable RTO/RPO target results with stated limitations.
- [ ] Cost estimator accepts editable storage GB, compute hours or size, and backup frequency; it displays an illustrative monthly cloud estimate with explicit editable assumptions and says it is not a quote.
- [ ] Audit log appends simulation, backup, verification, restore, and administrative configuration events with actor, timestamp, and result.
- [ ] Demo roles Viewer, Operator, and Administrator are visible; dangerous/admin controls are gated, and the UI explicitly says the selector is not production authentication. Supabase Auth is used only when configured.
- [ ] Recovery runbook provides a three-person IT team with ordered steps, owner assignments, and checklists.
- [ ] The app is responsive, accessible, and provides working navigation, loading/disabled states, success/error toasts, empty states, and validation.
- [ ] Supabase schema/migrations and RLS policies are included for cloud persistence; missing configuration is handled gracefully.
- [ ] Safety copy consistently states that all records are fictional and the app is a disaster-recovery demonstration, not production medical-data protection or automatic production failover.
- [ ] Route manifest, diagnostics, build configuration, README, and a saved checkpoint are present for managed hosting and GitHub connection.

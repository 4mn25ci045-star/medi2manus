import { useEffect, useMemo, useState } from 'react'
import { initialState } from './lib/data'
import { downloadSnapshot, loadPersistedState, persistState, sha256 } from './lib/storage'
import type { AppState, AuditEvent, Backup, Role, Section, Service, ServiceStatus } from './lib/types'

const navItems: Array<{ id: Section; label: string; icon: string; path: string }> = [
  { id: 'overview', label: 'Overview', icon: '⌂', path: '/' },
  { id: 'monitoring', label: 'System monitoring', icon: '◌', path: '/monitoring' },
  { id: 'recovery', label: 'Recovery center', icon: '↗', path: '/recovery' },
  { id: 'backups', label: 'Backup vault', icon: '▣', path: '/backups' },
  { id: 'cost', label: 'Cost estimator', icon: '◇', path: '/cost' },
  { id: 'audit', label: 'Audit log', icon: '≡', path: '/audit' },
  { id: 'runbook', label: 'Recovery runbook', icon: '✓', path: '/runbook' }
]

const sectionFromPath = (): Section => {
  const path = window.location.pathname
  return navItems.find((item) => item.path === path)?.id || 'overview'
}

const timeLabel = (iso?: string) => iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'
const dateLabel = (iso?: string) => iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
const relativeMinutes = (iso?: string) => iso ? Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)) : 0
const roleWeight: Record<Role, number> = { Viewer: 1, Operator: 2, Administrator: 3 }

function App() {
  const [state, setState] = useState<AppState>(() => initialState())
  const [section, setSection] = useState<Section>(sectionFromPath)
  const [connected, setConnected] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null)

  useEffect(() => {
    loadPersistedState().then(({ state: saved, connected: cloud }) => {
      if (saved) setState(saved)
      setConnected(cloud)
      setHydrated(true)
    })
  }, [])

  useEffect(() => {
    if (!hydrated) return
    persistState(state).then(({ connected: cloud }) => setConnected(cloud))
  }, [state, hydrated])

  useEffect(() => {
    const onPop = () => setSection(sectionFromPath())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 4200)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const navigate = (next: Section) => {
    const item = navItems.find((candidate) => candidate.id === next)
    if (!item) return
    window.history.pushState({}, '', item.path)
    setSection(next)
  }

  const appendAudit = (event: Omit<AuditEvent, 'id' | 'createdAt' | 'actor'>, actor = state.role) => ({
    id: `audit-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
    actor,
    ...event
  })

  const canOperate = roleWeight[state.role] >= roleWeight.Operator
  const canAdmin = state.role === 'Administrator'
  const primaryDown = state.mode === 'failed' || state.mode === 'recovering'
  const activeAlerts = state.alerts.filter((alert) => !alert.acknowledged)
  const availability = state.services.length ? Math.round(state.services.reduce((total, service) => total + service.health, 0) / state.services.length) : 0
  const latestBackup = state.backups[0]
  const prioritizedServices = useMemo(() => [...state.services].sort((a, b) => b.clinicalImpact - a.clinicalImpact || a.rtoMinutes - b.rtoMinutes), [state.services])

  const showToast = (tone: 'success' | 'error' | 'info', text: string) => setToast({ tone, text })

  const simulateFailure = () => {
    if (!canOperate) {
      const audit = appendAudit({ type: 'Failure simulation', result: 'Blocked', detail: 'Operator or Administrator role required.' })
      setState((current) => ({ ...current, audits: [audit, ...current.audits] }))
      showToast('error', 'Operator or Administrator role required for failure simulation.')
      return
    }
    if (primaryDown) return showToast('info', 'The primary data centre is already in a recovery state.')
    if (!window.confirm('Simulate a primary data-centre failure? This changes synthetic service state and creates an audit event.')) return
    const startedAt = new Date().toISOString()
    const audit = appendAudit({ type: 'Failure simulation', result: 'Success', detail: 'Primary data centre marked failed; clinical priority order generated.' })
    const alert = { id: `alert-${Date.now()}`, severity: 'critical' as const, title: 'Primary data centre unavailable', message: 'Synthetic failure detected. Clinical services are queued for recovery.', createdAt: startedAt }
    setState((current) => ({
      ...current,
      mode: 'failed',
      failureStartedAt: startedAt,
      services: current.services.map((service) => ({ ...service, status: 'Failed' as ServiceStatus, health: 0, lastHeartbeat: startedAt })),
      alerts: [alert, ...current.alerts],
      audits: [audit, ...current.audits]
    }))
    showToast('success', 'Failure simulation active. Recovery order is ready.')
  }

  const resolveSimulation = () => {
    if (!canOperate) return showToast('error', 'Operator or Administrator role required to resolve the simulation.')
    if (!window.confirm('Resolve the synthetic incident and restore all services to Online?')) return
    const audit = appendAudit({ type: 'Simulation resolved', result: 'Success', detail: 'Synthetic services returned to primary operating state.' })
    setState((current) => ({
      ...current,
      mode: 'primary',
      failureStartedAt: undefined,
      services: current.services.map((service) => ({ ...service, status: 'Online', health: 100, lastHeartbeat: new Date().toISOString() })),
      alerts: [{ id: `alert-${Date.now()}`, severity: 'info', title: 'Simulation resolved', message: 'Primary data centre demo state is healthy again.', createdAt: new Date().toISOString() }, ...current.alerts],
      audits: [audit, ...current.audits]
    }))
    showToast('success', 'Simulation resolved; synthetic services are healthy.')
  }

  const createBackup = async () => {
    if (!canOperate) return showToast('error', 'Operator or Administrator role required to create a backup.')
    setBusy('backup')
    try {
      const createdAt = new Date().toISOString()
      const snapshot = JSON.stringify({ schema: 'medirecover.synthetic.v1', createdAt, records: state.records }, null, 2)
      const hash = await sha256(snapshot)
      const backup: Backup = { id: `backup-${Date.now()}`, createdAt, hash, recordCount: state.records.length, snapshot, source: connected ? 'Supabase project' : 'Local browser vault' }
      const audit = appendAudit({ type: 'Backup created', result: 'Success', detail: `${backup.recordCount} synthetic records serialized; SHA-256 ${hash.slice(0, 16)}…` })
      setState((current) => ({ ...current, backups: [backup, ...current.backups], selectedBackupId: backup.id, lastBackupAt: createdAt, audits: [audit, ...current.audits] }))
      showToast('success', `Backup created and hashed: ${hash.slice(0, 12)}…`)
    } catch {
      showToast('error', 'Backup failed. No snapshot was saved.')
    } finally {
      setBusy(null)
    }
  }

  const verifyBackup = async (backup: Backup) => {
    setBusy(`verify-${backup.id}`)
    const actualHash = await sha256(backup.snapshot)
    const verified = actualHash === backup.hash
    const audit = appendAudit({ type: 'Backup verification', result: verified ? 'Success' : 'Blocked', detail: verified ? `Integrity verified for ${backup.id}.` : `Hash mismatch detected for ${backup.id}.` })
    setState((current) => ({
      ...current,
      backups: current.backups.map((candidate) => candidate.id === backup.id ? { ...candidate, verified, verifiedAt: new Date().toISOString() } : candidate),
      audits: [audit, ...current.audits]
    }))
    setBusy(null)
    showToast(verified ? 'success' : 'error', verified ? 'Snapshot integrity verified.' : 'Integrity mismatch detected.')
  }

  const restoreBackup = async (backup: Backup) => {
    if (!canOperate) return showToast('error', 'Operator or Administrator role required to restore a backup.')
    if (!backup.verified) return showToast('error', 'Verify the selected snapshot before restoring it.')
    setBusy(`restore-${backup.id}`)
    try {
      const parsed = JSON.parse(backup.snapshot) as { records: AppState['records'] }
      const differences = parsed.records.filter((record) => !state.records.some((current) => current.id === record.id && current.updatedAt === record.updatedAt)).length
      const startedAt = state.failureStartedAt || new Date().toISOString()
      const completedAt = new Date().toISOString()
      const durationSeconds = Math.max(1, Math.round((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000))
      const rtoTarget = Math.max(...state.services.map((service) => service.rtoMinutes)) * 60
      const audit = appendAudit({ type: 'Restore completed', result: 'Success', detail: `${parsed.records.length} records restored into a separate recovery dataset; ${differences} differences detected.` })
      setState((current) => ({
        ...current,
        mode: 'restored',
        restoredRecords: parsed.records,
        services: current.services.map((service) => ({ ...service, status: 'Restored', health: 100 })),
        recovery: { startedAt, completedAt, durationSeconds, restoredRecords: parsed.records.length, differences, rtoMet: durationSeconds <= rtoTarget, rpoMet: relativeMinutes(backup.createdAt) <= Math.max(...current.services.map((service) => service.rpoMinutes)) },
        audits: [audit, ...current.audits],
        alerts: [{ id: `alert-${Date.now()}`, severity: 'info', title: 'Recovery dataset restored', message: `${parsed.records.length} records are available in the isolated recovery dataset.`, createdAt: completedAt }, ...current.alerts]
      }))
      showToast('success', `${parsed.records.length} records restored to the recovery dataset.`)
    } catch {
      showToast('error', 'Restore failed because the snapshot could not be parsed.')
    } finally {
      setBusy(null)
    }
  }

  const changeRole = (role: Role) => {
    const audit = appendAudit({ type: 'Demo role changed', result: 'Info', detail: `Demo role switched from ${state.role} to ${role}.` }, role)
    setState((current) => ({ ...current, role, audits: [audit, ...current.audits] }))
    showToast('info', `Demo role is now ${role}. This is not production authentication.`)
  }

  const updateCost = (key: keyof AppState['costs'], value: number) => {
    if (!Number.isFinite(value) || value < 0) return
    setState((current) => ({ ...current, costs: { ...current.costs, [key]: value } }))
  }

  const selectBackup = (id: string) => setState((current) => ({ ...current, selectedBackupId: id }))
  const selectedBackup = state.backups.find((backup) => backup.id === state.selectedBackupId) || state.backups[0]

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark"><span>+</span><i /></div>
          <div><strong>MediRecover</strong><small>Resilience operations</small></div>
        </div>
        <div className="rail-label">Command center</div>
        <nav className="nav-list" aria-label="Primary navigation">
          {navItems.map((item) => <button key={item.id} className={`nav-item ${section === item.id ? 'active' : ''}`} onClick={() => navigate(item.id)}><span className="nav-icon">{item.icon}</span><span>{item.label}</span>{item.id === 'recovery' && primaryDown && <b className="nav-dot" />}</button>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="safety-card"><span className="shield">⌁</span><div><strong>Demo-safe data</strong><p>All records are fictional synthetic data.</p></div></div>
          <div className="sidebar-foot"><span className="pulse-dot" /> Primary data centre <span className={`mini-status ${primaryDown ? 'danger' : 'ok'}`}>{primaryDown ? 'IMPACTED' : 'HEALTHY'}</span></div>
        </div>
      </aside>

      <main className="main-canvas">
        <header className="topbar">
          <div className="breadcrumbs"><span>Operations</span><b>/</b><strong>{navItems.find((item) => item.id === section)?.label}</strong></div>
          <div className="topbar-actions">
            <div className={`connection-pill ${connected ? 'connected' : 'demo'}`}><span className="connection-dot" />{connected ? 'CLOUD CONNECTED' : 'DEMO MODE'}</div>
            <label className="role-select"><span>Role</span><select value={state.role} onChange={(event) => changeRole(event.target.value as Role)}><option>Viewer</option><option>Operator</option><option>Administrator</option></select></label>
            <div className="avatar">{state.role.slice(0, 1)}</div>
          </div>
        </header>

        <div className="page-content">
          <div className="page-heading">
            <div><div className="eyebrow">WEDNESDAY · 28 OCTOBER 2026 <span className="live-indicator"><i /> LIVE</span></div><h1>{section === 'overview' ? 'Recovery readiness at a glance' : navItems.find((item) => item.id === section)?.label}</h1><p>{section === 'overview' ? 'A calm operational view of your hospital network, backups, and recovery posture.' : section === 'recovery' ? 'Coordinate recovery in clinical order, with every action traceable.' : section === 'backups' ? 'Create, verify, and restore real synthetic snapshots without touching production records.' : 'Operational detail for the MediRecover disaster-recovery demonstration.'}</p></div>
            <div className="heading-actions"><button className="button secondary" onClick={() => navigate('backups')}>＋ New backup</button>{primaryDown ? <button className="button danger" onClick={resolveSimulation}>Resolve simulation</button> : <button className="button primary" onClick={simulateFailure}>Simulate data centre failure <span>↗</span></button>}</div>
          </div>

          {section === 'overview' && <Overview state={state} availability={availability} activeAlerts={activeAlerts.length} latestBackup={latestBackup} navigate={navigate} simulateFailure={simulateFailure} primaryDown={primaryDown} />}
          {section === 'monitoring' && <Monitoring state={state} />}
          {section === 'recovery' && <Recovery state={state} prioritizedServices={prioritizedServices} selectedBackup={selectedBackup} busy={busy} simulateFailure={simulateFailure} restoreBackup={restoreBackup} resolveSimulation={resolveSimulation} canOperate={canOperate} />}
          {section === 'backups' && <Backups state={state} selectedBackup={selectedBackup} busy={busy} createBackup={createBackup} verifyBackup={verifyBackup} restoreBackup={restoreBackup} selectBackup={selectBackup} canOperate={canOperate} />}
          {section === 'cost' && <CostEstimator costs={state.costs} updateCost={updateCost} canAdmin={canAdmin} />}
          {section === 'audit' && <AuditLog audits={state.audits} />}
          {section === 'runbook' && <Runbook />}

          <div className="footer-disclaimer"><span className="shield small">⌁</span><span><strong>Safety note:</strong> MediRecover is a disaster-recovery demonstration using fictional records. It is not production-grade medical data protection and does not perform automatic production failover.</span></div>
        </div>
        {toast && <div className={`toast ${toast.tone}`}><span>{toast.tone === 'success' ? '✓' : toast.tone === 'error' ? '!' : 'i'}</span>{toast.text}<button onClick={() => setToast(null)}>×</button></div>}
      </main>
    </div>
  )
}

function StatusBadge({ status }: { status: ServiceStatus }) {
  const label = status === 'Online' ? 'Operational' : status
  return <span className={`status-badge ${status.toLowerCase()}`}><i />{label}</span>
}

function MetricCard({ label, value, detail, icon, tone = 'blue' }: { label: string; value: string; detail: string; icon: string; tone?: string }) {
  return <div className={`metric-card ${tone}`}><div className="metric-top"><span>{label}</span><b>{icon}</b></div><strong>{value}</strong><small>{detail}</small></div>
}

function Overview({ state, availability, activeAlerts, latestBackup, navigate, simulateFailure, primaryDown }: { state: AppState; availability: number; activeAlerts: number; latestBackup?: Backup; navigate: (section: Section) => void; simulateFailure: () => void; primaryDown: boolean }) {
  const failedCount = state.services.filter((service) => service.status === 'Failed').length
  return <>
    <section className="metric-grid">
      <MetricCard label="Network availability" value={`${availability}%`} detail="Across 16 synthetic service nodes" icon="⌁" tone="blue" />
      <MetricCard label="Backup health" value={latestBackup?.verified ? 'Verified' : latestBackup ? 'Unverified' : 'Awaiting'} detail={latestBackup ? `${dateLabel(latestBackup.createdAt)} · ${latestBackup.recordCount} records` : 'Create your first snapshot'} icon="✓" tone={latestBackup?.verified ? 'green' : 'amber'} />
      <MetricCard label="Active alerts" value={String(activeAlerts).padStart(2, '0')} detail={activeAlerts ? 'Review before next recovery window' : 'No outstanding alerts'} icon="!" tone={activeAlerts ? 'coral' : 'green'} />
      <MetricCard label="Recovery readiness" value={state.recovery?.rtoMet ? 'On target' : primaryDown ? 'In progress' : 'Ready'} detail={state.recovery ? `${state.recovery.restoredRecords} records in recovery dataset` : 'RTO / RPO targets configured'} icon="↗" tone="violet" />
    </section>
    <section className="overview-grid">
      <div className="panel network-panel"><div className="panel-heading"><div><span className="section-kicker">Network footprint</span><h2>Hospital availability</h2></div><button className="text-button" onClick={() => navigate('monitoring')}>View monitoring ↗</button></div><div className="hospital-list">{state.hospitals.map((hospital) => <div className="hospital-row" key={hospital.id}><div className="hospital-avatar" style={{ background: `${hospital.accent}18`, color: hospital.accent }}>{hospital.name.split(' ').map((word) => word[0]).slice(0, 2).join('')}</div><div className="hospital-name"><strong>{hospital.name}</strong><span>{hospital.city} · {hospital.beds} beds</span></div><div className="health-track"><span style={{ width: `${primaryDown ? Math.max(18, hospital.uptime - 82) : hospital.uptime}%`, background: hospital.accent }} /></div><strong className="hospital-percent">{primaryDown ? '—' : `${hospital.uptime}%`}</strong><span className={`row-state ${primaryDown ? 'impacted' : ''}`}><i />{primaryDown ? 'Impacted' : 'Stable'}</span></div>)}</div><div className="network-foot"><span><i className="legend-dot blue" />Primary data centre</span><span><i className="legend-dot green" />Healthy nodes</span><span><i className="legend-dot coral" />Needs attention</span></div></div>
      <div className="panel alerts-panel"><div className="panel-heading"><div><span className="section-kicker">Signal stream</span><h2>Recent alerts</h2></div><button className="text-button" onClick={() => navigate('audit')}>Open audit ↗</button></div><div className="alert-list">{state.alerts.slice(0, 4).map((alert) => <div className="alert-row" key={alert.id}><span className={`alert-icon ${alert.severity}`}>{alert.severity === 'critical' ? '!' : alert.severity === 'warning' ? '△' : 'i'}</span><div><strong>{alert.title}</strong><span>{alert.message}</span><small>{dateLabel(alert.createdAt)}</small></div></div>)}</div></div>
      <div className="panel service-panel"><div className="panel-heading"><div><span className="section-kicker">Service spine</span><h2>Clinical services</h2></div><button className="text-button" onClick={() => navigate('recovery')}>Recovery order ↗</button></div><div className="service-mini-grid">{state.services.map((service, index) => <div className="service-mini" key={service.id}><div className="service-mini-top"><span className="service-index">0{index + 1}</span><StatusBadge status={service.status} /></div><strong>{service.name}</strong><span>{service.category}</span><div className="mini-bars">{[0, 1, 2, 3, 4, 5, 6].map((bar) => <i key={bar} className={service.status === 'Failed' ? 'failed' : ''} style={{ height: `${18 + ((bar + index * 7) % 6) * 7}%` }} />)}</div></div>)}</div></div>
      <div className="panel action-panel"><div className="action-badge">RECOVERY CONTROL</div><h2>{primaryDown ? 'Failure simulation is active' : 'Test your recovery posture'}</h2><p>{primaryDown ? `${failedCount} services are waiting for clinical recovery ordering.` : 'Run a safe, synthetic incident to validate priority, integrity, and audit behavior.'}</p><button className={`button ${primaryDown ? 'secondary' : 'primary'} full`} onClick={simulateFailure}>{primaryDown ? 'Open recovery center' : 'Simulate data centre failure'} <span>↗</span></button><div className="action-meta"><span><i className="pulse-dot" /> All actions are audit logged</span><span>RTO targets configured</span></div></div>
    </section>
  </>
}

function Monitoring({ state }: { state: AppState }) {
  return <section className="monitoring-stack"><div className="panel monitor-summary"><div className="summary-hero"><div className="server-orbit"><span className={state.mode === 'primary' ? 'online' : 'offline'}>✦</span><i /><b /></div><div><span className="section-kicker">Primary data centre</span><h2>{state.mode === 'primary' ? 'Serving normally' : state.mode === 'restored' ? 'Recovery dataset ready' : 'Availability impacted'}</h2><p>{state.mode === 'primary' ? 'All service heartbeats are within expected range.' : 'This state is synthetic and does not represent a production failover.'}</p></div></div><div className="summary-stats"><div><span>Heartbeat</span><strong>{state.mode === 'primary' ? '42 ms' : '—'}</strong></div><div><span>Service nodes</span><strong>{state.services.length} / {state.services.length}</strong></div><div><span>Last checked</span><strong>just now</strong></div></div></div><div className="panel"><div className="panel-heading"><div><span className="section-kicker">Synthetic service registry</span><h2>System health detail</h2></div><span className="table-note">Fictional records only</span></div><div className="table-wrap"><table><thead><tr><th>Service</th><th>Category</th><th>Status</th><th>Health</th><th>Last heartbeat</th><th>Recovery target</th></tr></thead><tbody>{state.services.map((service) => <tr key={service.id}><td><strong>{service.name}</strong><span className="cell-sub">{service.description}</span></td><td>{service.category}</td><td><StatusBadge status={service.status} /></td><td><div className="table-health"><span><i style={{ width: `${service.health}%` }} /></span><b>{service.health}%</b></div></td><td>{service.status === 'Failed' ? 'No signal' : `${relativeMinutes(service.lastHeartbeat)}m ago`}</td><td>RTO {service.rtoMinutes}m · RPO {service.rpoMinutes}m</td></tr>)}</tbody></table></div></div></section>
}

function Recovery({ state, prioritizedServices, selectedBackup, busy, simulateFailure, restoreBackup, resolveSimulation, canOperate }: { state: AppState; prioritizedServices: Service[]; selectedBackup?: Backup; busy: string | null; simulateFailure: () => void; restoreBackup: (backup: Backup) => void; resolveSimulation: () => void; canOperate: boolean }) {
  const duration = state.recovery?.durationSeconds ? `${Math.floor(state.recovery.durationSeconds / 60)}m ${state.recovery.durationSeconds % 60}s` : '—'
  return <section className="recovery-stack"><div className={`incident-banner ${state.mode === 'primary' ? 'ready' : 'active'}`}><div className="incident-icon">{state.mode === 'primary' ? '✓' : '!'}</div><div><span className="section-kicker">{state.mode === 'primary' ? 'Recovery posture' : 'Synthetic incident active'}</span><h2>{state.mode === 'primary' ? 'Ready to test a controlled incident' : state.mode === 'restored' ? 'Recovery dataset restored successfully' : 'Primary data centre failure simulated'}</h2><p>{state.mode === 'primary' ? 'The priority engine will rank services by clinical impact and recovery target.' : state.mode === 'restored' ? 'Restored records are isolated from the primary dataset for comparison.' : 'Follow the ordered recovery plan below. Every transition is logged.'}</p></div><div className="incident-actions">{state.mode === 'primary' ? <button className="button primary" onClick={simulateFailure}>Start simulation</button> : state.mode === 'restored' ? <button className="button secondary" onClick={resolveSimulation}>Reset demo state</button> : <button className="button secondary" onClick={resolveSimulation}>Resolve simulation</button>}</div></div><div className="recovery-metrics"><div><span>RTO status</span><strong className={state.recovery?.rtoMet ? 'positive' : ''}>{state.recovery ? state.recovery.rtoMet ? 'Met' : 'Not met' : 'Pending'}</strong><small>{state.recovery ? duration : 'Target based on clinical service SLAs'}</small></div><div><span>RPO status</span><strong className={state.recovery?.rpoMet ? 'positive' : ''}>{state.recovery ? state.recovery.rpoMet ? 'Met' : 'Review' : 'Pending'}</strong><small>{state.recovery ? `${state.recovery.restoredRecords} records restored` : 'Target based on latest backup age'}</small></div><div><span>Recovery dataset</span><strong>{state.restoredRecords.length || '—'}</strong><small>Separate from primary records</small></div><div><span>Plan state</span><strong>{state.mode === 'primary' ? 'Standby' : state.mode[0].toUpperCase() + state.mode.slice(1)}</strong><small>Manual demo control</small></div></div><div className="panel priority-panel"><div className="panel-heading"><div><span className="section-kicker">Clinical ordering engine</span><h2>Recovery priority queue</h2><p className="heading-note">Deterministic order: clinical impact first, then shorter RTO.</p></div><span className="priority-count">{prioritizedServices.length} services</span></div><div className="priority-list">{prioritizedServices.map((service, index) => <div className="priority-row" key={service.id}><div className="priority-rank">{String(index + 1).padStart(2, '0')}</div><div className="priority-main"><div><strong>{service.name}</strong><span>{service.category} · clinical impact {service.clinicalImpact}/100</span></div><StatusBadge status={service.status} /><div className="priority-progress"><span><i style={{ width: `${service.clinicalImpact}%` }} /></span><b>RTO {service.rtoMinutes}m</b><b>RPO {service.rpoMinutes}m</b></div><p>{service.recoveryReason}</p></div></div>)}</div></div><div className="recovery-bottom"><div className="panel restore-card"><div className="panel-heading"><div><span className="section-kicker">Controlled restore</span><h2>Use a verified snapshot</h2></div><span className="hash-lock">⌁ SHA-256</span></div>{selectedBackup ? <><div className="selected-snapshot"><span className="snapshot-icon">▣</span><div><strong>{dateLabel(selectedBackup.createdAt)} snapshot</strong><span>{selectedBackup.recordCount} synthetic records · {selectedBackup.verified ? 'Integrity verified' : 'Verification required'}</span></div><code>{selectedBackup.hash.slice(0, 18)}…</code></div><button className="button primary full" disabled={!canOperate || !selectedBackup.verified || Boolean(busy)} onClick={() => restoreBackup(selectedBackup)}>{busy?.startsWith('restore') ? 'Restoring records…' : 'Restore to recovery dataset ↗'}</button><small className="limitation">Restore never flips a status only: it parses the JSON snapshot into a separate dataset and compares records.</small></> : <div className="empty-state"><span>▣</span><p>Create and verify a backup before restoring.</p></div>}</div><div className="panel limitations-card"><span className="section-kicker">Operational limitations</span><h2>What this demo measures</h2><p>Measured timestamps, hash integrity, restored record counts, and configured RTO/RPO comparisons are real within this demonstration. Production network latency, storage durability, and failover orchestration are not simulated.</p><div className="limitation-list"><span>✓ Browser Web Crypto hash</span><span>✓ Separate recovery dataset</span><span>✓ Timestamped audit events</span><span>! No automatic production failover</span></div></div></div></section>
}

function Backups({ state, selectedBackup, busy, createBackup, verifyBackup, restoreBackup, selectBackup, canOperate }: { state: AppState; selectedBackup?: Backup; busy: string | null; createBackup: () => void; verifyBackup: (backup: Backup) => void; restoreBackup: (backup: Backup) => void; selectBackup: (id: string) => void; canOperate: boolean }) {
  return <section className="backup-stack"><div className="backup-hero"><div><span className="section-kicker">Snapshot integrity</span><h2>Backup vault</h2><p>Real JSON snapshots and SHA-256 checksums for fictional synthetic records.</p></div><button className="button primary" onClick={createBackup} disabled={!canOperate || busy === 'backup'}>{busy === 'backup' ? 'Creating snapshot…' : 'Create verified backup ↗'}</button></div><div className="backup-grid"><div className="panel backup-list-panel"><div className="panel-heading"><div><span className="section-kicker">Snapshot history</span><h2>{state.backups.length} backups</h2></div><span className="table-note">Persisted {state.backups.length ? 'locally + cloud' : 'on first save'}</span></div>{state.backups.length ? <div className="backup-list">{state.backups.map((backup) => <button className={`backup-row ${selectedBackup?.id === backup.id ? 'selected' : ''}`} key={backup.id} onClick={() => selectBackup(backup.id)}><span className="snapshot-icon">▣</span><span className="backup-row-main"><strong>{dateLabel(backup.createdAt)}</strong><small>{backup.recordCount} records · {backup.source}</small></span><span className={`verify-chip ${backup.verified ? 'verified' : ''}`}>{backup.verified ? '✓ Verified' : 'Needs verify'}</span></button>)}</div> : <div className="empty-state large"><span>▣</span><strong>No snapshots yet</strong><p>Create a backup to start the integrity workflow.</p></div>}</div><div className="panel backup-detail-panel">{selectedBackup ? <><div className="panel-heading"><div><span className="section-kicker">Selected snapshot</span><h2>Integrity details</h2></div><span className={`verify-chip ${selectedBackup.verified ? 'verified' : ''}`}>{selectedBackup.verified ? '✓ Verified' : 'Needs verify'}</span></div><div className="detail-grid"><div><span>Created</span><strong>{dateLabel(selectedBackup.createdAt)}</strong></div><div><span>Records</span><strong>{selectedBackup.recordCount}</strong></div><div><span>Storage</span><strong>{(selectedBackup.snapshot.length / 1024).toFixed(1)} KB</strong></div><div><span>Source</span><strong>{selectedBackup.source}</strong></div></div><div className="hash-box"><span>SHA-256 integrity hash</span><code>{selectedBackup.hash}</code></div><div className="backup-actions"><button className="button secondary" onClick={() => verifyBackup(selectedBackup)} disabled={busy?.startsWith('verify')}>{busy?.startsWith('verify') ? 'Verifying…' : 'Verify snapshot'}</button><button className="button secondary" onClick={() => downloadSnapshot(selectedBackup.snapshot, `medirecover-${selectedBackup.id}.json`)}>Download JSON</button><button className="button primary" onClick={() => restoreBackup(selectedBackup)} disabled={!canOperate || !selectedBackup.verified || busy?.startsWith('restore')}>{busy?.startsWith('restore') ? 'Restoring…' : 'Restore dataset'}</button></div><p className="detail-note">The snapshot is a real serialized JSON document. Verification recomputes the digest in the browser with Web Crypto before any restore is allowed.</p></> : <div className="empty-state large"><span>⌁</span><strong>Select a snapshot</strong><p>Your integrity details will appear here.</p></div>}</div></div></section>
}

function CostEstimator({ costs, updateCost, canAdmin }: { costs: AppState['costs']; updateCost: (key: keyof AppState['costs'], value: number) => void; canAdmin: boolean }) {
  const monthly = costs.storageGb * costs.storageRate + costs.computeHours * costs.computeRate + costs.frequencyPerDay * 30 * 0.04
  return <section className="cost-stack"><div className="cost-layout"><div className="panel cost-inputs"><div className="panel-heading"><div><span className="section-kicker">Illustrative planning tool</span><h2>Monthly cloud estimate</h2></div><span className="estimate-pill">Not a quote</span></div><div className="cost-total"><span>Estimated monthly total</span><strong>${monthly.toFixed(2)}</strong><small>Illustrative USD assumption · recalculates instantly</small></div><div className="form-grid"><label>Storage volume (GB)<input type="number" min="0" value={costs.storageGb} onChange={(event) => updateCost('storageGb', Number(event.target.value))} disabled={!canAdmin} /></label><label>Compute hours / month<input type="number" min="0" value={costs.computeHours} onChange={(event) => updateCost('computeHours', Number(event.target.value))} disabled={!canAdmin} /></label><label>Backups / day<input type="number" min="0" value={costs.frequencyPerDay} onChange={(event) => updateCost('frequencyPerDay', Number(event.target.value))} disabled={!canAdmin} /></label><label>Storage rate ($ / GB-month)<input type="number" min="0" step="0.001" value={costs.storageRate} onChange={(event) => updateCost('storageRate', Number(event.target.value))} disabled={!canAdmin} /></label><label>Compute rate ($ / hour)<input type="number" min="0" step="0.01" value={costs.computeRate} onChange={(event) => updateCost('computeRate', Number(event.target.value))} disabled={!canAdmin} /></label></div>{!canAdmin && <p className="form-note">Administrator demo role required to change assumptions. Role switching is a demo-only control, not authentication.</p>}</div><div className="panel cost-breakdown"><span className="section-kicker">Assumption breakdown</span><h2>Where the estimate comes from</h2><div className="cost-bars"><div><span><b>Storage</b><small>${(costs.storageGb * costs.storageRate).toFixed(2)}</small></span><i><em style={{ width: `${Math.min(100, (costs.storageGb * costs.storageRate / monthly) * 100) || 0}%` }} /></i></div><div><span><b>Compute</b><small>${(costs.computeHours * costs.computeRate).toFixed(2)}</small></span><i><em style={{ width: `${Math.min(100, (costs.computeHours * costs.computeRate / monthly) * 100) || 0}%` }} /></i></div><div><span><b>Backup operations</b><small>${(costs.frequencyPerDay * 30 * 0.04).toFixed(2)}</small></span><i><em style={{ width: `${Math.min(100, ((costs.frequencyPerDay * 30 * 0.04) / monthly) * 100) || 0}%` }} /></i></div></div><div className="assumption-note"><strong>Documented assumptions</strong><p>Storage uses $0.023/GB-month, compute uses $0.12/hour, and each backup operation uses an indicative $0.04. Rates are editable planning assumptions, not provider pricing or a quote.</p></div></div></div></section>
}

function AuditLog({ audits }: { audits: AuditEvent[] }) {
  return <section className="panel audit-panel"><div className="panel-heading"><div><span className="section-kicker">Traceability</span><h2>Audit log</h2><p className="heading-note">Append-only events for simulation, backup, verification, restore, and admin changes.</p></div><span className="table-note">{audits.length} events</span></div><div className="audit-list">{audits.map((event) => <div className="audit-row" key={event.id}><span className={`audit-marker ${event.result.toLowerCase()}`}>{event.result === 'Success' ? '✓' : event.result === 'Blocked' ? '!' : 'i'}</span><div className="audit-main"><div><strong>{event.type}</strong><span className={`result-label ${event.result.toLowerCase()}`}>{event.result}</span></div><p>{event.detail}</p></div><div className="audit-meta"><strong>{event.actor}</strong><span>{dateLabel(event.createdAt)}</span></div></div>)}</div></section>
}

function Runbook() {
  const steps = [
    ['01', 'Declare and scope', 'Incident commander', 'Confirm synthetic incident scope, open the audit trail, and record the last known healthy heartbeat.'],
    ['02', 'Protect the evidence', 'Platform operator', 'Freeze the affected primary path, select the latest verified snapshot, and keep the original hash visible.'],
    ['03', 'Recover clinical core', 'Clinical systems lead', 'Restore patient records first, then laboratory reports and pharmacy records according to the priority queue.'],
    ['04', 'Validate the dataset', 'Platform operator', 'Compare record counts and differences, verify the restored dataset is isolated, and log the measured duration.'],
    ['05', 'Communicate and resolve', 'Incident commander', 'Review RTO/RPO results, confirm downstream teams can work, and resolve only after the checklist is complete.']
  ]
  return <section className="runbook-layout"><div className="panel runbook-intro"><span className="section-kicker">Three-person IT team</span><h2>Recovery runbook</h2><p>A concise, human-led sequence for this demonstration. Owners are explicit so that a calm response does not depend on tribal knowledge.</p><div className="team-avatars"><span>IC</span><span>PS</span><span>CS</span><div><strong>Incident commander · Platform operator · Clinical systems lead</strong><small>Assign named people in your production procedure.</small></div></div><div className="runbook-callout"><strong>Operating principle</strong><p>Recover in clinical order, verify before restore, and record every meaningful transition.</p></div></div><div className="panel runbook-steps"><div className="panel-heading"><div><span className="section-kicker">Checklist</span><h2>Step-by-step response</h2></div><span className="table-note">5 steps</span></div>{steps.map(([number, title, owner, detail]) => <div className="runbook-step" key={number}><span className="step-number">{number}</span><div><div className="step-title"><strong>{title}</strong><span>{owner}</span></div><p>{detail}</p><label><input type="checkbox" /> Mark complete in tabletop exercise</label></div></div>)}</div></section>
}

export default App

import type { AppState, Hospital, Service, SyntheticRecord } from './types'

const now = new Date()
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString()

export const hospitals: Hospital[] = [
  { id: 'h-01', name: 'Northstar General', city: 'Aurora', beds: 420, uptime: 99.98, accent: '#2563eb' },
  { id: 'h-02', name: 'Riverside Women & Children', city: 'Brookhaven', beds: 280, uptime: 99.94, accent: '#0ea5e9' },
  { id: 'h-03', name: 'Pinecrest Surgical', city: 'Fairview', beds: 190, uptime: 99.91, accent: '#14b8a6' },
  { id: 'h-04', name: 'Harborview Community', city: 'Lakeside', beds: 145, uptime: 99.87, accent: '#6366f1' }
]

export const services: Service[] = [
  { id: 'svc-patient', name: 'Patient records', category: 'Clinical core', description: 'Admissions, encounters, allergies, and care-team access', status: 'Online', health: 100, lastHeartbeat: ago(1), clinicalImpact: 100, rtoMinutes: 15, rpoMinutes: 5, recoveryReason: 'Directly supports safe clinical decisions and continuity of care.' },
  { id: 'svc-lab', name: 'Laboratory reports', category: 'Diagnostics', description: 'Results, specimen status, and critical-value routing', status: 'Online', health: 100, lastHeartbeat: ago(2), clinicalImpact: 92, rtoMinutes: 25, rpoMinutes: 10, recoveryReason: 'Critical results must be available before treatment decisions.' },
  { id: 'svc-pharmacy', name: 'Pharmacy records', category: 'Medication safety', description: 'Medication orders, dispensing, and reconciliation', status: 'Online', health: 99, lastHeartbeat: ago(3), clinicalImpact: 88, rtoMinutes: 30, rpoMinutes: 15, recoveryReason: 'Medication continuity reduces avoidable prescribing and dispensing risk.' },
  { id: 'svc-admin', name: 'Administration', category: 'Operations', description: 'Scheduling, billing, rostering, and back-office workflows', status: 'Online', health: 98, lastHeartbeat: ago(5), clinicalImpact: 55, rtoMinutes: 60, rpoMinutes: 30, recoveryReason: 'Important for throughput, but can follow the clinical recovery path.' }
]

const recordTemplates: Array<[SyntheticRecord['category'], string, string]> = [
  ['Patient records', 'Encounter ledger', 'Fictional patient cohort · continuity index'],
  ['Patient records', 'Allergy registry', 'Fictional patient cohort · safety flags'],
  ['Laboratory reports', 'Critical values queue', 'Synthetic chemistry panel · routing state'],
  ['Laboratory reports', 'Specimen tracking', 'Synthetic samples · chain-of-custody state'],
  ['Pharmacy records', 'Medication orders', 'Synthetic order set · reconciliation state'],
  ['Pharmacy records', 'Dispensing ledger', 'Synthetic dispensations · inventory state'],
  ['Administration', 'Roster and scheduling', 'Synthetic roster · staffing continuity'],
  ['Administration', 'Revenue cycle', 'Synthetic claims batch · administrative continuity']
]

export const records: SyntheticRecord[] = recordTemplates.map(([category, title, detail], index) => ({
  id: `rec-${String(index + 1).padStart(3, '0')}`,
  hospitalId: hospitals[index % hospitals.length].id,
  category,
  title,
  detail,
  updatedAt: ago(index + 2)
}))

export const initialState = (): AppState => ({
  role: 'Administrator',
  mode: 'primary',
  records,
  hospitals,
  services,
  backups: [],
  alerts: [
    { id: 'alert-boot', severity: 'info', title: 'Backup verification window open', message: 'The last synthetic snapshot is ready for verification once a backup is created.', createdAt: ago(24) }
  ],
  audits: [
    { id: 'audit-boot', type: 'System initialized', actor: 'Administrator', result: 'Info', detail: 'MediRecover demo dataset loaded with fictional records.', createdAt: ago(24) }
  ],
  restoredRecords: [],
  costs: { storageGb: 250, computeHours: 36, frequencyPerDay: 4, storageRate: 0.023, computeRate: 0.12 }
})

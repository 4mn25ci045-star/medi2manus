export type Role = 'Viewer' | 'Operator' | 'Administrator'
export type ServiceStatus = 'Online' | 'Failed' | 'Recovering' | 'Restored'
export type Section = 'overview' | 'monitoring' | 'recovery' | 'backups' | 'cost' | 'audit' | 'runbook'

export interface Hospital {
  id: string
  name: string
  city: string
  beds: number
  uptime: number
  accent: string
}

export interface Service {
  id: string
  name: string
  category: string
  description: string
  status: ServiceStatus
  health: number
  lastHeartbeat: string
  clinicalImpact: number
  rtoMinutes: number
  rpoMinutes: number
  recoveryReason: string
}

export interface SyntheticRecord {
  id: string
  hospitalId: string
  category: 'Patient records' | 'Laboratory reports' | 'Pharmacy records' | 'Administration'
  title: string
  detail: string
  updatedAt: string
}

export interface Backup {
  id: string
  createdAt: string
  hash: string
  recordCount: number
  snapshot: string
  verifiedAt?: string
  verified?: boolean
  source: 'Local browser vault' | 'Supabase project'
}

export interface Alert {
  id: string
  severity: 'critical' | 'warning' | 'info'
  title: string
  message: string
  createdAt: string
  acknowledged?: boolean
}

export interface AuditEvent {
  id: string
  type: string
  actor: Role
  result: 'Success' | 'Blocked' | 'Info'
  detail: string
  createdAt: string
}

export interface RecoveryMetrics {
  startedAt?: string
  completedAt?: string
  durationSeconds?: number
  restoredRecords: number
  differences: number
  rtoMet?: boolean
  rpoMet?: boolean
}

export interface AppState {
  role: Role
  mode: 'primary' | 'failed' | 'recovering' | 'restored'
  records: SyntheticRecord[]
  hospitals: Hospital[]
  services: Service[]
  backups: Backup[]
  alerts: Alert[]
  audits: AuditEvent[]
  restoredRecords: SyntheticRecord[]
  selectedBackupId?: string
  failureStartedAt?: string
  recovery?: RecoveryMetrics
  lastBackupAt?: string
  costs: { storageGb: number; computeHours: number; frequencyPerDay: number; storageRate: number; computeRate: number }
}

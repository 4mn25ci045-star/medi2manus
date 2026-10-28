import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { AppState } from './types'

const LOCAL_KEY = 'medirecover-state-v1'
let connectionPromise: Promise<{ client?: SupabaseClient; connected: boolean }> | undefined

async function getConnection() {
  if (!connectionPromise) {
    connectionPromise = fetch('/api/config')
      .then((response) => response.json())
      .then(({ supabaseUrl, supabasePublishableKey }) => {
        if (!supabaseUrl || !supabasePublishableKey) return { connected: false }
        return { client: createClient(supabaseUrl, supabasePublishableKey), connected: true }
      })
      .catch(() => ({ connected: false }))
  }
  return connectionPromise
}

export async function loadPersistedState(): Promise<{ state?: AppState; connected: boolean }> {
  const local = window.localStorage.getItem(LOCAL_KEY)
  const localState = local ? (JSON.parse(local) as AppState) : undefined
  const { client, connected } = await getConnection()
  if (!client) return { state: localState, connected: false }
  const { data, error } = await client.from('mr_app_state').select('state').eq('id', 1).maybeSingle()
  if (!error && data?.state) return { state: data.state as AppState, connected: true }
  return { state: localState, connected: true }
}

export async function persistState(state: AppState): Promise<{ connected: boolean }> {
  window.localStorage.setItem(LOCAL_KEY, JSON.stringify(state))
  const { client, connected } = await getConnection()
  if (!client) return { connected: false }
  const { error } = await client.from('mr_app_state').upsert({ id: 1, state, updated_at: new Date().toISOString() })
  return { connected: !error }
}

export async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function downloadSnapshot(snapshot: string, filename: string) {
  const blob = new Blob([snapshot], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

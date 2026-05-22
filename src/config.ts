import * as fs from 'fs'
import * as path from 'path'

export interface TeamMember {
  name: string
  phone: string
  /** ID interno de WhatsApp en grupos (formato @lid). Se obtiene de los logs. */
  lid?: string
}

export interface ClientGroup {
  id: string
  clientName: string
  responsiblePhone?: string
}

export interface AppConfig {
  teamGroupId: string
  teamMembers: TeamMember[]
  clientGroups: ClientGroup[]
  checkIntervalHours: number
  minWaitMinutes: number
  pendingPhrases: string[]
}

let cached: AppConfig | null = null

export function loadConfig(): AppConfig {
  if (cached) return cached

  const configPath = path.resolve('./config.json')

  if (!fs.existsSync(configPath)) {
    console.error('\n❌ No se encontró config.json')
    process.exit(1)
  }

  try {
    cached = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as AppConfig
    return cached
  } catch (err) {
    console.error('❌ Error parseando config.json:', err)
    process.exit(1)
  }
}

export function getConfig(): AppConfig {
  return loadConfig()
}

export function findTeamMember(jid: string): TeamMember | undefined {
  const config = getConfig()
  // Extraemos solo los dígitos antes del @
  const id = jid.split('@')[0]
  return config.teamMembers.find(m => m.phone === id || m.lid === id)
}

/**
 * Devuelve true si el JID corresponde a un miembro del equipo.
 * Compara tanto por número de teléfono (@s.whatsapp.net)
 * como por LID (@lid) — el nuevo formato interno de WhatsApp en grupos.
 */
export function isTeamPhone(jid: string): boolean {
  const config = getConfig()
  const id = jid.split('@')[0]
  return config.teamMembers.some(m => m.phone === id || (m.lid && m.lid === id))
}
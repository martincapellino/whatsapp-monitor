import * as fs from 'fs'
import * as path from 'path'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface TeamMember {
  name: string
  /** Solo dígitos con código de país. Ej: "5491112345678" */
  phone: string
}

export interface ClientGroup {
  /** ID del grupo en WhatsApp. Formato: "120363XXXX@g.us" */
  id: string
  /**
   * Nombre del cliente en formato slug. Se usa como hashtag en el resumen.
   * Ej: "alvaro-larraz" → aparece como #alvaro-larraz
   */
  clientName: string
  /**
   * Teléfono del miembro del equipo responsable de este grupo.
   * Si no se define, se detecta automáticamente por el último mensaje del equipo.
   */
  responsiblePhone?: string
}

export interface AppConfig {
  /** ID del grupo interno del equipo donde se mandan los avisos */
  teamGroupId: string
  /** Miembros del equipo (nombre + teléfono para @menciones) */
  teamMembers: TeamMember[]
  /** Grupos de clientes a monitorear */
  clientGroups: ClientGroup[]
  /** Cada cuántas horas revisar */
  checkIntervalHours: number
  /**
   * Minutos sin respuesta para considerar algo como pendiente.
   * 90 min evita falsos positivos por cosas que acaban de llegar.
   */
  minWaitMinutes: number
  /** Frases que indican "lo vemos después" */
  pendingPhrases: string[]
}

// ─── Carga ────────────────────────────────────────────────────────────────────

let cached: AppConfig | null = null

export function loadConfig(): AppConfig {
  if (cached) return cached

  const configPath = path.resolve('./config.json')

  if (!fs.existsSync(configPath)) {
    console.error('\n❌ No se encontró config.json')
    console.error('   1. Copiá config.example.json → config.json')
    console.error('   2. Completá los IDs de grupos (npm run list-groups te los da)')
    console.error('   3. Completá los teléfonos del equipo\n')
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

/** Busca un miembro del equipo por su número de teléfono */
export function findTeamMember(phone: string): TeamMember | undefined {
  const config = getConfig()
  const normalized = phone.split('@')[0] // por si viene como JID
  return config.teamMembers.find(m => m.phone === normalized)
}

/** Devuelve true si el JID dado corresponde a un miembro del equipo */
export function isTeamPhone(jid: string): boolean {
  const config = getConfig()
  const phone = jid.split('@')[0]
  return config.teamMembers.some(m => m.phone === phone)
}

import * as fs from 'fs'
import * as path from 'path'

export interface TeamMember {
  name: string
  phone: string
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

  // Prioridad 1: variable de entorno APP_CONFIG (producción en Fly.io)
  if (process.env.APP_CONFIG) {
    try {
      cached = JSON.parse(process.env.APP_CONFIG) as AppConfig
      console.log('   Fuente: variable de entorno APP_CONFIG')
      return cached
    } catch (err) {
      console.error('❌ Error parseando APP_CONFIG:', err)
      process.exit(1)
    }
  }

  // Prioridad 2: config.json local (desarrollo)
  const configPath = path.resolve('./config.json')
  if (!fs.existsSync(configPath)) {
    console.error('\n❌ No se encontró config.json ni APP_CONFIG')
    process.exit(1)
  }

  try {
    cached = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as AppConfig
    console.log('   Fuente: config.json')
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
  const id = jid.split('@')[0].trim()
  return config.teamMembers.find(m =>
    m.phone === id ||
    (m.lid && m.lid.split('@')[0].trim() === id)
  )
}

export function isTeamPhone(jid: string): boolean {
  const config = getConfig()
  const id = jid.split('@')[0].trim()
  return config.teamMembers.some(m =>
    m.phone === id ||
    (m.lid && m.lid.split('@')[0].trim() === id)
  )
}
import * as fs from 'fs'
import * as path from 'path'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface StoredMessage {
  id: string
  groupId: string
  senderJid: string
  isFromTeam: boolean
  text: string
  timestamp: number
  isPendingPhrase: boolean
}

interface ResolvedGroup {
  clientName: string
  resolvedAt: number
  resolvedBy: string
}

// ─── Config de storage ───────────────────────────────────────────────────────

const DATA_DIR = path.resolve('./data')
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json')
const RESOLVED_FILE = path.join(DATA_DIR, 'resolved.json')
const RETENTION_HOURS = 48

// ─── Funciones internas ───────────────────────────────────────────────────────

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

function load(): StoredMessage[] {
  ensureDir()
  if (!fs.existsSync(MESSAGES_FILE)) return []
  try {
    return JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf-8')) as StoredMessage[]
  } catch {
    return []
  }
}

function save(messages: StoredMessage[]) {
  ensureDir()
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2), 'utf-8')
}

function loadResolved(): ResolvedGroup[] {
  ensureDir()
  if (!fs.existsSync(RESOLVED_FILE)) return []
  try {
    return JSON.parse(fs.readFileSync(RESOLVED_FILE, 'utf-8')) as ResolvedGroup[]
  } catch {
    return []
  }
}

function saveResolved(resolved: ResolvedGroup[]) {
  ensureDir()
  fs.writeFileSync(RESOLVED_FILE, JSON.stringify(resolved, null, 2), 'utf-8')
}

// ─── Mensajes ─────────────────────────────────────────────────────────────────

export function addMessage(msg: StoredMessage): void {
  const messages = load()
  if (messages.some(m => m.id === msg.id)) return
  messages.push(msg)
  const cutoff = Date.now() - RETENTION_HOURS * 60 * 60 * 1000
  save(messages.filter(m => m.timestamp > cutoff))
}

export function getGroupMessages(groupId: string, sinceMs: number): StoredMessage[] {
  return load()
    .filter(m => m.groupId === groupId && m.timestamp >= sinceMs)
    .sort((a, b) => a.timestamp - b.timestamp)
}

// ─── Grupos resueltos ─────────────────────────────────────────────────────────

/**
 * Marca un grupo como resuelto manualmente.
 * El equipo lo hace enviando "#nombre-cliente listo" en el grupo del equipo.
 */
export function markResolved(clientName: string, resolvedBy: string): void {
  const resolved = loadResolved().filter(r => r.clientName !== clientName)
  resolved.push({ clientName, resolvedAt: Date.now(), resolvedBy })
  saveResolved(resolved)
  console.log(`✅ Marcado como resuelto: #${clientName} (por ${resolvedBy})`)
}

/**
 * Limpia la resolución cuando el cliente vuelve a escribir algo nuevo.
 * Así el sistema vuelve a monitorear ese grupo.
 */
export function clearResolved(clientName: string): void {
  const before = loadResolved().length
  const resolved = loadResolved().filter(r => r.clientName !== clientName)
  if (resolved.length < before) {
    saveResolved(resolved)
    console.log(`🔄 Resolución limpiada: #${clientName} (el cliente escribió de nuevo)`)
  }
}

/** Devuelve true si el grupo está marcado como resuelto */
export function isResolved(clientName: string): boolean {
  return loadResolved().some(r => r.clientName === clientName)
}
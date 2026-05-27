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
  /** JID del mensaje al que responde (si es una respuesta) */
  quotedSenderJid?: string
  /** JIDs mencionados en el mensaje */
  mentionedJids?: string[]
}

interface ResolvedGroup {
  clientName: string
  resolvedAt: number
  resolvedBy: string
}

// ─── Config de storage ───────────────────────────────────────────────────────

const DATA_DIR = process.env.AUTH_DIR
  ? path.join(path.dirname(process.env.AUTH_DIR), 'messages')
  : path.resolve('./data')

const MESSAGES_FILE = path.join(
  process.env.AUTH_DIR ? path.dirname(process.env.AUTH_DIR) : './data',
  'messages.json'
)
const RESOLVED_FILE = path.join(
  process.env.AUTH_DIR ? path.dirname(process.env.AUTH_DIR) : './data',
  'resolved.json'
)
const RETENTION_HOURS = 48

// ─── Funciones internas ───────────────────────────────────────────────────────

function ensureDir() {
  const dir = path.dirname(MESSAGES_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
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

export function getMessageById(id: string): StoredMessage | undefined {
  return load().find(m => m.id === id)
}

// ─── Grupos resueltos ─────────────────────────────────────────────────────────

export function markResolved(clientName: string, resolvedBy: string): void {
  const resolved = loadResolved().filter(r => r.clientName !== clientName)
  resolved.push({ clientName, resolvedAt: Date.now(), resolvedBy })
  saveResolved(resolved)
  console.log(`✅ Marcado como resuelto: #${clientName} (por ${resolvedBy})`)
}

export function clearResolved(clientName: string): void {
  const before = loadResolved().length
  const resolved = loadResolved().filter(r => r.clientName !== clientName)
  if (resolved.length < before) {
    saveResolved(resolved)
  }
}

export function isResolved(clientName: string): boolean {
  return loadResolved().some(r => r.clientName === clientName)
}
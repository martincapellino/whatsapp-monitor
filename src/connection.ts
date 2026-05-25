import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  WASocket,
  proto,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import pino from 'pino'
import { addMessage, markResolved, clearResolved } from './storage'
import { hasPendingPhrase, checkPendingIssues } from './monitor'
import { sendSummaryToTeam } from './notifier'
import { isTeamPhone, getConfig } from './config'

const AUTH_DIR = process.env.AUTH_DIR || './auth_info'

let sock: WASocket | null = null

export function getSocket(): WASocket | null {
  return sock
}

export async function connectToWhatsApp(): Promise<WASocket> {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
  const { version } = await fetchLatestBaileysVersion()
  const logger = pino({ level: 'silent' })

  sock = makeWASocket({
    version,
    logger,
    auth: state,
    printQRInTerminal: false,
    syncFullHistory: false,
    getMessage: async () => undefined,
    fireInitQueries: true,
    emitOwnEvents: true,
    shouldIgnoreJid: () => false,
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode
      const isLoggedOut = statusCode === DisconnectReason.loggedOut

      if (isLoggedOut) {
        console.log('\n⚠️  Sesión cerrada. Reconectando para re-vincular...')
        setTimeout(() => connectToWhatsApp(), 3000)
        return
      }

      console.log(`🔄 Reconectando en 5s... (código: ${statusCode})`)
      setTimeout(() => connectToWhatsApp(), 5000)
    }

    if (connection === 'open') {
      console.log('✅ Conectado a WhatsApp')
      // @ts-ignore
      console.log(`   Número: ${sock?.user?.id?.split(':')[0] ?? 'desconocido'}\n`)
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return

    const config = getConfig()

    for (const msg of messages) {
      if (!msg.message) continue

      const jid = msg.key.remoteJid
      if (!jid?.endsWith('@g.us')) continue

      const text = extractText(msg)
      if (!text.trim()) continue

     
      const fromMe = msg.key.fromMe ?? false
      const senderJid = fromMe ? 'me' : (msg.key.participant ?? 'unknown')
      const isMonitoredGroup = config.clientGroups.some(g => g.id === jid) || jid === config.teamGroupId
      if (isMonitoredGroup) console.log('👤 senderJid:', senderJid, '| grupo:', jid)
      const isFromTeam = fromMe || isTeamPhone(senderJid)

      if (jid === config.teamGroupId && isFromTeam) {
        const listoMatch = text.trim().match(/^#([\w-]+)\s+listo$/i)
        if (listoMatch) {
          const clientName = listoMatch[1].toLowerCase()
          const groupExists = config.clientGroups.some(g => g.clientName === clientName)
          if (groupExists) {
            markResolved(clientName, senderJid)
            await sock?.sendMessage(jid, {
              text: `✅ *#${clientName}* marcado como resuelto. No va a aparecer en el próximo resumen.`,
            })
          } else {
            await sock?.sendMessage(jid, {
              text: `❓ No encontré el grupo *#${clientName}*. Chequeá que el nombre sea exacto.`,
            })
          }
          continue
        }

        if (text.trim().toLowerCase() === '#revisar') {
          console.log('\n🔍 Revisión manual solicitada...')
          const issues = checkPendingIssues()
          if (issues.length === 0) {
            await sock?.sendMessage(jid, { text: '✅ Todo OK, no hay pendientes en este momento.' })
          } else {
            await sendSummaryToTeam(issues)
          }
          continue
        }
      }

      if (!isFromTeam) {
        const clientGroup = config.clientGroups.find(g => g.id === jid)
        if (clientGroup) clearResolved(clientGroup.clientName)
      }

      addMessage({
        id: msg.key.id ?? `${jid}-${Date.now()}`,
        groupId: jid,
        senderJid,
        isFromTeam,
        text,
        timestamp: Number(msg.messageTimestamp ?? Date.now() / 1000) * 1000,
        isPendingPhrase: isFromTeam && hasPendingPhrase(text),
      })
    }
  })

  return sock
}

export async function requestPairingCode(phoneNumber: string): Promise<string> {
  if (!sock) throw new Error('Socket no inicializado')
  await new Promise(r => setTimeout(r, 3000))
  return await sock.requestPairingCode(phoneNumber)
}

function extractText(msg: proto.IWebMessageInfo): string {
  return (
    msg.message?.conversation ??
    msg.message?.extendedTextMessage?.text ??
    msg.message?.imageMessage?.caption ??
    msg.message?.videoMessage?.caption ??
    ''
  )
}
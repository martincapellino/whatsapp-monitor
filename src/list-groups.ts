/**
 * SCRIPT DE SETUP: Lista todos los grupos de WhatsApp.
 *
 * Usá esto para obtener los IDs que van en config.json.
 *
 * Cómo correr:
 *   npm run list-groups
 *
 * Si ya vinculaste el número antes, se conecta automáticamente.
 * Si es la primera vez, te pide el pairing code igual que el bot principal.
 */

import * as readline from 'readline'
import * as fs from 'fs'
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import pino from 'pino'

async function listGroups() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  Listar Grupos de WhatsApp')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  const { state, saveCreds } = await useMultiFileAuthState('./auth_info')
  const { version } = await fetchLatestBaileysVersion()
  const logger = pino({ level: 'silent' })

  const sock = makeWASocket({
    version,
    logger,
    auth: state,
    printQRInTerminal: false,
    syncFullHistory: false,
  })

  sock.ev.on('creds.update', saveCreds)

  const isFirstTime = !fs.existsSync('./auth_info/creds.json')

  if (isFirstTime) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    const phone = await new Promise<string>(resolve => {
      rl.question('📱 Número de WhatsApp (solo dígitos, con código de país): ', resolve)
    })
    rl.close()

    await new Promise(r => setTimeout(r, 3000))
    const code = await sock.requestPairingCode(phone.trim())

    console.log(`\n🔑 Código de vinculación: ${code}`)
    console.log('Ingresalo en WhatsApp → Configuración → Dispositivos vinculados\n')
  }

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update

    if (connection === 'close') {
      const shouldRetry =
        (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut
      if (shouldRetry) await listGroups()
      else process.exit(1)
    }

    if (connection === 'open') {
      console.log('✅ Conectado. Obteniendo grupos...\n')

      // Pequeña espera para que los grupos carguen
      await new Promise(r => setTimeout(r, 4000))

      const allGroups = await sock.groupFetchAllParticipating()
      const groups = Object.values(allGroups).sort((a, b) =>
        a.subject.localeCompare(b.subject)
      )

      console.log('═'.repeat(60))
      console.log(`  ${groups.length} GRUPOS ENCONTRADOS`)
      console.log('═'.repeat(60))

      for (const group of groups) {
        console.log(`\n📁 ${group.subject}`)
        console.log(`   ID:            ${group.id}`)
        console.log(`   Participantes: ${group.participants.length}`)
      }

      console.log('\n' + '═'.repeat(60))
      console.log('\n💡 Copiá los IDs que necesitás en config.json')
      console.log('   clientGroups → para grupos de clientes')
      console.log('   teamGroupId  → para el grupo interno del equipo\n')

      process.exit(0)
    }
  })
}

listGroups().catch(err => {
  console.error('❌ Error:', err.message)
  process.exit(1)
})

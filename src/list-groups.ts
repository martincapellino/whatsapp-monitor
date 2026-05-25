import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys'
import pino from 'pino'

const AUTH_DIR = process.env.AUTH_DIR || './auth_info'

async function listGroups() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  Listar Grupos de WhatsApp')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  if (!require('fs').existsSync(`${AUTH_DIR}/creds.json`)) {
    console.error('❌ No hay sesión guardada. Corré npm start primero para vincular el número.')
    process.exit(1)
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
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

  sock.ev.on('connection.update', async (update) => {
    const { connection } = update

    if (connection === 'open') {
      console.log('✅ Conectado. Obteniendo grupos...\n')
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
        console.log(`   ID: ${group.id}`)
        console.log(`   Participantes: ${group.participants.length}`)
      }

      console.log('\n' + '═'.repeat(60))
      process.exit(0)
    }

    if (connection === 'close') {
      console.error('❌ Conexión cerrada inesperadamente.')
      process.exit(1)
    }
  })
}

listGroups().catch(err => {
  console.error('❌ Error:', err.message)
  process.exit(1)
})
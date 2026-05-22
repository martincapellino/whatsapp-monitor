import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import { loadConfig } from './config'
import { connectToWhatsApp, requestPairingCode } from './connection'
import { startMonitor } from './monitor'

const AUTH_DIR = process.env.AUTH_DIR || './auth_info'
const CREDS_FILE = path.join(AUTH_DIR, 'creds.json')

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  WhatsApp Monitor — Nucleus by Limitless')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  const config = loadConfig()
  console.log(`📂 Config cargada`)
  console.log(`   Grupos de clientes: ${config.clientGroups.length}`)
  console.log(`   Miembros del equipo: ${config.teamMembers.length}`)
  console.log(`   Intervalo de revisión: cada ${config.checkIntervalHours} horas`)
  console.log(`   Auth dir: ${AUTH_DIR}\n`)

  const isFirstTime = !fs.existsSync(CREDS_FILE)

  const sock = await connectToWhatsApp()

  if (isFirstTime) {
    const phone = await prompt(
      '📱 Ingresá tu número (solo dígitos, con código de país)\n   Ej: 5491112345678\n\n> '
    )
    console.log('\n⏳ Generando código de vinculación...')
    const code = await requestPairingCode(phone.trim())
    console.log('\n' + '━'.repeat(40))
    console.log(`  CÓDIGO DE VINCULACIÓN: ${code}`)
    console.log('━'.repeat(40))
    console.log('\n1. Abrí WhatsApp en tu teléfono')
    console.log('2. Configuración → Dispositivos vinculados → Vincular dispositivo')
    console.log('3. Tocá "Vincular con número de teléfono"')
    console.log('4. Ingresá el código de arriba\n')
  }

  await new Promise<void>((resolve) => {
    sock.ev.on('connection.update', (update) => {
      if (update.connection === 'open') resolve()
    })
    setTimeout(resolve, 5000)
  })

  startMonitor()

  console.log('📡 Escuchando mensajes en todos los grupos configurados.')
  console.log('   El bot va a mandar resúmenes automáticamente al grupo del equipo.\n')
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => {
    rl.question(question, answer => { rl.close(); resolve(answer) })
  })
}

main().catch(err => {
  console.error('\n❌ Error fatal:', err.message)
  process.exit(1)
})
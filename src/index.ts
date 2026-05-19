import * as readline from 'readline'
import * as fs from 'fs'
import { loadConfig } from './config'
import { connectToWhatsApp, requestPairingCode, getSocket } from './connection'
import { startMonitor } from './monitor'

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  WhatsApp Monitor — Nucleus by Limitless')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  // Cargar config (falla con mensaje claro si falta config.json)
  const config = loadConfig()

  console.log(`📂 Config cargada`)
  console.log(`   Grupos de clientes: ${config.clientGroups.length}`)
  console.log(`   Miembros del equipo: ${config.teamMembers.length}`)
  console.log(`   Intervalo de revisión: cada ${config.checkIntervalHours} horas\n`)

  const isFirstTime = !fs.existsSync('./auth_info/creds.json')

  // Iniciar la conexión a WhatsApp
  await connectToWhatsApp()

  if (isFirstTime) {
    // Primera vez: necesitamos vincular el número
    console.log('🔗 Primera vez — necesitás vincular tu WhatsApp\n')

    const phone = await prompt(
      '📱 Ingresá tu número (solo dígitos, con código de país)\n   Ej Argentina: 5491112345678\n\n> '
    )

    console.log('\n⏳ Generando código de vinculación...')

    const code = await requestPairingCode(phone.trim())

    console.log('\n' + '━'.repeat(40))
    console.log(`  CÓDIGO DE VINCULACIÓN: ${code}`)
    console.log('━'.repeat(40))
    console.log('\nCómo usarlo:')
    console.log('  1. Abrí WhatsApp en tu teléfono')
    console.log('  2. Configuración → Dispositivos vinculados → Vincular dispositivo')
    console.log('  3. Tocá "Vincular con número de teléfono" (en vez de escanear QR)')
    console.log('  4. Ingresá el código de arriba')
    console.log('\n⏳ Esperando que vincules el dispositivo...\n')
  }

  // Esperar a que la conexión esté establecida (máx 90 segundos)
  await waitForConnection(90_000)

  // Iniciar el monitor de pendientes
  startMonitor()

  console.log('📡 Escuchando mensajes en todos los grupos configurados.')
  console.log('   El bot va a mandar resúmenes automáticamente al grupo del equipo.\n')
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close()
      resolve(answer)
    })
  })
}

/**
 * Espera hasta que el socket tenga un usuario autenticado.
 * Esto puede tomar unos segundos después de vincular el dispositivo.
 */
function waitForConnection(timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const interval = setInterval(() => {
      const s = getSocket() as any
      if (s?.user) {
        clearInterval(interval)
        resolve()
        return
      }
      if (Date.now() - start > timeoutMs) {
        clearInterval(interval)
        reject(new Error('Timeout esperando conexión. Revisá que hayas ingresado el código correctamente.'))
      }
    }, 1000)
  })
}

// ─── Run ──────────────────────────────────────────────────────────────────────

main().catch(err => {
  console.error('\n❌ Error fatal:', err.message)
  process.exit(1)
})

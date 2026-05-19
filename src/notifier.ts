import { PendingIssue, IssueReason } from './monitor'
import { getConfig, TeamMember } from './config'
import { getSocket } from './connection'

// ─── Formateo ─────────────────────────────────────────────────────────────────

function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

function reasonLabel(reason: IssueReason): string {
  return reason === 'no_response' ? 'Sin respuesta' : 'Sin seguimiento'
}

/**
 * Construye el mensaje de resumen agrupado por miembro del equipo.
 *
 * Formato (igual al ejemplo):
 *
 * 📋 PENDIENTES — 15/05 18:00
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * @Juan Carrizo
 * #alvaro-larraz Consulta sin respuesta (2h 15min)
 * #juan-virola Sin seguimiento — "ahí lo vemos" (3h)
 *
 * @Naza G
 * #ana-montana Sin respuesta (1h 40min)
 */
function buildMessage(issues: PendingIssue[]): {
  text: string
  mentions: string[]
} {
  const now = new Date().toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

  // Agrupar issues por responsable
  const byResponsible = new Map<string, { member: TeamMember | null; issues: PendingIssue[] }>()

  for (const issue of issues) {
    const key = issue.responsible?.phone ?? '__sin_asignar__'
    if (!byResponsible.has(key)) {
      byResponsible.set(key, { member: issue.responsible, issues: [] })
    }
    byResponsible.get(key)!.issues.push(issue)
  }

  const lines: string[] = [
    `📋 *PENDIENTES* — ${now}`,
    '━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
  ]

  const mentions: string[] = []

  for (const { member, issues: memberIssues } of byResponsible.values()) {
    if (member) {
      lines.push(`@${member.name}`)
      mentions.push(`${member.phone}@s.whatsapp.net`)
    } else {
      lines.push(`⚠️ Sin responsable asignado`)
    }

    for (const issue of memberIssues) {
      const hashtag = `#${issue.clientName}`
      const label = reasonLabel(issue.reason)
      const time = formatTime(issue.minutesSince)

      if (issue.reason === 'no_response') {
        lines.push(`${hashtag} ${label} (${time})`)
      } else {
        // Pending phrase: mostramos el texto que se dijo
        lines.push(`${hashtag} ${label} — "_${issue.pendingText}_" (${time})`)
      }
    }

    lines.push('') // línea en blanco entre personas
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━')
  lines.push(`_${issues.length} grupo(s) con atención pendiente_`)

  return { text: lines.join('\n'), mentions }
}

// ─── Envío ────────────────────────────────────────────────────────────────────

export async function sendSummaryToTeam(issues: PendingIssue[]): Promise<void> {
  const sock = getSocket()
  if (!sock) {
    console.error('❌ No hay conexión activa de WhatsApp.')
    return
  }

  const config = getConfig()
  const { text, mentions } = buildMessage(issues)

  try {
    await sock.sendMessage(config.teamGroupId, { text, mentions })
    console.log('✅ Resumen enviado al grupo del equipo.')
    console.log('── Mensaje enviado ──────────────────')
    console.log(text)
    console.log('────────────────────────────────────\n')
  } catch (err) {
    console.error('❌ Error enviando al grupo del equipo:', err)
  }
}

import { PendingIssue, IssueReason } from './monitor'
import { getConfig, TeamMember } from './config'
import { getSocket } from './connection'

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
 * Devuelve el JID completo para mencionar a un miembro del equipo.
 * Prioriza @lid (nuevo formato en grupos), cae a @s.whatsapp.net si no tiene lid.
 */
function getMentionJid(member: TeamMember): string {
  if (member.lid) return `${member.lid}@lid`
  return `${member.phone}@s.whatsapp.net`
}

// ─── Formateo ─────────────────────────────────────────────────────────────────

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

  // Agrupar por responsable
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
      const mentionJid = getMentionJid(member)
      mentions.push(mentionJid)
      // @número es como WhatsApp renderiza las menciones internamente
      lines.push(`@${member.lid || member.phone}`)
    } else {
      lines.push(`⚠️ Sin responsable asignado`)
    }

    for (const issue of memberIssues) {
      const label = reasonLabel(issue.reason)
      const time = formatTime(issue.minutesSince)

      if (issue.reason === 'no_response') {
        lines.push(`#${issue.clientName} ${label} (${time})`)
      } else {
        lines.push(`#${issue.clientName} ${label} — "_${issue.pendingText}_" (${time})`)
      }
    }

    lines.push('')
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
    console.log('── Mensaje ──────────────────────────')
    console.log(text)
    console.log('─────────────────────────────────────\n')
  } catch (err) {
    console.error('❌ Error enviando al grupo del equipo:', err)
  }
}
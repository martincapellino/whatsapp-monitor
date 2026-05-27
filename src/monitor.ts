import cron from 'node-cron'
import { getConfig, isTeamPhone, findTeamMember, TeamMember } from './config'
import { getGroupMessages, StoredMessage, isResolved } from './storage'
import { sendSummaryToTeam } from './notifier'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type IssueReason = 'no_response' | 'pending_phrase'

export interface PendingIssue {
  groupId: string
  clientName: string
  reason: IssueReason
  responsible: TeamMember | null
  pendingText: string
  minutesSince: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function hasPendingPhrase(text: string): boolean {
  const lower = text.toLowerCase()
  return getConfig().pendingPhrases.some(p => lower.includes(p.toLowerCase()))
}

/**
 * Determina el responsable de un pendiente en base a:
 * 1. Si el mensaje del cliente menciona o responde a alguien del equipo → ese es el responsable
 * 2. Si el config tiene responsiblePhone para el grupo → ese
 * 3. Último miembro del equipo que escribió en el grupo
 * 4. null
 */
function resolveResponsible(
  groupId: string,
  messages: StoredMessage[],
  triggerMsg: StoredMessage
): TeamMember | null {
  const config = getConfig()

  // ── Prioridad 1: el cliente mencionó a alguien del equipo ─────────────────
  if (triggerMsg.mentionedJids && triggerMsg.mentionedJids.length > 0) {
    for (const mentionedJid of triggerMsg.mentionedJids) {
      if (isTeamPhone(mentionedJid)) {
        const member = findTeamMember(mentionedJid)
        if (member) return member
      }
    }
  }

  // ── Prioridad 2: el cliente respondió a un mensaje del equipo ─────────────
  if (triggerMsg.quotedSenderJid && isTeamPhone(triggerMsg.quotedSenderJid)) {
    const member = findTeamMember(triggerMsg.quotedSenderJid)
    if (member) return member
  }

  // ── Prioridad 3: responsable explícito en config ──────────────────────────
  const groupConfig = config.clientGroups.find(g => g.id === groupId)
  if (groupConfig?.responsiblePhone) {
    return findTeamMember(groupConfig.responsiblePhone) ?? null
  }

  // ── Prioridad 4: último del equipo que escribió ───────────────────────────
  const lastTeamMsg = [...messages].reverse().find(m => m.isFromTeam && m.senderJid !== 'me')
  if (lastTeamMsg) return findTeamMember(lastTeamMsg.senderJid) ?? null

  return null
}

// ─── Detección principal ──────────────────────────────────────────────────────

export function checkPendingIssues(): PendingIssue[] {
  const config = getConfig()
  const issues: PendingIssue[] = []

  const windowMs = 24 * 60 * 60 * 1000
  const since = Date.now() - windowMs
  const minWaitMs = config.minWaitMinutes * 60 * 1000

  for (const group of config.clientGroups) {
    if (isResolved(group.clientName)) continue

    const messages = getGroupMessages(group.id, since)
    if (messages.length === 0) continue

    let issueFound = false

    // CASO 1: Sin respuesta del equipo
    const lastMsg = messages[messages.length - 1]
    if (!lastMsg.isFromTeam) {
      const elapsed = Date.now() - lastMsg.timestamp
      if (elapsed >= minWaitMs) {
        const responsible = resolveResponsible(group.id, messages, lastMsg)
        issues.push({
          groupId: group.id,
          clientName: group.clientName,
          reason: 'no_response',
          responsible,
          pendingText: truncate(lastMsg.text, 120),
          minutesSince: Math.floor(elapsed / 60_000),
        })
        issueFound = true
      }
    }

    if (issueFound) continue

    // CASO 2: "Ya lo vemos" sin seguimiento real
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (!msg.isPendingPhrase) continue

      const hasRealFollowUp = messages
        .slice(i + 1)
        .some(m => m.isFromTeam && !m.isPendingPhrase)

      if (!hasRealFollowUp) {
        const elapsed = Date.now() - msg.timestamp
        if (elapsed >= minWaitMs) {
          // Para pending phrase, el trigger es el mensaje del equipo que dijo "ya lo vemos"
          // Buscamos el último mensaje del cliente antes de ese para ver si mencionó a alguien
          const lastClientMsg = messages.slice(0, i).reverse().find(m => !m.isFromTeam)
          const responsible = resolveResponsible(
            group.id,
            messages,
            lastClientMsg ?? msg
          )
          issues.push({
            groupId: group.id,
            clientName: group.clientName,
            reason: 'pending_phrase',
            responsible,
            pendingText: truncate(msg.text, 100),
            minutesSince: Math.floor(elapsed / 60_000),
          })
        }
      }
      break
    }
  }

  return issues
}

// ─── Cron ─────────────────────────────────────────────────────────────────────

export function startMonitor(): void {
  const config = getConfig()
  const interval = config.checkIntervalHours
  const cronExpr = `0 12,15,18,21,0 * * *`


  console.log(`⏰ Monitor activo — revisando cada ${interval} horas (cron: ${cronExpr})`)
  console.log(`   Grupos de clientes: ${config.clientGroups.length}`)
  console.log(`   Tiempo mínimo para alertar: ${config.minWaitMinutes} min\n`)

  cron.schedule(cronExpr, async () => {
    const now = new Date().toLocaleString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
    })
    console.log(`\n🔍 [${now}] Revisando grupos...`)

    const issues = checkPendingIssues()

    if (issues.length === 0) {
      console.log('✅ Sin pendientes.\n')
      return
    }

    console.log(`⚠️  ${issues.length} pendiente(s) encontrado(s).`)
    await sendSummaryToTeam(issues)
  })
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max) + '...'
}
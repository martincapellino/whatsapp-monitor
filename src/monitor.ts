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

function resolveResponsible(groupId: string, messages: StoredMessage[]): TeamMember | null {
  const config = getConfig()
  const groupConfig = config.clientGroups.find(g => g.id === groupId)

  if (groupConfig?.responsiblePhone) {
    return findTeamMember(groupConfig.responsiblePhone) ?? null
  }

  const lastTeamMsg = [...messages].reverse().find(m => m.isFromTeam && m.senderJid !== 'me')
  if (lastTeamMsg) return findTeamMember(lastTeamMsg.senderJid) ?? null

  return null
}

// ─── Detección principal ──────────────────────────────────────────────────────

export function checkPendingIssues(): PendingIssue[] {
  const config = getConfig()
  const issues: PendingIssue[] = []

  const windowMs = (config.checkIntervalHours + 1) * 60 * 60 * 1000
  const since = Date.now() - windowMs
  const minWaitMs = config.minWaitMinutes * 60 * 1000

  for (const group of config.clientGroups) {
    // Si el equipo lo marcó como resuelto, salteamos sin alertar
    if (isResolved(group.clientName)) {
      console.log(`   ⏭️  #${group.clientName} — marcado como resuelto, salteando`)
      continue
    }

    const messages = getGroupMessages(group.id, since)
    if (messages.length === 0) continue

    const responsible = resolveResponsible(group.id, messages)
    let issueFound = false

    // CASO 1: Sin respuesta del equipo
    const lastMsg = messages[messages.length - 1]
    if (!lastMsg.isFromTeam) {
      const elapsed = Date.now() - lastMsg.timestamp
      if (elapsed >= minWaitMs) {
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
  const cronExpr = `0 */${interval} * * *`

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
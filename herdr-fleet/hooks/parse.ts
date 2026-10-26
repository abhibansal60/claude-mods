import type { Agent } from '../types'

type Raw = {
  pane_id: string
  tab_id: string
  name?: string | null
  agent_status: string
  cwd: string
  terminal_title_stripped?: string
  state_change_seq?: number
  agent_session?: { value?: string }
}

export function parseAgents(json: string, me: string): (Omit<Agent, 'said'> & { sessionId: string | null })[] {
  const raw = (JSON.parse(json) as { result: { agents: Raw[] } }).result.agents
  return raw.map(a => ({
    pane: a.pane_id,
    tab: a.tab_id,
    name: a.name ?? '',
    status: (['idle', 'working', 'blocked', 'done'].includes(a.agent_status) ? a.agent_status : 'unknown') as Agent['status'],
    cwd: a.cwd,
    title: a.terminal_title_stripped ?? '',
    isMe: a.pane_id === me,
    seq: a.state_change_seq ?? 0,
    sessionId: a.agent_session?.value ?? null,
  }))
}

// ~/.claude/projects names a folder after the cwd with / and . made -.
export const projectDir = (cwd: string) => cwd.replace(/[/.]/g, '-')

// The last assistant text in the tail of a session log.
export function lastSaid(tail: string): string {
  const lines = tail.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i]!.includes('"type":"assistant"')) continue
    try {
      const row = JSON.parse(lines[i]!) as { message?: { content?: { type: string; text?: string }[] } }
      const text = row.message?.content?.filter(c => c.type === 'text').map(c => c.text).join(' ').trim()
      if (text) return text.replace(/\s+/g, ' ')
    } catch {
      // the tail's first line is cut mid-row
    }
  }
  return ''
}

// A Bash command that would close or kill the pane, tab or herdr itself.
export function killsMe(command: string, pane: string, tab: string): boolean {
  // Stopping the server or the session stops this pane with it; so does killing herdr by name or pid.
  if (/\b(pkill|killall)\b[^|;&]*herdr|\bherdr\s+(server|session)\s+stop\b/.test(command)) return true
  if (/\bkill\b/.test(command) && /\b(pgrep|pidof)\b[^|;&)]*herdr/.test(command)) return true
  const targets = [...command.matchAll(/\bherdr\s+(?:tab|pane|agent|workspace)\s+(?:close|kill|stop|remove)\b([^;&|\n]*)/g)].map(m => m[1]!)
  // Only literal ids pass: a variable (even "${HERDR_PANE_ID:-}"), a substitution, or an id piped in through xargs could be this pane.
  if (targets.some(t => !t.trim() || /[$`{]/.test(t))) return true
  // Whole ids only: closing w1:p12 must not count as closing w1:p1.
  const names = (id: string) => new RegExp(`(^|[\\s"'=])${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([\\s"';&|]|$)`)
  return [pane, tab, pane.split(':')[0]!].some(id => id && targets.some(t => names(id).test(t)))
}

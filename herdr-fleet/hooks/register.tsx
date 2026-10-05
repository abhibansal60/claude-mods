import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Agent } from '../types'
import { killsMe, lastSaid, parseAgents, projectDir } from './parse'

const PANE = 'herdr-fleet'
const agents = atom({ plugin: 'herdr-fleet', key: 'agents' } as const, [])

const ICON: Record<Agent['status'], string> = { working: '▶', blocked: '⏳', done: '⏳', idle: '·', unknown: '?' }
const COLOR: Record<Agent['status'], string | undefined> = { working: 'cyan', blocked: 'red', done: 'yellow', idle: undefined, unknown: undefined }

async function refresh($: EngineInterface) {
  const me = (await $.env.get('HERDR_PANE_ID')) ?? ''
  const config = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${(await $.env.get('HOME')) ?? ''}/.claude`
  const listed = await $.process.run(['herdr', 'agent', 'list'], { timeoutMs: 10000 }).catch(() => null)
  if (!listed || listed.exitCode !== 0) return
  let found: ReturnType<typeof parseAgents>
  try {
    found = parseAgents(listed.stdout, me)
  } catch {
    return // herdr printed something other than the JSON we know; keep the last list
  }
  const old = await read($, agents)
  const next: Agent[] = []
  for (const a of found) {
    const before = old.find((o: Agent) => o.pane === a.pane)
    let said = before?.said ?? ''
    // Read the log again only when the agent changed state.
    if (a.sessionId && (!before || before.seq !== a.seq)) {
      const log = `${config}/projects/${projectDir(a.cwd)}/${a.sessionId}.jsonl`
      const tail = await $.process.run(['tail', '-c', '300000', log]).catch(() => null)
      if (tail?.exitCode === 0) said = lastSaid(tail.stdout)
    }
    if (before && before.status !== 'blocked' && a.status === 'blocked' && !a.isMe) {
      $.ui.toast(`herdr: ${a.name || a.title} needs you (blocked)`)
    }
    const { sessionId: _, ...rest } = a
    next.push({ ...rest, said })
  }
  await update($, agents, () => next)
}

async function focus($: EngineInterface, pane: string) {
  await $.process.run(['herdr', 'agent', 'focus', pane]).catch(() => null)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'herdr-fleet', description: 'Show every herdr agent and its status in a pane' })
    if (await $.env.get('HERDR_PANE_ID')) {
      void refresh($)
      $.clock.every(20_000, () => refresh($))
    }
    return next(e)
  })

  on('command.run', { command: 'herdr-fleet' }, async $ => {
    await $.ui.open({ id: PANE, title: 'herdr fleet' })
    void refresh($)
    return { text: 'herdr fleet pane opened.' }
  })

  // Never close or kill the pane this session runs in.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const pane = (await $.env.get('HERDR_PANE_ID')) ?? ''
    const tab = (await $.env.get('HERDR_TAB_ID')) ?? ''
    if (pane && killsMe(e.command, pane, tab)) {
      return { deny: `herdr-fleet: this command would close this session's own herdr pane (${pane}) or herdr itself. Target other panes by id, or ask the user.` }
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const list = await read($, agents)
    const width = Math.max(20, e.props.bodyColumns - 4)
    const waiting = list.filter((a: Agent) => !a.isMe && (a.status === 'blocked' || a.status === 'done')).length
    return (
      <Box flexDirection="column">
        {list.length === 0 && <Text dimColor>No herdr agents found.</Text>}
        {waiting > 0 && <Text color="yellow">⏳ {waiting} waiting on you</Text>}
        {list.map((a: Agent) => (
          <Box key={a.pane} flexDirection="column" marginTop={1}>
            <Box flexDirection="row" gap={1}>
              <Text color={COLOR[a.status]} bold={a.isMe}>
                {ICON[a.status]} {a.name || a.title.slice(0, 30)} <Text dimColor>{a.status}</Text>
                {a.isMe ? '  ◉ you are here' : ''}
              </Text>
              {!a.isMe && <Button key={`focus-${a.pane}`} label="focus" plain onPress={() => focus($, a.pane)} />}
            </Box>
            <Text dimColor wrap="truncate">
              {a.cwd.replace(/^\/home\/[^/]+/, '~')} · {a.title}
            </Text>
            {a.said && (
              <Text wrap="truncate-end">“{a.said.slice(0, width * 2)}”</Text>
            )}
          </Box>
        ))}
      </Box>
    )
  })
}

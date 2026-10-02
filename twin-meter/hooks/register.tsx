import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Account, Meter } from '../types'
import { circled, parseCswap, switchHint } from './parse'

const meter = atom({ plugin: 'twin-meter', key: 'meter' } as const, null)

const color = (pct: number) => (pct >= 60 ? 'red' : pct >= 40 ? 'yellow' : 'green')

let lastRun = 0

async function refresh($: EngineInterface) {
  lastRun = await $.clock.now()
  const { exitCode, stdout } = await $.process.run(['cswap', 'list'], { timeoutMs: 20000 })
  if (exitCode !== 0) return
  const accounts = parseCswap(stdout)
  if (accounts.length === 0) return
  const active = accounts.find(a => a.isActive)
  await update($, meter, (old: Meter | null): Meter => {
    // Restart the session baseline when the account changes or its 5h window resets.
    const isSame = old?.startEmail === active?.email && (old?.startFive ?? 0) <= (active?.five ?? 0)
    return {
      accounts,
      startFive: isSame ? old!.startFive : active?.five ?? null,
      startEmail: active?.email ?? null,
    }
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    void refresh($)
    $.clock.every(120_000, () => refresh($))
    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (/\bcswap\b/.test(e.command)) void refresh($)
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    if (!e.agentId && (await $.clock.now()) - lastRun > 60_000) void refresh($)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const m = await read($, meter)
    if (e.props.hasSurvey || !m) return below

    const { Box, Text } = $.ui.resolve(e)
    const active = m.accounts.find((a: Account) => a.isActive)
    const used = active && m.startFive !== null ? active.five - m.startFive : 0
    const hint = switchHint(m.accounts)

    const mine = (
      <Box key="twin-meter" flexDirection="row" gap={1} flexWrap="wrap">
        {m.accounts.map((a: Account) => (
          <Text key={`acct-${a.n}`} bold={a.isActive} dimColor={!a.isActive}>
            {a.isActive ? '★' : ' '}
            {circled(a.n)} <Text color={color(a.five)}>5h {a.five}%</Text>
            {a.fiveReset ? ` ↻${a.fiveReset}` : ''} · 7d {a.week}%
          </Text>
        ))}
        {used > 0 && <Text dimColor>· this session +{used}%</Text>}
        {hint && <Text color="cyan">{hint}</Text>}
      </Box>
    )
    return below ? (
      <Box flexDirection="column">
        {mine}
        {below}
      </Box>
    ) : (
      mine
    )
  })
}

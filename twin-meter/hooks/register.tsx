import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Account, Meter } from '../types'
import { circled, otherText, parseCswap, switchTo } from './parse'

const meter = atom({ plugin: 'twin-meter', key: 'meter' } as const, null)

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

  // One row shared with on-me: whatever the band holds on the left, the other accounts on the right.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const m = await read($, meter)
    if (e.props.hasSurvey || !m) return below

    const { Box, Text } = $.ui.resolve(e)
    const active = m.accounts.find((a: Account) => a.isActive)
    const used = active && m.startFive !== null ? active.five - m.startFive : 0
    const to = switchTo(m.accounts)
    const others = otherText(m.accounts)
    if (!others && !to) return below

    const mine = to ? (
      <Text key="twin-meter" color="cyan">{`⇄ switch to ${circled(to.n)} · ${to.five}% used  (cswap switch ${to.n})`}</Text>
    ) : (
      <Text key="twin-meter" dimColor>{`⇄ ${others}${used >= 10 ? `  · here +${used}%` : ''}`}</Text>
    )
    if (!below) return mine
    return (
      <Box flexDirection="row" justifyContent="space-between" gap={2} width={e.props.bodyColumns}>
        <Box flexShrink={1}>{below}</Box>
        <Box flexShrink={0}>{mine}</Box>
      </Box>
    )
  })
}

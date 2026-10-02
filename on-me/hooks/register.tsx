import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { OnMe } from '../types'
import { endsWithQuestion, parseBlocked } from './parse'

const state = atom({ plugin: 'on-me', key: 'state' } as const, { items: [], doing: '' })

const short = (text: string, n: number) => (text.length > n ? `${text.slice(0, n - 1)}…` : text)

export const register: Register = on => {
  on('tool.call', async ($, e, next) => {
    if (!e.agentId) {
      const input = e as unknown as { description?: string; command?: string; file_path?: string }
      const doing = input.description ?? `${String(e.tool)} ${input.file_path ?? input.command ?? ''}`
      await update($, state, (s: OnMe) => ({ ...s, doing: short(doing.trim(), 60) }))
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) {
      const blocked = parseBlocked(e.answer)
      const asks = endsWithQuestion(e.answer) ? ['answer my question'] : []
      await update($, state, (s: OnMe) => ({
        doing: '',
        items: blocked === null ? [...new Set([...s.items.filter(i => i !== 'answer my question'), ...asks])] : [...blocked, ...asks],
      }))
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below
    const s = await read($, state)
    const { Box, Text } = $.ui.resolve(e)
    const width = Math.max(20, e.props.bodyColumns - 14)

    const mine = (
      <Box key="on-me" flexDirection="column">
        {e.props.isWorking && s.doing && <Text color="cyan">▶ me: {short(s.doing, width)}</Text>}
        {s.items.length === 0 ? (
          <Text color="green">✓ all clear, nothing waits on you</Text>
        ) : (
          s.items.slice(0, 3).map((item: string, i: number) => (
            <Text key={`item-${i}`} color="yellow" wrap="truncate">
              {i === 0 ? `⏳ on you: ${s.items.length} · ` : '            · '}
              {item}
            </Text>
          ))
        )}
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

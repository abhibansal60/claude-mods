import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { OnMe } from '../types'
import { endsWithQuestion, parseBlocked } from './parse'

const state = atom({ plugin: 'on-me', key: 'state' } as const, { items: [], doing: '' })

// Markdown marks read as noise in a one-line band.
const plain = (text: string) => text.replace(/[`*_]/g, '').replace(/\s+/g, ' ').trim()

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

  // One row shared with twin-meter: on-me on the left, whatever the band holds below it on the right.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below
    const s = await read($, state)
    const { Box, Text } = $.ui.resolve(e)

    const first = plain(s.items[0] ?? '')
    const more = s.items.length > 1 ? `  +${s.items.length - 1}` : ''
    const mine =
      e.props.isWorking && s.doing ? (
        <Text key="on-me" color="cyan" dimColor wrap="truncate-end">{`▶ ${plain(s.doing)}`}</Text>
      ) : first ? (
        <Text key="on-me" color="yellow" wrap="truncate-end">{`⏳ ${first}${more}`}</Text>
      ) : null

    if (!mine || !below) return mine ?? below
    return (
      // The engine refuses another hook's tree under a sized Box, so `below` sits bare in a plain row.
      <Box flexDirection="row" gap={3}>
        <Box flexShrink={1}>{mine}</Box>
        {below}
      </Box>
    )
  })
}

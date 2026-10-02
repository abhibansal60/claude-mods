const NONE = /^(nothing|none|no\b|n\/a|-|—)/i
const NEXT_PART = /^\s*(#{1,6}\s|\*\*(changed|found)\b|(changed|found):)/i

// Reads the "Blocked on me" part of an answer: an inline value
// ("**Blocked on me:** pick the ideas") or the bullets below its heading.
// null when the answer has no such part.
export function parseBlocked(answer: string): string[] | null {
  const lines = answer.split('\n')
  const at = lines.findIndex(l => /blocked on me/i.test(l))
  if (at === -1) return null
  const inline = lines[at]!.replace(/^.*blocked on me\W*/i, '').trim()
  const items: string[] = []
  if (inline) items.push(inline)
  for (const line of lines.slice(at + 1)) {
    if (NEXT_PART.test(line)) break
    if (!line.trim()) {
      if (items.length > 0) break
      continue
    }
    items.push(line.replace(/^\s*([-*•]|\d+[.)])\s*/, '').trim())
  }
  return items.filter(i => i && !NONE.test(i)).map(i => i.replace(/\*\*/g, ''))
}

// The answer ends by asking something: the person must reply.
export function endsWithQuestion(answer: string): boolean {
  const last = answer.trim().split('\n').pop() ?? ''
  return /\?\s*\**\s*$/.test(last)
}

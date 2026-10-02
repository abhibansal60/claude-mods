import { expect, test } from 'claude-code/testing'

import { endsWithQuestion, parseBlocked } from '../hooks/parse'

test('reads the blocked part in both forms', async () => {
  expect(parseBlocked('Done.\n\n**Blocked on me:** pick the ideas.\n**Changed:** nothing.')).toEqual(['pick the ideas.'])
  expect(parseBlocked('## Blocked on me\n- add ntfy signup\n- vercel login on laptop\n\n## Changed\n- x')).toEqual([
    'add ntfy signup',
    'vercel login on laptop',
  ])
  expect(parseBlocked('## Blocked on me\nNothing.\n## Changed')).toEqual([])
  expect(parseBlocked('All done.')).toBe(null)
  expect(parseBlocked('It shows my last "Blocked on me" line, so it changes.')).toBe(null)
  expect(endsWithQuestion('Which one?')).toBe(true)
  expect(endsWithQuestion('Done.')).toBe(false)
})

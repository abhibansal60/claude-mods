import { expect, test } from 'claude-code/testing'

import { otherText, parseCswap, switchTo } from '../hooks/parse'

const LIST = `Accounts:
  1: one@example.com [one@example.com's Organization] (active)
     ├ 5h:  87%   resets 22:19         in 3h 42m
     └ 7d:  10%   resets Oct 5 13:29   in 2d 18h

  2: two@example.com [two@example.com's Organization]
     ├ 5h:   3%   resets Oct 3 03:20   in 45m
     └ 7d:  91%   resets Oct 4 07:29   in 1d 12h

Running instances:
  ● CLI   ~/code  (6 sessions)
`

test('parses both accounts, shows the other one and suggests a switch', async () => {
  const accounts = parseCswap(LIST)
  expect(accounts).toEqual([
    { n: 1, email: 'one@example.com', isActive: true, five: 87, fiveReset: '3h', week: 10 },
    { n: 2, email: 'two@example.com', isActive: false, five: 3, fiveReset: '45m', week: 91 },
  ])
  expect(otherText(accounts)).toBe('#2  5h 3% ↺ 45m · 7d 91%')
  expect(switchTo(accounts)?.n).toBe(2)
  expect(switchTo(accounts.map(a => ({ ...a, five: 30 })))).toBe(null)
})

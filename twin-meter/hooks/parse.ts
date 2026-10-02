import type { Account } from '../types'

// Parses `cswap list`:
//   1: a@b.com [a@b.com's Organization] (active)
//      ├ 5h:  87%   resets 22:19         in 3h 42m
//      └ 7d:  10%   resets Oct 5 13:29   in 2d 18h
export function parseCswap(text: string): Account[] {
  const accounts: Account[] = []
  for (const block of text.split(/\n(?=\s*\d+: )/)) {
    const head = block.match(/^\s*(\d+): (\S+)/m)
    const five = block.match(/5h:\s*(\d+)%(?:.*?\bin\s+(\d+[dhm])(?:\s+\d+[hm])?)?/)
    const week = block.match(/7d:\s*(\d+)%/)
    if (!head || !five || !week) continue
    const email = head[2]!
    accounts.push({
      n: Number(head[1]),
      email,
      isActive: /\(active\)/.test(block.split('\n').find(l => l.includes(email)) ?? ''),
      five: Number(five[1]),
      fiveReset: five[2] ?? null,
      week: Number(week[1]),
    })
  }
  return accounts
}

// The account to switch to, when the active one is getting full and another has room.
export function switchTo(accounts: Account[]): Account | null {
  const active = accounts.find(a => a.isActive)
  if (!active || active.five < 60) return null
  const best = accounts.filter(a => !a.isActive && a.week < 95).sort((a, b) => a.five - b.five)[0]
  return best && best.five <= active.five - 20 ? best : null
}

// The status line already shows the active account, so the band shows only the others.
export function otherText(accounts: Account[]): string {
  return accounts
    .filter(a => !a.isActive)
    .map(a => `#${a.n}  5h ${a.five}%${a.fiveReset ? ` ↺ ${a.fiveReset}` : ''} · 7d ${a.week}%`)
    .join('   ')
}

import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

// Smoke: drive the hooks module itself with fixture events, nothing real beneath.
const list = (activeFive: number) => `Accounts:
  1: one@example.com [one@example.com's Organization] (active)
     ├ 5h:  ${activeFive}%   resets 22:19         in 3h 42m
     └ 7d:  10%   resets Oct 5 13:29   in 2d 18h

  2: two@example.com [two@example.com's Organization]
     ├ 5h:   3%   resets Oct 3 03:20   in 45m
     └ 7d:  91%   resets Oct 4 07:29   in 1d 12h
`

const BAND = {
  plugin: 'twin-meter',
  component: 'AbovePrompt',
  requestId: 'band',
  props: { hasSurvey: false, isWorking: false, maxRows: 3, bodyColumns: 100, scroll: { offset: 0, bodyRows: 3 }, view: {} },
} as const

const exited = (stdout = '', exitCode = 0) => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })

function engine(on: On, cswap: () => ReturnType<typeof exited> | { deny: string }) {
  const clock = mock.clock(on, { now: 1_000_000 })
  const ran: string[][] = []
  on('process.run', (_, e) => (ran.push([...e.argv]), cswap()))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false } }))
  // The engine's own band beneath draws nothing.
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  return { clock, ran }
}

test('smoke: the band shows the other account, then SWITCH once the active one fills', async ($, on) => {
  let five = 30
  const { clock, ran } = engine(on, () => exited(list(five)))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clock.settle()
  expect(ran).toEqual([['cswap', 'list']])

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /OTHER ACCOUNT/ }))?.text).toMatch(/#2 {2}5h 3% ↺ 45m · 7d 91%/)
  await ui.unmount()

  // A cswap command refreshes at once.
  five = 87
  await $.tool.call({ tool: 'Bash', command: 'cswap switch 1' })
  await clock.settle()
  const after = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await after.find({ type: 'Text', text: /SWITCH/ }))?.text).toMatch(/cswap switch 2/)
  await after.unmount()
})

test('smoke: without cswap the band stays empty', async ($, on) => {
  const { clock } = engine(on, () => ({ deny: 'cswap: not found' }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /ACCOUNT|SWITCH/ })).toBe(undefined)
  await ui.unmount()
})

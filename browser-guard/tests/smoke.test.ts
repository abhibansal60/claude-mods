import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

// Smoke: drive the hooks module itself with fixture events, nothing real beneath.
const CHROME = 'mcp__claude-in-chrome__'
const exited = (stdout = '', exitCode = 0) => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
const status = (n: number, email: string) => `Status: Account-${n} (${email} [${email}'s Organization])`

type World = { account: string; browsers: { deviceId: string; name: string; inUse: boolean }[]; answer: string | null }

function engine(on: On, world: World) {
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  const asked: string[] = []
  const acted: string[] = []
  on('process.run', (_, e) => (e.argv[0] === 'cswap' ? exited(world.account) : exited('', 127)))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.toast', () => ({ value: undefined }))
  on('tool.call', { tool: `${CHROME}list_connected_browsers` }, () => ({ result: {}, text: JSON.stringify(world.browsers) }))
  on('tool.call', { tool: 'AskUserQuestion' }, (_, e) => {
    const q = e.questions[0]!.question
    asked.push(q)
    // null: the person dismissed the dialog.
    return world.answer === null ? { deny: 'dismissed' } : { result: { questions: e.questions, answers: { [q]: world.answer } } }
  })
  on('tool.call', (_, e) => (acted.push(String(e.tool)), { result: {}, text: 'ok' }))
  return { clock, asked, acted }
}

const one = { deviceId: 'd1', name: 'Work Chrome', inUse: true }
const two = { deviceId: 'd2', name: 'Home Chrome', inUse: true }

test('smoke: first Chrome action pairs after a yes, then a different profile is refused', async ($, on) => {
  const world: World = { account: status(1, 'a@x.com'), browsers: [one], answer: 'Yes, pair them' }
  const { clock, asked, acted } = engine(on, world)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  expect((await $.tool.call({ tool: `${CHROME}navigate`, url: 'https://example.com' })).deny).toBe(undefined)
  expect(asked).toEqual(['Chrome "Work Chrome" is about to act. Is it the Chrome profile for a@x.com?'])
  expect(acted).toEqual([`${CHROME}navigate`])

  // Same pair: no second question.
  await $.tool.call({ tool: `${CHROME}navigate`, url: 'https://example.com/2' })
  expect(asked.length).toBe(1)

  // Another Chrome profile shows up after the 30 s look expires.
  world.browsers = [two]
  await clock.advance(31_000)
  const refused = await $.tool.call({ tool: `${CHROME}navigate`, url: 'https://example.com/3' })
  expect(refused.deny).toMatch(/not the profile paired with a@x.com/)
  expect(acted.length).toBe(2)

  expect((await $.command.run({ command: 'browser-guard', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })).text).toBe('a@x.com → Work Chrome (d1)')
})

test('smoke: a no stops the Chrome action', async ($, on) => {
  const { acted } = engine(on, { account: status(1, 'a@x.com'), browsers: [one], answer: 'No, stop' })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect((await $.tool.call({ tool: `${CHROME}navigate`, url: 'https://example.com' })).deny).toMatch(/not the profile for a@x.com/)
  expect(acted).toEqual([])
})

test('smoke: tools other than Chrome actions pass untouched', async ($, on) => {
  const { asked, acted } = engine(on, { account: status(1, 'a@x.com'), browsers: [one], answer: 'No, stop' })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await $.tool.call({ tool: `${CHROME}tabs_context_mcp` })
  expect(asked).toEqual([])
  expect(acted).toEqual(['Bash', `${CHROME}tabs_context_mcp`])
})

test('smoke: a dismissed pairing question stops the Chrome action', async ($, on) => {
  const { acted, asked } = engine(on, { account: status(1, 'a@x.com'), browsers: [one], answer: null })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect((await $.tool.call({ tool: `${CHROME}navigate`, url: 'https://example.com' })).deny).toMatch(/browser-guard: nobody answered/)
  expect(asked.length).toBe(1)
  expect(acted).toEqual([])
})

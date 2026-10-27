import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

// Smoke: drive the hooks module itself with fixture events, nothing real beneath.
const AGENTS = JSON.stringify({ result: { agents: [
  { pane_id: 'w1:p1', tab_id: 'w1:t1', name: 'me', agent_status: 'working', cwd: '/home/me/code/a', state_change_seq: 1, agent_session: { value: 's1' } },
  { pane_id: 'w1:p2', tab_id: 'w1:t2', name: 'other', agent_status: 'idle', cwd: '/home/me/code/b', state_change_seq: 1, agent_session: { value: 's2' } },
] } })
const LOG = '{"type":"assistant","message":{"content":[{"type":"text","text":"Tests pass."}]}}'

const PANE = {
  plugin: 'herdr-fleet',
  component: 'Pane',
  requestId: 'herdr-fleet',
  props: { title: 'herdr fleet', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

const exited = (stdout = '', exitCode = 0) => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })

function engine(on: On, env: Record<string, string>, agents = () => AGENTS) {
  const clock = mock.clock(on)
  mock.env(on, env)
  const ran: string[][] = []
  const toasts: string[] = []
  on('process.run', (_, e) => {
    ran.push([...e.argv])
    if (e.argv[0] === 'herdr' && e.argv[2] === 'list') return exited(agents())
    if (e.argv[0] === 'tail') return /^\/home\/me\/\.claude\/projects\/-home-me-code-[ab]\/s[12]\.jsonl$/.test(e.argv[3]!) ? exited(LOG) : exited('', 1)
    return exited()
  })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', (_, e) => (toasts.push(e.text), { value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: { stdout: 'ran', stderr: '', interrupted: false } }))
  return { clock, ran, toasts }
}

const IN_HERDR = { HERDR_PANE_ID: 'w1:p1', HERDR_TAB_ID: 'w1:t1', HOME: '/home/me' }

test('smoke: Bash guard denies closing this pane and passes other commands', async ($, on) => {
  const { clock } = engine(on, IN_HERDR)
  await $.session.start({ cwd: '/', surface: null, isInteractive: false })

  expect((await $.tool.call({ tool: 'Bash', command: 'herdr pane close w1:p1' })).deny).toMatch(/own herdr pane/)
  expect((await $.tool.call({ tool: 'Bash', command: 'herdr tab close "$HERDR_TAB_ID"' })).deny).toMatch(/own herdr pane/)
  expect((await $.tool.call({ tool: 'Bash', command: 'herdr pane close w1:p2' })).deny).toBe(undefined)
  expect((await $.tool.call({ tool: 'Bash', command: 'ls' })).result).toEqual({ stdout: 'ran', stderr: '', interrupted: false })
  await clock.settle()
})

test('smoke: outside herdr the guard passes and nothing is spawned', async ($, on) => {
  const { clock, ran } = engine(on, { HOME: '/home/me' })
  await $.session.start({ cwd: '/', surface: null, isInteractive: false })
  expect((await $.tool.call({ tool: 'Bash', command: 'herdr pane close w1:p1' })).deny).toBe(undefined)
  await clock.settle()
  expect(ran).toEqual([])
})

test('smoke: the pane lists agents, marks this one, and a newly blocked agent toasts', async ($, on) => {
  let agents = AGENTS
  const { clock, toasts } = engine(on, IN_HERDR, () => agents)
  await $.session.start({ cwd: '/', surface: null, isInteractive: true })
  await clock.settle()

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /you are here/ }))?.text).toMatch(/me/)
    expect(await ui.find({ type: 'Text', text: /Tests pass\./ })).toBeDefined()
    await ui.unmount()
  }

  // Both panes turn blocked; only the other one is worth a toast.
  agents = AGENTS.replace(/"(idle|working)"/g, '"blocked"').replaceAll('"state_change_seq":1', '"state_change_seq":2')
  await clock.advance(20_000)
  expect(toasts).toEqual(['herdr: other needs you (blocked)'])
})

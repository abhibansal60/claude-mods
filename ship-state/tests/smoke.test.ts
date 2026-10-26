import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

// Smoke: drive the hooks module itself with fixture events, nothing real beneath.
const PANE = {
  plugin: 'ship-state',
  component: 'Pane',
  requestId: 'ship-state',
  props: { title: 'Ship state', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

const exited = (stdout = '', exitCode = 0) => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
const turn = (answer: string) => ({ answer, durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' as const })

// A fake host: every folder under /home/me/code/<repo> except notes is a repo on GitHub, `status` its porcelain output.
type Opts = { pyproject?: string; pypi?: () => { status: number; text: string } | null; slowLookup?: boolean }

function engine(on: On, status: Record<string, string>, opts: Opts = {}) {
  const clock = mock.clock(on)
  mock.env(on, { HOME: '/home/me' })
  const ran: string[][] = []
  const toasts: string[] = []
  on('process.run', async (_, e) => {
    const argv = [...e.argv]
    ran.push(argv)
    const cwd = e.init?.cwd ?? ''
    if (argv[3] === 'rev-parse' && argv[4] === '--show-toplevel') {
      if (opts.slowLookup) await clock.sleep(15_000)
      const root = argv[2]!.match(/^\/home\/me\/code\/[^/]+/)?.[0]
      return root && !root.endsWith('/notes') ? exited(root) : exited('', 128)
    }
    if (argv[1] === 'status') return exited(status[cwd] ?? '## main...origin/main')
    if (argv[1] === 'remote') return exited(`git@github.com:me/${cwd.split('/').pop()}.git`)
    if (argv[1] === 'rev-parse') return exited('abc123')
    if (argv[0] === 'gh' && argv[1] === 'run') return exited(JSON.stringify([{ workflowName: 'CI', status: 'completed', conclusion: 'success', url: 'https://x' }]))
    if (argv[0] === 'gh' && argv[1] === 'api') return exited('Vercel\tsuccess\n')
    return exited('', 1)
  })
  on('fs.read', () => (opts.pyproject ? { value: opts.pyproject } : { deny: 'ENOENT' }))
  on('http.fetch', () => {
    const res = opts.pypi?.()
    return res ? { value: { ...res, ok: res.status === 200, headers: {} } } : { deny: 'offline' }
  })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', (_, e) => (toasts.push(e.text), { value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false } }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  return { clock, ran, toasts }
}

test('smoke: the pane shows the session repo with branch, unpushed commits, CI and deploy checks', async ($, on) => {
  const { clock } = engine(on, { '/home/me/code/app': '## main...origin/main [ahead 2]\n M a.ts\n' })
  await $.session.start({ cwd: '/home/me/code/app', surface: 'terminal', isInteractive: true })
  await clock.settle()

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /app/ }))?.text).toMatch(/● app main/)
    expect((await ui.find({ type: 'Text', text: /unpushed/ }))?.text).toMatch(/✎ 1 uncommitted {2}↑ 2 unpushed/)
    expect(await ui.find({ type: 'Text', text: /CI ✓ CI/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /✓ Vercel/ })).toBeDefined()
    await ui.unmount()
  }
})

test('smoke: an answer that says done while a repo is unpushed raises a toast; a clean repo does not', async ($, on) => {
  const status: Record<string, string> = { '/home/me/code/app': '## main...origin/main [ahead 1]' }
  const { clock, toasts } = engine(on, status)
  await $.session.start({ cwd: '/home/me/code/app', surface: 'terminal', isInteractive: true })
  await clock.settle()

  await $.turn.complete(turn('Done, pushed.'))
  await clock.settle()
  expect(toasts).toEqual(['Said done, but not shipped: app'])

  status['/home/me/code/app'] = '## main...origin/main'
  await $.turn.complete(turn('Done, pushed.'))
  await clock.settle()
  expect(toasts.length).toBe(1)
})

test('smoke: a tool call naming another ~/code repo adds it, and a folder seen once is not asked again', async ($, on) => {
  const { clock, ran } = engine(on, {})
  await $.session.start({ cwd: '/home/me/code/app', surface: 'terminal', isInteractive: true })
  await clock.settle()

  await $.tool.call({ tool: 'Read', file_path: '/home/me/code/lib/src/a.ts' })
  await $.tool.call({ tool: 'Read', file_path: '/home/me/code/lib/src/b.ts' })
  await $.tool.call({ tool: 'Bash', command: 'git -C ~/code/lib push' })
  await $.tool.call({ tool: 'Read', file_path: '/home/me/code/notes/a.md' })
  await $.tool.call({ tool: 'Read', file_path: '/home/me/code/notes/b.md' })
  await clock.settle()

  const lookups = ran.filter(a => a[3] === 'rev-parse' && a[4] === '--show-toplevel').map(a => a[2])
  expect(lookups).toEqual(['/home/me/code/app', '/home/me/code/lib', '/home/me/code/notes'])
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /lib main/ })).toBeDefined()
  await ui.unmount()
})

test('smoke: a tool result is not held while a new folder is looked up', async ($, on) => {
  const { clock, ran } = engine(on, {}, { slowLookup: true })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  let isDone = false
  void $.tool.call({ tool: 'Read', file_path: '/home/me/code/lib/a.ts' }).then(() => (isDone = true))
  await clock.settle()
  expect(isDone).toBe(true)
  await clock.advance(30_000)
  expect(ran).toContainEqual(['git', '-C', '/home/me/code/lib', 'rev-parse', '--show-toplevel'])
})

test('smoke: a repo first touched by the turn\'s last tool call still counts when the turn ends', async ($, on) => {
  const { clock, toasts } = engine(on, { '/home/me/code/lib': '## main...origin/main\n M a.ts\n' }, { slowLookup: true })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Edit', file_path: '/home/me/code/lib/a.ts' })
  await $.tool.call({ tool: 'Read', file_path: '/home/me/code/lib/b.ts' })
  await $.turn.complete(turn('Done, pushed.'))
  await clock.advance(60_000)
  expect(toasts).toEqual(['Said done, but not shipped: lib'])
})

test('smoke: the session folder comes from session.start, not $PWD', async ($, on) => {
  const { clock, ran } = engine(on, {})
  await $.session.start({ cwd: '/home/me/code/app', surface: 'terminal', isInteractive: true })
  await clock.settle()
  expect(ran[0]).toEqual(['git', '-C', '/home/me/code/app', 'rev-parse', '--show-toplevel'])
})

const PYPROJECT = '[project]\nname = "tidy-ai"\nversion = "0.4.1"\n'

for (const [why, pypi] of [
  ['never published (404)', () => ({ status: 404, text: '{"message":"Not Found"}' })],
  ['unreachable', () => null],
] as const) {
  test(`smoke: a Python repo whose PyPI project is ${why} does not count as unshipped`, async ($, on) => {
    const { clock, toasts } = engine(on, {}, { pyproject: PYPROJECT, pypi })
    await $.session.start({ cwd: '/home/me/code/app', surface: 'terminal', isInteractive: true })
    await clock.settle()
    await $.turn.complete(turn('Done, pushed.'))
    await clock.settle()
    expect(toasts).toEqual([])
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /≠/ })).toBe(undefined)
    await ui.unmount()
  })
}

test('smoke: a Python repo ahead of PyPI counts as unshipped', async ($, on) => {
  const { clock, toasts } = engine(on, {}, { pyproject: PYPROJECT, pypi: () => ({ status: 200, text: '{"info":{"version":"0.4.0"}}' }) })
  await $.session.start({ cwd: '/home/me/code/app', surface: 'terminal', isInteractive: true })
  await clock.settle()
  await $.turn.complete(turn('Done, published.'))
  await clock.settle()
  expect(toasts).toEqual(['Said done, but not shipped: app'])
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /PyPI/ }))?.text).toMatch(/PyPI 0.4.0 ≠ local 0.4.1/)
  await ui.unmount()
})

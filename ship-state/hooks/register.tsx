import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Ci, RepoRow } from '../types'
import { CLAIMS_DONE, SHIPPING, parseStatus, pyproject, repoDirs } from './parse'

const PANE = 'ship-state'
const roots = atom({ plugin: 'ship-state', key: 'roots' } as const, [])
const rows = atom({ plugin: 'ship-state', key: 'rows' } as const, [])

let running: Promise<void> | null = null
let queued: Promise<void> | null = null
// Folder -> its git root (null: not a repo). Saves a git spawn on every Read/Edit/Bash of a seen folder.
const rootOf = new Map<string, string | null>()

async function sh($: EngineInterface, argv: string[], cwd: string) {
  try {
    return await $.process.run(argv, { cwd, timeoutMs: 20000 })
  } catch {
    return { exitCode: 1, stdout: '', stderr: '' }
  }
}

// Adds the git root of each dir to the watched list.
async function track($: EngineInterface, dirs: string[]) {
  for (const dir of dirs) {
    if (rootOf.has(dir)) continue
    const known = await read($, roots)
    if (known.some((r: string) => dir === r || dir.startsWith(`${r}/`))) {
      rootOf.set(dir, null)
      continue
    }
    const { exitCode, stdout } = await sh($, ['git', '-C', dir, 'rev-parse', '--show-toplevel'], '/')
    const root = exitCode === 0 ? stdout.trim() : ''
    rootOf.set(dir, root || null)
    if (!root || known.includes(root)) continue
    await update($, roots, (list: string[]) => (list.includes(root) ? list : [...list, root]))
    if ((await read($, roots)).length === 1) void $.ui.open({ id: PANE, title: 'Ship state' })
  }
}

async function check($: EngineInterface, root: string): Promise<RepoRow> {
  const status = parseStatus((await sh($, ['git', 'status', '--porcelain=v1', '-b'], root)).stdout)
  const remote = (await sh($, ['git', 'remote', 'get-url', 'origin'], root)).stdout.trim()
  const hasRemote = remote.includes('github.com')
  let ci: Ci | null = null
  const checks: Record<string, string> = {}
  if (hasRemote) {
    const runs = await sh($, ['gh', 'run', 'list', '-L', '1', '--json', 'workflowName,status,conclusion,url'], root)
    const run = runs.exitCode === 0 ? (parseJson(runs.stdout)?.[0] as Record<string, string> | undefined) : undefined
    if (run) ci = { name: run.workflowName ?? '', status: run.status ?? '', conclusion: run.conclusion ?? '', url: run.url ?? '' }
    const sha = (await sh($, ['git', 'rev-parse', 'HEAD'], root)).stdout.trim()
    const st = await sh($, ['gh', 'api', `repos/{owner}/{repo}/commits/${sha}/status`, '--jq', '.statuses[] | [.context, .state] | @tsv'], root)
    for (const line of st.stdout.split('\n').filter(Boolean)) {
      const [context = '', state = ''] = line.split('\t')
      checks[context] ??= state
    }
  }
  let pypi: RepoRow['pypi'] = null
  const project = await $.fs.read(`${root}/pyproject.toml`).then(pyproject, () => null)
  if (project) {
    const res = await $.http.fetch(`https://pypi.org/pypi/${project.name}/json`).catch(() => null)
    const live = res?.ok ? ((parseJson(res.text)?.info?.version as string | undefined) ?? '?') : '?'
    pypi = { local: project.version, live }
  }
  return {
    root,
    name: root.split('/').pop() ?? root,
    branch: status.branch,
    dirty: status.dirty,
    ahead: status.hasUpstream ? status.ahead : -1,
    hasRemote,
    ci,
    checks,
    pypi,
    checkedAt: await $.clock.now(),
  }
}

function parseJson(text: string): any {
  try {
    return JSON.parse(text || 'null')
  } catch {
    return null
  }
}

async function refreshNow($: EngineInterface) {
  const list: RepoRow[] = []
  for (const root of await read($, roots)) list.push(await check($, root))
  await update($, rows, () => list)
}

// One refresh at a time. A call during a refresh waits for one more after it, so callers that read rows
// afterwards (warnIfUnshipped) always see state from after their call, never an old snapshot.
function refresh($: EngineInterface): Promise<void> {
  if (!running) return (running = refreshNow($).finally(() => (running = null)))
  return (queued ??= running.then(() => {
    queued = null
    return refresh($)
  }))
}

const isRed = (r: RepoRow) => r.ci?.conclusion === 'failure' || Object.values(r.checks).some(s => s === 'failure' || s === 'error')
const isUnshipped = (r: RepoRow) => r.ahead !== 0 || r.dirty > 0 || (r.pypi !== null && r.pypi.local !== r.pypi.live)
const isRunning = (r: RepoRow) => (r.ci !== null && r.ci.status !== 'completed') || Object.values(r.checks).includes('pending')

// Refreshes after the turn without holding it, then warns when the answer claimed a ship that did not happen.
async function warnIfUnshipped($: EngineInterface, claimsDone: boolean) {
  await refresh($)
  const bad = (await read($, rows)).filter((r: RepoRow) => isRed(r) || isUnshipped(r))
  if (claimsDone && bad.length > 0) $.ui.toast(`Said done, but not shipped: ${bad.map((r: RepoRow) => r.name).join(', ')}`)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'ship-state', description: 'Show git, CI and deploy state of the repos this session touched' })
    const cwd = (await $.env.get('PWD')) ?? ''
    void track($, [cwd]).then(() => refresh($))
    // Poll faster while CI or a deploy runs.
    $.clock.every(30_000, async () => {
      const list = await read($, rows)
      if (list.some(isRunning)) await refresh($)
    })
    $.clock.every(300_000, () => refresh($))
    return next(e)
  })

  on('command.run', { command: 'ship-state' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Ship state' })
    void refresh($)
    return { text: 'Ship state pane opened.' }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const input = e as unknown as { command?: string; file_path?: string; notebook_path?: string }
    const text = input.command ?? input.file_path ?? input.notebook_path
    if (text) {
      const home = (await $.env.get('HOME')) ?? ''
      await track($, repoDirs(text, home))
      if (input.command && SHIPPING.test(input.command)) void refresh($)
    }
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) void warnIfUnshipped($, CLAIMS_DONE.test(e.answer))
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const list = await read($, rows)
    return (
      <Box flexDirection="column">
        {list.length === 0 && <Text dimColor>No repo touched yet.</Text>}
        {list.map((r: RepoRow) => (
          <Box key={r.root} flexDirection="column" marginBottom={1}>
            <Text bold color={isRed(r) ? 'red' : isUnshipped(r) ? 'yellow' : 'green'}>
              {isRed(r) ? '✗' : isUnshipped(r) ? '●' : '✓'} {r.name} <Text dimColor>{r.branch}</Text>
            </Text>
            <Text>
              {r.dirty > 0 ? `✎ ${r.dirty} uncommitted  ` : ''}
              {r.ahead > 0 ? `↑ ${r.ahead} unpushed  ` : ''}
              {r.ahead === -1 ? 'no upstream  ' : ''}
              {!r.hasRemote ? 'no GitHub remote' : ''}
              {r.dirty === 0 && r.ahead === 0 && r.hasRemote ? 'clean, pushed' : ''}
            </Text>
            {r.ci && (
              <Text color={r.ci.conclusion === 'failure' ? 'red' : r.ci.status !== 'completed' ? 'yellow' : undefined}>
                CI {r.ci.status === 'completed' ? (r.ci.conclusion === 'success' ? '✓' : `✗ ${r.ci.conclusion}`) : '⋯ running'} {r.ci.name}
              </Text>
            )}
            {r.ci && <Text dimColor wrap="truncate-start">{r.ci.url}</Text>}
            {Object.entries(r.checks).map(([context, state]) => (
              <Text key={context} color={state === 'success' ? undefined : state === 'pending' ? 'yellow' : 'red'}>
                {state === 'success' ? '✓' : state === 'pending' ? '⋯' : '✗'} {context}
              </Text>
            ))}
            {r.pypi && (
              <Text color={r.pypi.local === r.pypi.live ? undefined : 'yellow'}>
                PyPI {r.pypi.live} {r.pypi.local === r.pypi.live ? '= local' : `≠ local ${r.pypi.local}`}
              </Text>
            )}
          </Box>
        ))}
        <Button key="refresh" label="Refresh" hotkey="r" onPress={() => refresh($)} />
      </Box>
    )
  })
}

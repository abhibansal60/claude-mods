import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

// Smoke: drive the hooks module itself with fixture events, nothing real beneath.
const band = (isWorking: boolean) =>
  ({
    plugin: 'on-me',
    component: 'AbovePrompt',
    requestId: 'band',
    props: { hasSurvey: false, isWorking, maxRows: 3, bodyColumns: 100, scroll: { offset: 0, bodyRows: 3 }, view: {} },
  }) as const

const turn = (answer: string) => ({ answer, durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' as const })

function engine(on: On) {
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false } }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  // The engine's own band beneath draws nothing.
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
}

test('smoke: the band shows the tool call while Claude works', async ($, on) => {
  engine(on)
  await $.tool.call({ tool: 'Bash', command: 'npm test', description: 'Run the tests' })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...band(true), surface })
    expect((await ui.find({ type: 'Text', text: /CLAUDE/ }))?.text).toMatch(/Run the tests/)
    await ui.unmount()
  }
})

test('smoke: the band shows what an answer left on the person, and nothing when nothing waits', async ($, on) => {
  engine(on)
  await $.turn.complete(turn('Done.\n\n## Blocked on me\n- add the **DNS** record\n- vercel login\n\n## Changed\n- x'))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...band(false), surface })
    const row = (await ui.find({ type: 'Text', text: /ON YOU/ }))?.text
    expect(row).toMatch(/add the DNS record/)
    expect(row).toMatch(/\+1/)
    await ui.unmount()
  }

  await $.turn.complete(turn('## Blocked on me\nNothing.'))
  const empty = await $.ui.mount({ ...band(false), surface: 'terminal' })
  expect(await empty.find({ type: 'Text', text: /ON YOU/ })).toBe(undefined)
  await empty.unmount()
})

test('smoke: a subagent turn leaves the band alone', async ($, on) => {
  engine(on)
  await $.turn.complete(turn('## Blocked on me\n- real item'))
  await $.turn.complete({ ...turn('## Blocked on me\n- from a subagent'), agentId: 'a1' })
  await $.turn.complete({ ...turn('Done, nothing blocked.'), agentId: 'a2' })
  const ui = await $.ui.mount({ ...band(false), surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /ON YOU/ }))?.text).toMatch(/real item/)
  expect(await ui.find({ type: 'Text', text: /subagent/ })).toBe(undefined)
  await ui.unmount()
})

test('smoke: a tool call does not wait for the band to update', async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  // A slow write of the band's state beneath the plugin.
  on('state.set', async (_, e, next) => (await clock.sleep(5_000), next(e)))
  let isDone = false
  void $.tool.call({ tool: 'Bash', command: 'ls', description: 'List files' }).then(() => (isDone = true))
  await clock.settle()
  expect(isDone).toBe(true)
  await clock.advance(5_000)
})

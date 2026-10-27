import { expect, test } from 'claude-code/testing'

import { killsMe, lastSaid, parseAgents, projectDir } from '../hooks/parse'

test('agents, last words and the kill guard', async () => {
  const json = JSON.stringify({ result: { agents: [
    { pane_id: 'w5:pJ', tab_id: 'w5:tJ', name: 'claude-mod', agent_status: 'working', cwd: '/home/me/code', state_change_seq: 3, agent_session: { value: 's1' } },
    { pane_id: 'w5:p7', tab_id: 'w5:t7', name: null, agent_status: 'blocked', cwd: '/home/me', terminal_title_stripped: 'Perf' },
  ] } })
  const list = parseAgents(json, 'w5:pJ')
  expect(list[0]!.isMe).toBe(true)
  expect(list[1]!.status).toBe('blocked')
  expect(projectDir('/home/me/code/x.y')).toBe('-home-me-code-x-y')
  const tail = 'cut row\n{"type":"assistant","message":{"content":[{"type":"text","text":"All done."}]}}\n{"type":"user"}'
  expect(lastSaid(tail)).toBe('All done.')
  expect(killsMe('herdr tab close w5:tJ', 'w5:pJ', 'w5:tJ')).toBe(true)
  expect(killsMe('herdr tab close w5:t7', 'w5:pJ', 'w5:tJ')).toBe(false)
  expect(killsMe('pkill -f herdr', 'w5:pJ', 'w5:tJ')).toBe(true)
  expect(killsMe('herdr agent list', 'w5:pJ', 'w5:tJ')).toBe(false)
  // via the agent's own env vars
  expect(killsMe('herdr pane close "$HERDR_PANE_ID"', 'w5:pJ', 'w5:tJ')).toBe(true)
  expect(killsMe('herdr tab close ${HERDR_TAB_ID}', 'w5:pJ', 'w5:tJ')).toBe(true)
  // whole ids only
  expect(killsMe('herdr pane close w1:p12', 'w1:p1', 'w1:t1')).toBe(false)
  expect(killsMe('herdr pane close w1:p1', 'w1:p1', 'w1:t1')).toBe(true)
  // stopping the session stops this pane with it
  expect(killsMe('herdr session stop', 'w1:p1', 'w1:t1')).toBe(true)
  expect(killsMe('herdr session list', 'w1:p1', 'w1:t1')).toBe(false)
  // a target the guard cannot read could be this pane
  expect(killsMe('herdr pane close $(herdr pane current --id)', 'w1:p1', 'w1:t1')).toBe(true)
  expect(killsMe('P=w1:p1; herdr pane close "$P"', 'w1:p1', 'w1:t1')).toBe(true)
  expect(killsMe('herdr pane close `herdr pane current`', 'w1:p1', 'w1:t1')).toBe(true)
  // a variable elsewhere in the command does not count
  expect(killsMe('herdr pane close w1:p2 && echo $HOME', 'w1:p1', 'w1:t1')).toBe(false)
  expect(killsMe('herdr pane close "${HERDR_PANE_ID:-}"', 'w1:p1', 'w1:t1')).toBe(true)
  expect(killsMe("herdr agent list | jq -r '.result.agents[0].pane_id' | xargs herdr pane close", 'w1:p1', 'w1:t1')).toBe(true)
  expect(killsMe('herdr pane current | xargs -I{} herdr pane close {}', 'w1:p1', 'w1:t1')).toBe(true)
  expect(killsMe('kill $(pgrep herdr)', 'w1:p1', 'w1:t1')).toBe(true)
  expect(killsMe('pgrep -f herdr | xargs kill -9', 'w1:p1', 'w1:t1')).toBe(true)
  expect(killsMe('pgrep -a herdr', 'w1:p1', 'w1:t1')).toBe(false)
  expect(killsMe('herdr pane close w1:p2; echo w1:p1', 'w1:p1', 'w1:t1')).toBe(false)
})

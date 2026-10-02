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
})

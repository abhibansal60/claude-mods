import { expect, test } from 'claude-code/testing'

import { parseStatus, pyproject, repoDirs } from '../hooks/parse'

test('reads repos, git status and pyproject', async () => {
  expect(repoDirs('cd ~/code/jev && git push; cat /home/me/code/tidy-mail/x', '/home/me')).toEqual([
    '/home/me/code/jev',
    '/home/me/code/tidy-mail',
  ])
  expect(parseStatus('## main...origin/main [ahead 2]\n M a.ts\n?? b.ts\n')).toEqual({ branch: 'main', ahead: 2, dirty: 2, hasUpstream: true })
  expect(parseStatus('## feat')).toEqual({ branch: 'feat', ahead: 0, dirty: 0, hasUpstream: false })
  expect(pyproject('[project]\nname = "tidy-ai"\nversion = "0.4.1"\n[tool.x]\nname = "no"')).toEqual({ name: 'tidy-ai', version: '0.4.1' })
})

import type { EngineInterface, Register } from 'claude-code'

import { ACTS, CHROME, PICKERS, activeEmail, inUseBrowser, mismatch } from './parse'
import type { Browser, Pairs } from './parse'

// Pairs live in $.store so they last across sessions: account email → Chrome browser.
async function getPairs($: EngineInterface): Promise<Pairs> {
  return ((await $.store.get('pairs')) as Pairs | undefined) ?? {}
}

async function account($: EngineInterface) {
  const { stdout } = await $.process.run(['cswap', 'status'], { timeoutMs: 10000 })
  return activeEmail(stdout)
}

async function browserInUse($: EngineInterface): Promise<Browser | null> {
  const listed = await $.tool.call({ tool: `${CHROME}list_connected_browsers` } as never)
  return inUseBrowser((listed as { text?: string }).text ?? '')
}

// One look at the account and browser serves the calls of the next 30 s.
let seen: { at: number; email: string | null; browser: Browser | null } | null = null

async function look($: EngineInterface) {
  const now = await $.clock.now()
  if (!seen || now - seen.at > 30_000) {
    seen = { at: now, email: await account($).catch(() => null), browser: await browserInUse($).catch(() => null) }
  }
  return seen
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'browser-guard', description: 'Show Chrome profile pairs; "/browser-guard reset" forgets them' })
    return next(e)
  })

  on('command.run', { command: 'browser-guard' }, async ($, e) => {
    if (e.args.trim() === 'reset') {
      await $.store.delete('pairs')
      return { text: 'browser-guard: pairs forgotten. The next Chrome action asks again.' }
    }
    const pairs = Object.entries(await getPairs($))
    return {
      text: pairs.length === 0 ? 'browser-guard: no pairs yet.' : pairs.map(([email, b]) => `${email} → ${b.name} (${b.deviceId})`).join('\n'),
    }
  })

  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    const input = e as unknown as { url?: string; action?: string; command?: string }
    // A browser pick or an account switch makes the last look stale.
    if (PICKERS.test(tool) || (tool === 'Bash' && /\bcswap\b/.test(input.command ?? ''))) seen = null
    if (!tool.startsWith(CHROME) || PICKERS.test(tool)) return next(e)

    const { email, browser } = await look($)
    if (!email || !browser) return next(e)

    const pairs = await getPairs($)
    const why = mismatch(email, browser, pairs)
    if (why) return { deny: `browser-guard: ${why}` }

    if (!pairs[email]) {
      const answer = await $.ui.ask(`Chrome "${browser.name}" is about to act. Is it the Chrome profile for ${email}?`, [
        'Yes, pair them',
        'No, stop',
      ])
      if (!answer.startsWith('Yes')) {
        return { deny: `browser-guard: the user says Chrome "${browser.name}" is not the profile for ${email}. Ask which profile to use.` }
      }
      await $.store.set('pairs', { ...pairs, [email]: { deviceId: browser.deviceId, name: browser.name } })
    }

    if (ACTS.test(tool)) {
      $.ui.toast(`Chrome: ${browser.name} · ${email.split('@')[0]} · ${input.action ?? tool.slice(CHROME.length)}${input.url ? ` ${input.url}` : ''}`)
    }
    return next(e)
  })
}

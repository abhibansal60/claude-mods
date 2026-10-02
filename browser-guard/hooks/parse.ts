export type Browser = { deviceId: string; name: string; inUse?: boolean }
export type Pairs = Record<string, Browser>

export const CHROME = 'mcp__claude-in-chrome__'
// Calls that only pick or list browsers: never guarded.
export const PICKERS = /__(list_connected_browsers|select_browser|switch_browser|tabs_context_mcp)$/
// Calls that act on a page as the signed-in person: worth a toast.
export const ACTS = /__(navigate|form_input|file_upload|upload_image|javascript_tool|shortcuts_execute)$|__computer$/

// `cswap status`: "Status: Account-1 (a@b.com [a@b.com's Organization])"
export function activeEmail(status: string): string | null {
  return status.match(/Status: Account-\d+ \((\S+?)[\s)]/)?.[1] ?? null
}

export function inUseBrowser(listText: string): Browser | null {
  try {
    const list = JSON.parse(listText) as Browser[]
    return list.find(b => b.inUse) ?? (list.length === 1 ? list[0]! : null)
  } catch {
    return null
  }
}

// null when the browser fits the account, else why not.
export function mismatch(email: string, browser: Browser, pairs: Pairs): string | null {
  const paired = pairs[email]
  if (paired && paired.deviceId !== browser.deviceId) {
    return `Chrome "${browser.name}" is not the profile paired with ${email}. Call select_browser for "${paired.name}" (deviceId ${paired.deviceId}), or ask the user to open that Chrome profile.`
  }
  const owner = Object.entries(pairs).find(([other, b]) => other !== email && b.deviceId === browser.deviceId)
  if (owner) {
    return `Chrome "${browser.name}" is the profile for ${owner[0]}, but the active cswap account is ${email}. Ask the user which profile to use.`
  }
  return null
}

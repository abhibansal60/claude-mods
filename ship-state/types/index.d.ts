export type Ci = { name: string; status: string; conclusion: string; url: string }

export type RepoRow = {
  root: string
  name: string
  branch: string
  dirty: number
  ahead: number
  hasRemote: boolean
  ci: Ci | null
  // Commit statuses on HEAD, such as Vercel's deploy: context → state
  checks: Record<string, string>
  pypi: { local: string; live: string } | null
  checkedAt: number
}

declare module 'claude-code' {
  interface PluginState {
    'ship-state': { roots: string[]; rows: RepoRow[] }
  }
}

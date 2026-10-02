// Every ~/code/<repo> a command or path names.
export function repoDirs(text: string, home: string): string[] {
  const found = new Set<string>()
  const re = new RegExp(`(?:~|${home.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})/code/([\\w.-]+)`, 'g')
  for (const m of text.matchAll(re)) found.add(`${home}/code/${m[1]}`)
  return [...found]
}

// `git status --porcelain=v1 -b`: "## main...origin/main [ahead 2, behind 1]" then one line per file.
export function parseStatus(out: string): { branch: string; ahead: number; dirty: number; hasUpstream: boolean } {
  const [head = '', ...files] = out.split('\n')
  const branch = head.replace(/^## /, '').split('...')[0]!.replace(/^No commits yet on /, '')
  const ahead = Number(head.match(/ahead (\d+)/)?.[1] ?? 0)
  return { branch, ahead, dirty: files.filter(Boolean).length, hasUpstream: head.includes('...') }
}

export function pyproject(text: string): { name: string; version: string } | null {
  const project = text.split(/^\[project\]\s*$/m)[1]?.split(/^\[/m)[0] ?? ''
  const name = project.match(/^name\s*=\s*"([^"]+)"/m)?.[1]
  const version = project.match(/^version\s*=\s*"([^"]+)"/m)?.[1]
  return name && version ? { name, version } : null
}

export const SHIPPING = /\b(git|gh|vercel|npm|pnpm|twine|uv|wrangler|firebase)\b/
export const CLAIMS_DONE = /\b(done|deployed|merged|pushed|shipped|published|live now|is live)\b/i

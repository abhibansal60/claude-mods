# claude-mods

Claude Code mods (plugins of function hooks) built from how I actually use Claude Code: two accounts rotated with `cswap`, many parallel sessions in herdr, and checking results rather than diffs.

## Start here: paste this to your agent

```
Set up the claude-mods Claude Code plugins from https://github.com/abhibansal60/claude-mods.
1. Read README.md and each mod's hooks/register.tsx (or .ts) on GitHub so you know what each one runs.
2. Check what I have, read-only: `claude --version`, `which cswap herdr gh git`, `gh auth status`, and the plugins in ~/.claude/settings.json.
3. Tell me which mods fit my machine: twin-meter and browser-guard need cswap; herdr-fleet needs herdr; ship-state needs git and gh. Skip the ones whose tools are missing.
4. Ask me before changing anything. Then run `claude plugin marketplace add abhibansal60/claude-mods` and `claude plugin install <mod>@claude-mods --scope user` for each mod I pick.
5. Tell me to restart Claude Code, and how to see each mod: the one-line band above the prompt, `/ship-state`, `/herdr-fleet`, `/browser-guard`.
```

## Install

```
claude plugin marketplace add abhibansal60/claude-mods
claude plugin install on-me@claude-mods --scope user
claude plugin install twin-meter@claude-mods --scope user
claude plugin install ship-state@claude-mods --scope user
claude plugin install browser-guard@claude-mods --scope user
claude plugin install herdr-fleet@claude-mods --scope user
```

Then restart Claude Code. Update later with `claude plugin marketplace update claude-mods`.

Needs: `twin-meter` and `browser-guard` use [`cswap`](https://pypi.org/project/claude-swap/), `herdr-fleet` uses [herdr](https://herdr.dev), `ship-state` uses `git` and `gh`.

## The mods

| Mod | Where | What it shows or does |
|---|---|---|
| `on-me` | Band, left | One line: `⏳` and the first item from the last answer's *Blocked on me* part (or "answer my question"), `+N` for more; `▶` and the current tool call while Claude works. Nothing when nothing waits on you. |
| `twin-meter` | Band, right | Dim `⇄` and your *other* `cswap` accounts' 5h and 7d use (the status line already shows the active one). Turns into a cyan `⇄ switch to ②` hint when the active account passes 60% and another has room. |
| `ship-state` | Pane, `/ship-state` | Each repo the session touched: branch, uncommitted files, unpushed commits, last CI run, commit statuses on HEAD (Vercel deploys) and PyPI against the local version. A toast when an answer says "done" but a repo is not shipped. |
| `browser-guard` | Hook on Chrome tools | Pairs each `cswap` account with a Chrome browser on first use, then stops Chrome actions from the wrong profile. `/browser-guard` lists pairs, `/browser-guard reset` forgets them. |
| `herdr-fleet` | Pane, `/herdr-fleet` | Every herdr agent with status, folder, title and last words, "◉ you are here" on this pane, a focus button, a toast when another agent is blocked. Stops Bash commands that would close this pane or herdr. |

## Develop

Each mod is a plugin: `.claude-plugin/plugin.json`, `hooks/hooks.json`, `hooks/register.tsx`, a `types/index.d.ts` contract for its `$.state`, and pure parsers in `hooks/parse.ts` with tests in `tests/`.

```
claude plugin validate ./<mod>
claude plugin test ./<mod>
```

To work on a mod live, run `claude --plugin-dir ./<mod>`: saving a file reloads it.

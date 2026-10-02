# claude-mods

Claude Code mods (plugins of function hooks) built from how I actually use Claude Code: two accounts rotated with `cswap`, many parallel sessions in herdr, and checking results rather than diffs.

## Start here: paste this to your agent

```
Set up the claude-mods Claude Code plugins from https://github.com/abhibansal60/claude-mods.
1. Clone it to ~/code/claude-mods and read README.md and each mod's hooks/register.tsx (or .ts).
2. Check what I have, read-only: `claude --version`, `which cswap herdr gh git`, `gh auth status`, and the plugins in ~/.claude/settings.json.
3. Tell me which mods fit my machine: twin-meter and browser-guard need cswap; herdr-fleet needs herdr; ship-state needs git and gh. Skip the ones whose tools are missing.
4. Ask me before changing anything. Then run `claude plugin marketplace add ~/code/claude-mods` and `claude plugin install <mod>@claude-mods --scope user` for each mod I pick.
5. Run `claude plugin validate` on each installed mod and tell me how to see it: the band above the prompt, `/ship-state`, `/herdr-fleet`, `/browser-guard`.
```

## The mods

| Mod | Where | What it shows or does |
|---|---|---|
| `twin-meter` | Band above the prompt | Both `cswap` accounts' 5h and 7d use, ★ on the active one, red at 60%, a "→ cswap switch N" hint when the other account has room, and this session's share of the 5h limit. |
| `on-me` | Band above the prompt | "⏳ on you" items from the last answer's *Blocked on me* part (or "answer my question"), and "▶ me:" with the current tool call while Claude works. |
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

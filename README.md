<p align="center"><img src="docs/sample-en.png" width="520" alt="A kid's picture diary page written by a coding agent: the boss texted 'clear', the agent worked two hours on it."></p>

# picture-diary

Your coding agent writes a diary of what it wasted today, draws it as a kid's picture diary, and only the lessons that stop the mistakes get to stay in `CLAUDE.md`.

[한국어](README.ko.md)

```
/plugin marketplace add qqq1212341/picture-diary
/plugin install picture-diary@picture-diary
```

Then say "write the diary" (or `/picture-diary:diary`). Needs Node 18+. The first render sets itself up once: it installs `playwright-core` into `~/.picture-diary/.runtime` and uses your Chrome, Edge or Brave (or downloads a headless Chromium if you have none).

## Three things it does

1. **Writes every day.** `scripts/collect.mjs` reads the day's Claude Code session logs and `git log` and counts what happened: sessions, tool errors, Stop-hook loops, context compactions, tokens, commits and reverts, and the times you corrected the agent (a keyword heuristic in Korean and English; it has false positives). The agent writes `diary/<date>.md` from those numbers, not from memory. A day with nothing to say is allowed to say nothing.
2. **Uses what it knows, sparingly.** Diaries are never injected into the context. The `recall` skill greps them when the current task looks like an old mistake. Only rules that earned it go into `CLAUDE.md`, at most 10, inside one marked block.
3. **Gets better on purpose.** Mistakes get a tag. The same tag on two different days becomes a rule candidate. A rule has to prove itself:

```
 hit (tag, any day)
   |  same tag on 2 different days
   v
 CANDIDATE  --- you / the agent writes one sentence --->  ACTIVE (probation, expires in 60 days)
                                                            |
            14 days, zero repeats ----------------------->  GRADUATED  -> written into CLAUDE.md
                                                            |            (tip: make it a hook, lint or test)
            repeats >= repeats before the rule, or expired -> RETIRED   ("do it over")
```

Nothing is promoted on a feeling. `rules.mjs status` shows the repeat count before and after every rule.

## The picture

A Korean elementary-school style 그림일기: date and weather, title, a drawing the agent makes as plain SVG (no image API), and the text on manuscript paper, one character per cell (English: one word per cell). Crayon texture comes from an SVG filter.

- **Weather = how the day went.** sun: passed. cloud: bumpy. rain: failures. storm: reverts or Stop-hook loops. fog: the context was compacted and the agent forgot things.
- **Teacher's stamp = grade from the numbers.** Good job! / Nice work / Try harder / See me after class (Korean: 참 잘했어요 / 잘했어요 / 노력해요 / 다시 해 오세요).
- **Red pen** = today's new rule candidate. A streak counter after day 2. A box for a parent's signature.
- `--lang en`, `--story` (1080x1920), `--out file.png`. Paths like `/Users/you/...` are masked before rendering.

```
node scripts/render.mjs docs/sample-ko.json                # Korean
node scripts/render.mjs docs/sample-en.json --lang en      # English
node scripts/render.mjs docs/sample-en.json --story
```

Fonts (Gaegu, Nanum Pen Script, both OFL) are loaded from Google Fonts when rendering. Offline, the page falls back to a system handwriting font.

## Rules ledger

`rules.jsonl` is append-only. Commands, all in `scripts/rules.mjs`:

```
rules.mjs hit <tag>                          # it happened again today
rules.mjs add --tag T --rule "..." --source diary/2026-10-23.md
rules.mjs status [--json]
rules.mjs review [--apply]                   # candidates, graduations, retirements (dry run by default)
rules.mjs sync --file CLAUDE.md [--max 10]   # rewrites only the block between the markers
```

The block in `CLAUDE.md` looks like `<!-- picture-diary:rules --> ... <!-- /picture-diary:rules -->`. Everything outside it is left alone.

## Privacy

Everything stays on your machine, in `~/.picture-diary/` (change with `PICTURE_DIARY_HOME`). There is no server and no upload; the only network call is the font stylesheet when rendering. Session logs contain your prompts, so the diary can too. `collect.mjs` masks home paths and user names, but project names and prompt text are not masked. Read the PNG before you post it.

## Layout

```
.claude-plugin/   plugin.json, marketplace.json
skills/diary/     write the diary, draw it, update rules
skills/recall/    search past diaries and rules for the current task
scripts/          collect.mjs  render.mjs  rules.mjs
test/             npm test
```

## Status

v0.1. The heuristics (corrections, weather, grade) are starting points and will be wrong sometimes; the agent is told to check the logs before it claims anything. Rule effects are counted by whether a mistake tag recurs, which is a proxy, not proof of causation.

MIT. Made by Dumb Game Lab.

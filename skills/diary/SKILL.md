---
name: diary
description: Write today's diary - what got done, what was wasted, what was learned - bake it into a kid's picture-diary PNG, and update the rules ledger. Use when the user says "write the diary", "diary", "/diary", "picture diary", "일기 써", "그림일기", "오늘 일기", or on a daily schedule.
---

# Daily picture diary

The user's language decides the diary's language (Korean -> `--lang ko`, English -> `--lang en`).
Data lives in `${PICTURE_DIARY_HOME:-~/.picture-diary}`: `diary/<date>.md`, `diary/<date>.png`, `entries/<date>.json`, `rules.jsonl`.
Scripts: `${CLAUDE_PLUGIN_ROOT}/scripts/`. Everything is local; nothing is uploaded.

## 1. Collect (facts first, never from memory)

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/collect.mjs" --date <YYYY-MM-DD> --cwd "$PWD"
```

Read the JSON: `sessions.count`, `promptSample`, `corrections.samples` (user corrected the agent - heuristic, may include false positives),
`mostErrors` (tool-error-heavy sessions), `stopHookLoops` (re-prompted by a Stop hook 2+ times), `compactions`, `tokens`,
`commits.list` / `commits.reverts`, and `suggested.weather` / `suggested.grade` (a starting point, you may overrule it with a reason).
Open the suspicious sessions (`~/.claude/projects/<file>`) before you claim anything. An empty day is a normal day: write a short one or skip.

## 2. Read the past

Read the last 7 diaries in `diary/*.md` and run `node "${CLAUDE_PLUGIN_ROOT}/scripts/rules.mjs" status`.
If today's mistake is one that already has a tag, it is a repeat.

## 3. Write `diary/<date>.md`

Plain markdown, short diary voice, concrete numbers, no cheerleading. "Learned nothing today" is a valid entry; do not squeeze.

```
# <date> (<weekday>) - <the day in one line>
> sessions N, commits N, reverts N, corrections N

## Done today          (3-6 items, results not process)
## Wasted today        (time, tokens, retries, reverts - with numbers, and why it leaked)
## Learned             (something you did not know this morning, with evidence)
## Lesson              (what to do differently; say whether it is already enforced by a hook/test)
## Note to tomorrow's me
```

Never write secrets, tokens, customer data or absolute paths. Do not name the user's employer or private projects unless the user wants them public.

## 4. Mistakes and rules

For each mistake that happened today, give it a short kebab-case tag and record it:
`node "${CLAUDE_PLUGIN_ROOT}/scripts/rules.mjs" hit <tag>`.
When it says CANDIDATE (same tag on 2+ different days), write one imperative rule sentence and add it:
`rules.mjs add --tag <tag> --rule "<one sentence>" --source diary/<date>.md`.
Then `rules.mjs review` (dry run). If it lists GRADUATE, RETIRE or REGRESS, apply with `review --apply` and tell the user in one line each.
For graduated rules ask whether a hook, linter or test could enforce it instead of a sentence, and offer to write it.
Only run `rules.mjs sync --file <project CLAUDE.md>` when the user asked for it or that file already has the `<!-- picture-diary:rules -->` block; show `sync --dry-run` first otherwise.
A newly written rule candidate goes into the picture's red-pen line (`teacher.comment`).

## 5. Draw one scene

Pick the single funniest or most telling moment of the "wasted" section. Write `entries/<date>.json`:

```
{ "date": "2026-10-23", "weather": "sun|cloud|rain|storm|fog", "grade": "great|good|try|redo",
  "title": "short, <= 20 chars", "drawing": "<svg inner markup>", "text": "...",
  "teacher": { "comment": "red pen: today's rule candidate, <= 20 chars" }, "footer": "optional small line" }
```

- weather: sun = everything passed, cloud = ordinary/bumpy, rain = builds or tests failed, storm = outage/reverts/loops, fog = context was compacted and the agent forgot things.
- grade (the teacher's stamp): great = clean day, good = minor slips, try = repeated slips, redo = a mistake that already has a rule happened again. Base it on the numbers.
- text: child's voice, 4-5 short sentences, about 100 characters in Korean (hard limit ~110) or 35 words in English. Plain, a little proud, a little wrong about why. End with one dry adult joke line as its own paragraph (English: "Grown-up note: ...").
- drawing: SVG elements only (no `<svg>` wrapper, no `<script>`, no external images), coordinate space 0 0 1000 560, thick strokes (4-8), flat colors, 5-9 shapes, at most 2-3 short text labels (`font-family='Gaegu' font-weight='700'`). Keep the subject inside x 110..890 so the `--story` crop keeps it, and keep labels above y 520. Stick-figure style; the agent can be a round blob with big eyes. Look at `${CLAUDE_PLUGIN_ROOT}/docs/sample-en.json` for a worked example.
- streak is computed automatically from consecutive `entries/<date>.json` files.

## 6. Render and look

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/render.mjs" "$HOME/.picture-diary/entries/<date>.json" [--lang en] [--story]
```

(Use `$PICTURE_DIARY_HOME` instead of `~/.picture-diary` if set.) It prints the PNG path. The first run installs its renderer by itself; just wait. If no browser exists it writes an HTML file instead and says so.
Open the PNG with the Read tool and check: nothing clipped, nothing overlapping, the text is in the grid, the drawing is readable. Fix the entry and re-render until it is clean. If the warning says the text needs too many rows, shorten it.
If the user wants to share it, also render `--wide` (1200×630 card with the repo link) and add `--copy` to put it on the clipboard. Remind them to look for private project names first.

## 7. Report

Show the PNG path and the markdown path. One line each for new candidates, graduations, retirements. Remind the user the picture contains what the agent wrote, so skim it before posting (paths and user names are masked automatically; project names and prompts are not).

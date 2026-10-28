---
name: recall
description: Look up past diary entries and the rules ledger and apply them to the task at hand. Use before starting work that resembles something that went wrong before, or when the user says "recall", "what did we learn about X", "have we done this before", "과거 일기 찾아줘", "전에도 이랬나".
---

# Recall

Search, do not preload. Past diaries are never injected wholesale; pull only what matches the task.

1. Pick 2-4 keywords from the current task (tool names, error text, file or feature names; both languages if the user mixes them).
2. Search the diaries and the ledger:
   ```
   H="${PICTURE_DIARY_HOME:-$HOME/.picture-diary}"
   grep -rniE "kw1|kw2" "$H/diary" --include='*.md' | head -40
   grep -iE "kw1|kw2" "$H/rules.jsonl"
   node "${CLAUDE_PLUGIN_ROOT}/scripts/rules.mjs" status
   node "${CLAUDE_PLUGIN_ROOT}/scripts/rules.mjs" report   # when asked whether the rules are working
   ```
3. Read only the matching sections of the 1-3 most relevant diaries.
4. Answer in this order: (a) rules in force that apply to this task (state graduated, active, or retired), (b) what went wrong last time and on which date, (c) what you will do differently now, as a concrete step.
5. If today's task repeats a known mistake, say so before starting. If you then make the mistake anyway, record it with `rules.mjs hit <tag>`.

If nothing matches, say "no history on this" and move on. Do not invent a lesson.

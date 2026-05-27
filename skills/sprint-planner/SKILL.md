---
name: sprint-planner
description: Plan the next micro-sprint for the Sanders Intelligence app. Use when the user says "plan the next sprint", "groom the backlog", "what should we work on next", "re-prioritize tasks", "pull Asana tasks and pick a sprint", or any request that involves syncing Asana backlog with codebase state and producing implementation briefs. Audits the Asana backlog against the codebase, closes already-done tasks, re-ranks open work with a balanced recency+priority+dependencies rule, picks 2-3 candidates for the next 1-day sprint, and emits a JSON brief at D:\Sanders Intelligence\sprints\Sprint_YYYY-MM-DD.json.
---

# Sprint Planner — Sanders Intelligence

A repeatable workflow for grooming the Asana backlog, reconciling it with the actual codebase, and producing a JSON implementation brief for the next micro-sprint (1 day).

## When to invoke

User intents that should trigger this skill:
- "Plan the next sprint" / "groom the backlog" / "what should we work on next"
- "Pull Asana tasks and figure out what's next"
- "Re-prioritize the backlog" / "re-establish priorities"
- "Close any outdated tasks and pick the next sprint"

## Inputs the skill assumes are already available

- **Asana project:** `Sanders intelligence app`, GID `1214535706843813`
- **Repo root:** `D:\Sanders Intelligence`
- **App source:** `D:\Sanders Intelligence\app\src`
- **Sprint cadence:** 1 day (micro-sprint) — confirm with user if unclear
- **Default priority rule:** balanced (recency boost + existing priority + dependencies). Ask if the user wants strict-recency or flag-only mode.
- **Default sprint size:** 2-3 tasks (1 small, 1 medium, optionally 1 stretch)
- **Output path:** `D:\Sanders Intelligence\sprints\Sprint_YYYY-MM-DD.json`

## The 7-step workflow

### Step 1 — Clarify with the user (AskUserQuestion)
Always confirm before starting:
1. **Sprint cadence** (micro/1-day, weekly, 2-week)
2. **Priority rule** (recency-first / balanced / flag-only)
3. **Sprint size** (default 2-3 tasks)
4. Any **must-include or must-exclude** tasks for this sprint

Skip the question only if the user has already specified all four.

### Step 2 — Pull the Asana backlog
Use `mcp__014c249c-b1c6-4fb2-88bd-a656f40c0128__get_tasks` with:
- `project`: `1214535706843813`
- `limit`: 100
- `opt_fields`: `gid,name,notes,due_on,start_on,completed,created_at,modified_at,memberships.section.name`

Capture both open and completed tasks in one pass. The Backlog section GID is typically `1214535706843815`; the Ready (done) section is `1214535706843823`.

### Step 3 — Audit the codebase
For EACH open task, decide whether it's already implemented. Use `Grep` on the most distinctive symbol or string in the task title/notes. Anchor evidence by file + line number — never close a task without citation.

Quick audit map (use as a starting point, not a script — the codebase evolves):

| Task pattern | Where to look |
|---|---|
| Profit / margin features | `app/src/lib/financialMetrics.ts`, `app/src/hooks/useSkuMetrics.ts`, `*.helpers.ts` |
| Vendor View changes | `app/src/pages/purchasing/VendorView.tsx` + `VendorView.helpers.ts` |
| Inventory Browser | `app/src/pages/purchasing/InventoryBrowser.tsx` + helpers |
| Executive Summary | `app/src/pages/csuite/ExecutiveSummary.tsx` + helpers |
| Action Center / dismissals | `app/src/pages/purchasing/ActionCenter.tsx` + helpers + `useDismissedActions.ts` |
| Task creation | `app/src/components/tasks/TaskModal.tsx` + helpers, `app/src/hooks/useTasks.ts` |
| Data freshness banner | `app/src/components/layout/DataFreshnessBar.tsx` |
| Auth / users / uploads | `app/src/pages/admin/*`, `app/src/contexts/AuthContext.tsx` |
| Edge functions / cron | `supabase/functions/` (if absent, the task is not done) |
| Migrations | `supabase/migrations/` |
| Test coverage | `app/src/__tests__/*.test.ts` |

**Output of this step:**
- List of tasks to CLOSE (already done) with file:line evidence.
- List of tasks that are PARTIALLY done — keep open but adjust scope in the brief.
- List of tasks that are still NOT STARTED.

### Step 4 — Close the outdated tasks in Asana
For each task to close:
1. `mcp__014c249c-b1c6-4fb2-88bd-a656f40c0128__add_comment` with the evidence (file paths + line numbers). Use this template:

```
Closing - already implemented in the codebase (verified during sprint planning audit on YYYY-MM-DD).

Evidence:
- <path>:<line> - <what it shows>
- <path>:<line> - <what it shows>
- Tests in <test_file>.

All completion criteria from the original brief are met. Closing.
```

2. `mcp__014c249c-b1c6-4fb2-88bd-a656f40c0128__update_tasks` with `{ "completed": true }`.

### Step 5 — Re-rank remaining backlog (balanced rule)
Compute a priority score per task. The default balanced rule:

```
score = recency_boost + existing_priority_boost + dependency_pressure - scope_penalty

recency_boost          = max(0, 10 - days_since_created)
existing_priority      = +5 if title contains BUG, +3 if FEATURE, +2 if Phase 2, +1 if Phase 3, 0 otherwise
dependency_pressure    = +3 if other open tasks reference this one's keywords
scope_penalty          = -2 if title contains "Phase 3" or "after SI App integration"
```

Then assign due dates by stacking tasks across micro-sprints (1 task per day for solo, 2-3 for a team day) starting **tomorrow**. Push Phase 3 / "after integration" items into late-month or quarter buckets. Use `mcp__014c249c-b1c6-4fb2-88bd-a656f40c0128__update_tasks` in batches of up to 50 to apply the new `due_on` values.

Always convert relative dates to absolute YYYY-MM-DD before writing.

### Step 6 — Pick 2-3 sprint candidates and write the JSON brief
Selection criteria for sprint candidates:
- **Recency boost wins ties** (recently added > old backlog).
- Prefer at least one **small (~1-2h)** task so the sprint always lands something.
- Prefer tasks where the supporting infrastructure already exists (partial wins).
- Avoid tasks blocked on external integrations the user hasn't unblocked yet.
- Never select a task whose `clarifying_questions` would force a 2-day delay before any code is written — unless the user pre-answered them.

Write the brief to `D:\Sanders Intelligence\sprints\Sprint_YYYY-MM-DD.json`. **The schema is fixed — see `template_sprint.json` in this skill directory for the canonical shape.**

Every task entry MUST include:
- `asana_task_id`, `asana_url`
- `title`, `type`, `scope`, `estimated_hours`, `due_date`
- `outline` (one-paragraph "why")
- `technical_description` (where it lives in code + what existing patterns to reuse)
- `likely_files` (paths + line ranges)
- `requirements` (numbered list of must-haves)
- `completion_criteria` (testable acceptance checks)
- `expected_outcomes` (user-visible payoff)
- `test_coverage` with `unit`, `integration`, `manual_qa` sub-arrays
- `clarifying_questions` (asked before code is written)
- `pre_implementation_instruction`

### Step 7 — Verify
Before declaring the sprint planned:
- Confirm the Asana backlog state matches what was written (re-pull the task list).
- Open the JSON file and scan for missing fields (every task must hit every required key).
- Confirm the sprint dates make sense relative to today (no due_on in the past).
- Use TaskList to confirm internal task tracker is closed out.

## Surface to user when done

End with a short summary in chat (no bullet-heavy report):
- How many tasks closed and why
- How many remained and the new date range
- Which 2-3 tasks landed in the next sprint and why
- Path to the JSON brief as a `computer://` link

## Files in this skill

- `SKILL.md` — this file
- `template_sprint.json` — canonical JSON shape for sprint briefs. Always start from this template; never invent a new shape.
- `audit_map.md` — extended map of task-pattern → code locations. Add to this when a new feature area gets its own home.

## Notes for future sessions

- The repo's `CLAUDE.md` describes the stack and code map — read it before the audit step.
- The previous sprint's brief at `D:\Sanders Intelligence\sprints\` is the best example of voice and depth.
- When the user says "next sprint" without specifying a date, default to **tomorrow** (today + 1 day, calendar day).
- The Asana project has historically had ~50 completed tasks and ~30 open — expect that scale, not enterprise scale.

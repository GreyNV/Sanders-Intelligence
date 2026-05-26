---
name: qa-runner
description: Run a manual QA smoke test of the Sanders Intelligence app, file bugs and missing-test-coverage tasks in Asana. Use when the user says "run QA", "do a QA pass", "smoke test the app", "test the app and log bugs", "regression run", or any request that involves opening the local app, walking the pages, and creating issues for what's broken or untested. Probes the local dev server, logs in via Chrome autofill as admin, visits every route, captures console errors and UI mismatches, inspects test coverage gaps in the codebase, and files BUG / FEATURE tasks in the Asana Backlog.
---

# QA Runner — Sanders Intelligence

A repeatable workflow for taking the app for a spin, reconciling what's running against what's in Asana, and filing issues for anything broken or untested.

## When to invoke

User intents that should trigger this skill:
- "Run QA" / "do a QA pass" / "smoke test the app"
- "Test the app and log bugs"
- "Regression run before we ship"
- "Check the app and create issues for anything broken"

## Inputs the skill assumes

- **Local dev URL:** `http://localhost:5173/` (Vite default for this repo)
- **Asana project:** `Sanders intelligence app`, GID `1214535706843813`
- **Asana Backlog section GID:** `1214535706843815`
- **Default login:** Chrome autofill as admin (Andrew, rybak0701@gmail.com). Ask if user wants a different role.
- **Default QA scope:** smoke test all pages. Ask if user wants focused or full regression instead.
- **Tools to use:** Claude in Chrome MCP (preferred) + Read/Grep for codebase. Bash is often unavailable on this machine — do not depend on it.

## The 8-step workflow

### Step 1 — Clarify with the user (AskUserQuestion)
Confirm before starting:
1. **Credentials path** (Chrome autofill / paste in chat / known test account)
2. **QA scope** (smoke / focused-on-recent / full regression)
3. **Role(s)** to test as (admin alone is usually enough)
4. **Where to save the skill** (skip if it already exists)

### Step 2 — Probe the dev server
Use `mcp__Claude_in_Chrome__tabs_context_mcp` then `mcp__Claude_in_Chrome__navigate` to `http://localhost:5173/`. If the page loads (title becomes "Sanders Intelligence"), the dev server is up. If the navigation errors or hangs longer than ~15s, ask the user to start it manually with `cd app && npm run dev` (we typically don't have shell access on this machine; do NOT try to spawn the server via computer-use unless the user explicitly asks).

### Step 3 — Authenticate
If autofill kicks in, the page lands at `/purchasing/action-center` (admin home) with the user's name visible in the sidebar footer. If you land on `/login` instead, ask the user to type the credentials themselves — never auto-fill credentials yourself, and never store them in memory.

### Step 4 — Walk every route as admin
In order, navigate to each and capture: (1) a screenshot, (2) any console errors via `mcp__Claude_in_Chrome__read_console_messages`, (3) one or two specific data points to compare against expectations.

| Route | What to check |
|---|---|
| `/purchasing/action-center` | KPI cards populated; Attention Required grouped by vendor; Open Backorders below; Snooze + Task buttons present per row |
| `/purchasing/inventory` | Page count + total SKU count match ("Page 1 of N · M results"); filter dropdowns work; Export to Excel button visible |
| `/purchasing/inbound` | KPI cards; arrival-month bar chart present; table sortable; status badges; **regression-check**: x-axis should include every month in range even if zero units (this was 1214683866413708) |
| `/purchasing/vendors` | 5 KPI cards including Total Profit (30D); table has Total Profit (30D) column; sort works; expanded row shows window metrics |
| `/executive` | Inventory Health bar; 5 KPIs; pie + bar chart; Top Risk Suppliers list; **regression-check**: bar chart shows actual top-8, not top-5 (1214683866413706) |
| `/executive/departments` | Phase 3 placeholder; "Currently active departments: Purchasing" link present |
| `/tasks` | Task board / list with status grouping toggle; New Task button; if zero tasks, empty state shows "No tasks" |
| `/admin/users` | User list with role badges, Active/Inactive status, Edit / Reset PW / Deactivate or Activate buttons |
| `/admin/uploads` | Drop zone + upload history table; latest row is today; CSV download buttons present |

**Performance smoke test:** at least once, press F5 on a heavy page (Action Center or Inventory Browser). If the renderer freezes for >20s (screenshot tool times out), that's a bug — file it.

### Step 5 — Triage findings
Categorize each observation as one of:
- **Bug** (functional defect, visible regression, data mismatch, performance regression)
- **Already-fixed task** (the prior sprint's "to-do" turned out to be done in the code) — close it in Asana with file:line evidence (mirror the close-comment format from the sprint-planner skill)
- **UX nit** (cosmetic; not blocking) — note but do not file unless severity warrants
- **Not a bug** (looks weird but is expected by design)

### Step 6 — Inspect test coverage
For each file in `app/src/**/*.helpers.ts` and `app/src/lib/**.ts` and `app/src/hooks/**.ts`, check if a matching test file exists in `app/src/__tests__/`. Use `Glob` and `Grep` together.

Pattern:
- Helper file `app/src/pages/X/Y.helpers.ts` → expect `app/src/__tests__/Y.helpers.test.ts`
- Library `app/src/lib/Z.ts` → expect `app/src/__tests__/Z.test.ts`
- Hook `app/src/hooks/useFoo.ts` → expect `app/src/__tests__/useFoo.test.ts`

For each missing test pair, especially for **modules that touch money, auth, or pagination**, file a FEATURE ticket.

### Step 7 — File issues in Asana
Use `mcp__014c249c-b1c6-4fb2-88bd-a656f40c0128__create_tasks` with `default_project: "1214535706843813"` and `section_id: "1214535706843815"` (Backlog).

Bug ticket conventions:
- Name starts with `BUG: ` and reads like a sentence
- Notes include: discovery date + role + repro steps + likely cause + suggested fix path
- Due date: ~3 days out for high-severity, ~1 week for medium

Feature ticket conventions:
- Name starts with `FEATURE: Add unit/integration tests for X` (or `FEATURE: Extract X helpers and add coverage`)
- Notes include: audit date + why this matters (cite the prior bug or risk it would catch) + the work plan as a numbered list + clarifying questions
- Due date: stack 1-3 weeks out so they don't crowd active sprint work

### Step 8 — Verify and surface
- Re-pull the Asana task list to confirm new GIDs exist.
- If any sprint-candidate tasks were closed during QA, ping the user that the next sprint plan needs revisiting.
- Surface a short summary in chat: how many bugs filed, how many coverage tasks filed, any sprint tickets closed, any open questions.

## What to NOT do

- Do not start or stop the dev server programmatically via computer-use — ask the user.
- Do not enter credentials into the login form yourself. Autofill or user-typed only.
- Do not file every minor UX nit as a bug — keep the Backlog signal high.
- Do not skip the test-coverage pass; it's the most valuable half of this workflow.

## Files in this skill

- `SKILL.md` — this file
- `qa_checklist.md` — the route-by-route checklist as a standalone document the user can print or paste into a PR
- `coverage_audit_template.md` — quick reference for which files should have tests and which currently don't

## Notes for future sessions

- The renderer can freeze on F5 reload of heavy pages (12k+ SKU rows). Recovery: navigate to a different route to unfreeze the tab. This is a known issue worth filing the first time it appears each session.
- The freshness banner now displays both upload date AND mySQL pull recency. When the user complains "data looks stale", check both timestamps in the banner before assuming an upload bug.
- Asana search_tasks is premium-only; use `get_tasks` with `project` instead.
- When in doubt about whether a task is done, search the running app first (Chrome MCP) before grepping the code. Code can lag the live app if a feature was just deployed.

# Sanders Intelligence — Asana Backlog Triage Plan

**Prepared:** 2026-05-22 (Friday)
**Asana project:** Sanders intelligence app
**Backlog reviewed:** 29 open tasks
**Active implementation scope:** `Next_Sprint_Implementation_Prompts.json`

---

## How to read this plan

The Asana workspace is on a free plan, which means custom fields (a native
Priority field) and task start dates are unavailable. Priority is therefore
expressed entirely through **due dates**: the earlier a task is due, the higher
its priority. Every backlog task now carries a due date, and together those
dates form one continuous phased roadmap running from late May to mid-December
2026. The three highest-priority tasks have additionally been moved into the
**In progress** section.

This plan is the result of reviewing every task, classifying it by effort and
value, and sequencing the whole backlog. No code was changed and no task names
or descriptions were edited.

---

## Changes already applied in Asana

- **Due dates set on all 29 backlog tasks**, forming the phased roadmap below.
- **3 tasks moved from Backlog to In progress** (the three critical bugs listed
  in the next section).
- Nothing else was modified — task names, descriptions, assignees, and the
  Ready section were left untouched.

---

## Quick + important tasks (completable now)

"Quick and important" here means: well-scoped, low-to-moderate effort, high
value, and **not blocked** by an external dependency (in this backlog the main
blocker is the future "SI App integration"). Disregarding any pre-existing
priority or dates, the following nine tasks qualify as completable now and were
sequenced into the first three weeks of the roadmap:

1. BUG: Inventory Browser SKU links are non-functional — *completed*
2. BUG: Negative on-hand inventory quantities in Action Center — *cancelled*
3. Bug: Executive vs Vendor "% of COGS" mismatch (Moozi) — *completed*
4. BUG: Corrupted record with numeric-only SKU "546"
5. BUG: Sorting profit data in the Inventory Browser — *completed*
6. Feature: Inventory Browser — sort by % of COGS — *completed*
7. Feature: Task-creation SKU table — add PM% column + sort by Margin % — *completed*
8. Feature: Vendor view — total profit by vendor — *completed*
9. MVP hardening trio — Inbound Pipeline verification, mobile responsiveness,
   and the QA pass on error / empty / loading states

---

## The three tasks moved to In progress

These were the highest-importance items initially selected for implementation.
They were chosen because each undermines trust in, or usability of, the live
app, and each is concrete and well-defined. The active next-sprint prompts now
live in `Next_Sprint_Implementation_Prompts.json`.

| Task | Due | Why it is top priority |
|---|---|---|
| BUG: Inventory Browser SKU links non-functional | 2026-05-27 | **Completed** - SKU text is now non-clickable plain text until a real SKU detail view exists. |
| BUG: Negative on-hand inventory in Action Center | 2026-05-28 | **Cancelled** - source-system data-quality issue; existing UI warning patterns are sufficient for now. |
| Bug: Executive vs Vendor "% of COGS" mismatch | 2026-05-29 | **Completed** - Executive and Vendor views now use accrual revenue/profit for COGS% and Margin%, with `N/A` for unavailable metrics. |

---

## Phased roadmap

### Tier 1 — In progress · critical bugs (due May 27–29)

The three bugs above were initially selected because they were live defects and
the fastest path to a more trustworthy app. The negative on-hand item is now
cancelled because it is a source-system data-quality issue and no app-side
change is needed beyond the warning patterns already present.

### Tier 2 — Completed implementation + remaining quick win (due Jun 3–5)

| Task | Due |
|---|---|
| BUG: Corrupted record with numeric-only SKU "546", missing brand, $0 cost | 2026-06-03 |
| BUG: Sorting profit data in the Inventory Browser — **Completed** | 2026-06-04 |
| Feature: Inventory Browser — sort by % of COGS — **Completed** | 2026-06-05 |

### Tier 3 — MVP hardening + small features (due Jun 10–19)

| Task | Due |
|---|---|
| Feature: Task-creation SKU table — add PM% + sort by Margin % — **Completed** | 2026-06-10 |
| Feature: Vendor view — total profit by vendor — **Completed** | 2026-06-11 |
| MVP: Inbound Pipeline — verify arrival-month grouping & ETA accuracy | 2026-06-15 |
| MVP: Mobile responsiveness review | 2026-06-18 |
| MVP: QA pass — error / empty / loading states across all views | 2026-06-19 |

### Tier 4 — Phase 2 (due Jun 30 – Jul 31)

| Task | Due |
|---|---|
| Phase 2: Auto-task creation — Edge Function flags stockouts after upload | 2026-06-30 |
| FEATURE: Data snapshots + re-opened task tracking — **NEEDS BREAKING DOWN** | 2026-07-03 |
| Phase 2: Email alerts — daily digest for purchasing team | 2026-07-10 |
| Phase 2: Slack integration — post stockout alerts to channel | 2026-07-17 |
| Phase 2: Day view — daily breakdown + Definition-of-Done changes | 2026-07-28 |
| Feature: Alert when cost rises % → prompt sales to raise price | 2026-07-31 |

### Tier 5 — Phase 3 & SI-integration-blocked work (due Aug 14 – Dec 18)

| Task | Due |
|---|---|
| Phase 3: SI app DB connector — live sync from source system | 2026-08-14 |
| FEATURE: Executive date filter (after SI App integration) | 2026-08-21 |
| FEATURE: CBM data in container/order recommendation (after SI App integration) | 2026-08-25 |
| Feature: Move the Monday board into the app | 2026-09-04 |
| Feature: Attach files/attachments to each PO/Container | 2026-09-11 |
| Feature: Phase 3 PO & container creation by vendor (profitability + CBM) | 2026-09-18 |
| Phase 3: Vendor login portal — ETA/container updates, price-increase notices | 2026-10-09 |
| Phase 3: PO template upload + PO export PDF | 2026-10-23 |
| Feature: Stage 3 — analyze email for shipment delays | 2026-11-06 |
| Phase 3: AI chatbox — natural-language queries over inventory | 2026-11-20 |
| Phase 3: Department expansion — HR / finance / ops dashboards | 2026-12-04 |
| Phase 3: Multi-warehouse support — location-based inventory views | 2026-12-18 |

---

## Notes & flags

- **Future SKU detail view.** The current fix for the Inventory Browser SKU
  link bug is to keep SKU text non-clickable so the UI does not promise a
  missing detail page. A future feature should add an intentional SKU detail
  route or drawer that can support uploaded/scraped item images, stock levels,
  price, cost, margins, sales dynamics, and related item metrics.
- **Cancelled negative on-hand bug.** Negative on-hand quantities are a source
  data-quality issue. Since the app already has warning patterns for source data
  concerns, no additional UI, KPI, or upload-validation work is planned for this
  task.
- **COGS and margin definition.** COGS% is `(revenue - profit) / revenue` and
  Margin% is `profit / revenue`, using the 30-day accrual profit metrics where a
  single supplier-level figure is shown. Missing revenue/profit metrics display
  as `N/A`.
- **"NEEDS BREAKING DOWN" task.** The data-snapshots / re-opened-task-tracking
  feature was placed deliberately early in Phase 2 (due 2026-07-03) so its
  decomposition into smaller tasks can happen before the rest of Phase 2 work
  is committed. Treat its due date as a "broken down by" date, not a "shipped
  by" date.
- **SI-integration-gated work.** The Executive date filter and the CBM-data
  recommendation feature both depend on the Phase 3 SI app DB connector
  (due 2026-08-14). They are sequenced immediately after it; if the connector
  slips, both should slip with it.
- **Data-quality bugs share a root cause.** The negative on-hand quantity and
  the corrupted "546" record both originate in the uploaded source CSV. Beyond
  the individual fixes, this argues for adding validation at upload time in the
  CSV Edge Function — worth folding into the Phase 2 auto-task / upload work.
- **Free-plan constraints.** If the team upgrades Asana, this roadmap would
  benefit from a real Priority custom field and task start dates, which would
  let priority and effort be tracked independently of the due date.

---

## What happens next

The completed/cancelled Tier 1 work and completed Tier 2 Inventory Browser
metrics-sorting work are reflected above. The corrupted SKU `546` source-data
issue remains out of scope unless the source-data policy changes. Current
the Task-creation SKU table Margin % and Vendor View total profit features are
now implemented. The next Tier 3 implementation candidates are MVP Inbound
Pipeline verification, mobile responsiveness review, and the QA pass for error,
empty, and loading states.

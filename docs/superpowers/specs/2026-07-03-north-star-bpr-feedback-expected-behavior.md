# North Star BPR Feedback Expected Behavior

**Prepared:** 2026-07-03
**Priority:** User feedback first
**Surface:** `/executive/north-star`
**Primary files:** `app/src/pages/csuite/NorthStar.tsx`, `app/src/pages/csuite/NorthStar.helpers.ts`

## Source Feedback

The next implementation batch comes from the 2026-07-02 feedback screenshot:

- Freeze headers
- Sorter owners
- Conference format can be viewed on a large screen
- Change Off plan to blocked
- Change On plan to on track
- Change At Risk to Off track with a plan

## Status Language

The database status values stay unchanged:

| Stored value | Current label | Expected label | Tone |
|---|---|---|---|
| `on_plan` | On plan | On track | Success / green |
| `at_risk` | At risk | Off track with a plan | Warning / amber |
| `off_plan` | Off plan | Blocked | Danger / red |

Expected behavior:

- The top status legend uses the new labels.
- The status select dropdown uses the new labels.
- Read-only status badges use the new labels.
- Existing saved rows do not require migration.
- The status colors and enum values remain stable so the existing Supabase RPC and history records continue to work.

## Owner Sorting

Default BPR order remains `slot_index` ascending.

Expected behavior:

- The Owner header becomes sortable.
- First owner click sorts owner ascending.
- Second owner click sorts owner descending.
- Rows with blank owners sort last in both directions.
- Rows with the same owner sort by `slot_index`.
- Editing a row does not reset permissions or change save behavior.

## Frozen Headers

Expected behavior:

- BPR column headers remain visible when users vertically scroll through the table.
- Horizontal scroll still works because the table remains wider than the viewport.
- Sticky headers stay inside the BPR table viewport and do not cover the page title, month controls, Sales Star, or Manage pillars controls.

## Conference View

Expected behavior:

- Users can switch from the editable table to a conference-friendly read-only view.
- Conference view uses the same row data and current sort order as the table.
- Conference view shows: pillar, owner, metric, plan, actual, forecast, status, constraint now, this week's move, and last week.
- Conference view uses the renamed status labels and the existing row status color semantics.
- Conference view is optimized for desktop and meeting-room displays.
- Conference view does not show inline edit controls, save icons, remove buttons, or Manage pillars actions.
- Returning to table view restores the existing editing workflow.

## Out Of Scope

- No database migration for the status labels.
- No changes to `NorthStarStatus` enum values.
- No changes to `update_north_star_progress`.
- No changes to Monthly Star sales calculations.
- No new route unless implementation proves a separate route is cleaner than a local view toggle.

## Verification

Required automated checks:

```powershell
cd app
npm run test -- NorthStar
npm test
npm run build
```

Manual QA if authenticated browser access is available:

- Open `/executive/north-star`.
- Confirm labels are `On track`, `Off track with a plan`, and `Blocked`.
- Sort by Owner ascending and descending.
- Scroll the BPR table vertically and confirm headers remain visible.
- Switch to conference view and confirm it is read-only and readable on a large desktop viewport.


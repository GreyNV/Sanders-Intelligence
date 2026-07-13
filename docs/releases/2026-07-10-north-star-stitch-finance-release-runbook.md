# North Star Stitch Finance Release Runbook

**Release type:** Feature release
**Target deploy path:** push to `origin/main` after verification
**Primary production surfaces:** `/executive/north-star`, `/executive/stitch-north-star`, `/admin/uploads`

## Release Contents

1. North Star/BPR preservation
   - Status labels, owner sorting, sticky headers, conference view, and executive progress editing remain stable.

2. Stitch North Star completion
   - Pillar tabs use existing pillar names.
   - Owner deck modal remains editable during presentation.
   - Constraint and this week's move share slide space.
   - Light/dark theme support remains active.

3. Monthly Star finance presentation
   - Finance table/deck row uses live Monthly Star sales data.
   - Daily lift and lift % are displayed.
   - MTD actual and forecast can be locally overridden during the session only.
   - Ryan owns Monthly Star presentation rows.

4. Leadership tool upload
   - Admin uploads `.xlsx` or `.xlsm` leadership workbook.
   - Upload replaces the current snapshot.
   - Parsing applies automatically.
   - Finance rows auto-populate from cashflow, payroll, PnL, sales simulation, and Monthly Star data.

## Release Sequence

### Phase 1: Baseline Freeze

- Confirm no unrelated dirty files are included in the release.
- Keep existing sales reconciliation changes separate unless they are required for Monthly Star correctness.
- Run:

```powershell
cd D:\Sanders Intelligence\app
npm run test -- NorthStar StitchNorthStar --reporter=dot
```

### Phase 2: Data Foundation

- Add Supabase migration for a singleton leadership snapshot table.
- Apply migration in Supabase.
- Verify active users can read the latest snapshot and only admins can replace it.

Verification SQL:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name = 'leadership_tool_snapshot';
```

### Phase 3: Parser And Upload

- Add browser-side workbook parser for `.xlsx` and `.xlsm`.
- Extend `/admin/uploads` with a leadership-tool upload panel separate from the inventory CSV panel.
- Upload writes parsed snapshot to Supabase immediately.

Focused verification:

```powershell
cd D:\Sanders Intelligence\app
npm run test -- leadership --reporter=dot
```

### Phase 4: Stitch Finance Deck

- Add Daily Lift and Lift % to the Monthly Star metric surface.
- Add local-session override state for Monthly Star MTD actual and forecast.
- Add Ryan's 4 finance slides:
  - Monthly Sales Star
  - Cash runway
  - Payroll by department
  - PnL / 9% NOI
- Confirm generated rows remain editable in presentation mode.

Focused verification:

```powershell
cd D:\Sanders Intelligence\app
npm run test -- StitchNorthStar NorthStar --reporter=dot
```

### Phase 5: Full Verification

Run:

```powershell
cd D:\Sanders Intelligence\app
npm test -- --reporter=dot
npm run build
```

Manual QA with authenticated admin/csuite users:

- `/admin/uploads`
  - Inventory CSV upload still accepts only `.csv`.
  - Leadership upload accepts `.xlsx` and `.xlsm`.
  - Leadership upload replaces current snapshot and displays the uploaded filename/date.
- `/executive/north-star`
  - Existing BPR table/editing behavior is unchanged.
- `/executive/stitch-north-star`
  - Pillar tabs are readable.
  - Monthly Star shows Daily Lift and Lift %.
  - MTD actual and forecast can be locally changed and reset on reload.
  - Ryan's deck has four finance slides.
  - Presentation fields remain editable.
  - Light and dark themes both render cleanly.

### Phase 6: Deploy

- Stage only files in this release.
- Run:

```powershell
git diff --cached --check
git status --short
git commit -m "feat: add leadership finance release for stitch north star"
git push origin main
```

- Confirm Vercel deployment succeeds.
- Smoke test production routes after deployment.

## Rollback Plan

If deployment fails before production traffic:

```powershell
git revert <release-commit-sha>
git push origin main
```

If migration succeeds but UI release is reverted:

- Leave `leadership_tool_snapshot` table in place. It is additive and read-only for non-admin users.
- Revert only the app commit.
- Disable the leadership upload panel from the UI if the parser is the failure point.

If uploaded workbook data is wrong:

- Upload the corrected workbook again. The snapshot replacement behavior makes the new upload authoritative.

## Production Watch Points

- Monthly Star totals still come from `sales_daily` when live current-month rows exist.
- Local-session Monthly Star overrides must not write to Supabase.
- PnL NOI % must use the 9% benchmark consistently.
- Leadership workbook formulas must be saved with cached values before upload.
- Upload parsing should fail loudly with sheet/row details if required sheets are missing.

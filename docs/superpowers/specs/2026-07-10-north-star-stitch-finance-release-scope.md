# North Star Stitch Finance Release Scope

**Prepared:** 2026-07-10
**Surface:** `/executive/north-star`, `/executive/stitch-north-star`, `/admin/uploads`
**Primary owners:** Ryan for Monthly Star and finance presentation items; admins for upload and data replacement
**Source workbook:** `C:/Users/W11/Downloads/Weekly Reporting Tool 7.9.26 v1.2 RM.xlsm`

## Release Objective

Ship the next North Star release as one coordinated package: preserve the existing North Star/BPR behavior, complete the Stitch North Star presentation workflow, add finance/Monthly Star presentation rows owned by Ryan, and introduce a leadership-tool upload path that replaces the current finance snapshot and auto-populates finance slide points.

## Included Work

### Existing North Star Baseline

- Keep current `/executive/north-star` Business Plan Review behavior intact.
- Preserve status enum values while using executive labels:
  - `on_plan` -> `On track`
  - `at_risk` -> `Off track with a plan`
  - `off_plan` -> `Blocked`
- Preserve owner sorting, sticky BPR headers, status color coding, and conference view behavior.
- Preserve editable progress fields for admins and csuite users: plan, actual, forecast, status, constraint now, this week's move, and last week.

### Stitch North Star Baseline

- Keep `/executive/stitch-north-star` as a separate C-Suite route.
- Reuse existing North Star rows, Monthly Star data, and update paths.
- Use pillar names as project tabs. Do not add a project field.
- Keep all text fields editable where the source allows edits.
- Keep the owner presentation deck modal editable while presenting.
- Keep the constraint box and this week's move box sharing similar slide space.
- Keep light/dark mode compatibility using the app theme variables.

### Monthly Star Finance Additions

- Add a finance pillar/table row for Monthly Star sales data so it can be included in generated presentation decks.
- Monthly Sales Star should show:
  - Monthly target
  - MTD actual
  - Forecast / projected month-end
  - Daily lift
  - Lift %
  - Gap to target
  - Dragging channels
- MTD actual and forecast must be editable in Stitch only as local-session overrides.
- Local-session overrides must not update `monthly_star`, `sales_daily`, or `north_star_rows`.
- Ryan owns Monthly Star presentation items.

### Leadership Tool Upload

- Add an admin upload interface for the leadership reporting workbook.
- Accept `.xlsx` and `.xlsm`.
- Replace the current leadership snapshot on each upload. Do not keep historical snapshots in this release.
- Parse and apply automatically after upload. Do not require an explicit Apply or Refresh action.
- Store parsed data in Supabase so C-Suite users can read the latest finance snapshot.
- Keep generated presentation fields editable after auto-population.

### Finance Presentation Auto-Population

Auto-populate Ryan's finance deck from:

- Monthly Star sales target, MTD actual, forecast, daily lift, and lift %.
- `Summary_13wks` cashflow runway and floor breach data.
- `Payroll` department payroll variance.
- `PnL` 4-month profit and loss trend.
- 9% NOI benchmark.

Ryan's 4-slide set should include:

1. Monthly Sales Star
2. 13-week cash runway
3. Payroll by department
4. PnL / 9% NOI benchmark

## Workbook Contract

### `Summary_13wks`

- Cash inputs appear in rows 1-15.
- 13-week cashflow table header is row 17.
- Data rows are 18-30.
- Table columns:
  - `Week #`
  - `Week Start Date`
  - `Beginning Cash`
  - `Fixed Outflows`
  - `Tier 1 Vendor Pmts`
  - `Tier 2 Vendor Pmts`
  - `Tier 3 Vendor Pmts`
  - `Vendor Deposits`
  - `Total Vendor Pmts`
  - `Total Outflows`
  - `Ending Cash`
  - `Ending Cash vs Floor`

### `Payroll`

- Flags:
  - A1 `IsPayroll`
  - A2 `IsTotalRow`
- Header row is row 9.
- Department rows are 10-17.
- Columns are grouped by month with:
  - `This Year, $`
  - `Last Year, $`
  - `Difference, %`
- Departments observed:
  - Admin
  - Customer Service
  - Finance
  - Product Development
  - Purchasing
  - Selling
  - Warehouse
  - Grand Total

### `PnL`

- Top KPI rows 2-5 include PM % metrics.
- Month labels begin around row 12.
- Main header row is row 13.
- Account rows are 14-19:
  - Income
  - COGS
  - Expense
  - Other Income
  - Other Expense
  - Grand Total
- Treat row 19 `Grand Total` as NOI for summary purposes.
- Use 9% NOI as the benchmark.

### Hidden Raw Sheets

- `dataPnL` row 1 has structured raw PnL/payroll fields and should be preferred when deeper class-level detail is needed.
- `BgtData` row 1 has budget data.
- `Config` row 1 has keyword, department, account, and class mappings.

## Asana Release Inventory

These Asana tasks define the new finance/leadership-tool release scope:

| Task ID | Scope |
|---|---|
| `1216438794906915` | Add Daily Lift and Lift % to Monthly Sales Star metrics |
| `1216438478019453` | Make Monthly Sales Star fields editable with local-session source-of-truth behavior |
| `1216438758766893` | Add leadership tool upload interface |
| `1216438651610721` | Parse leadership tool cashflow, payroll, PnL, runway, and sales simulation inputs |
| `1216438661477193` | Pre-populate finance pillar presentation points from leadership tool and Monthly Star data |

## Release Acceptance Criteria

- Existing North Star tests pass.
- Existing Stitch North Star tests pass.
- New leadership parser tests pass against matrix fixtures based on the workbook coordinates above.
- New snapshot hook tests or static tests confirm the upload path replaces the current snapshot.
- Admin can upload `.xlsm` from `/admin/uploads`.
- C-Suite can open `/executive/stitch-north-star` and see finance/Monthly Star rows in Ryan's deck.
- Monthly Star MTD actual and forecast edits in Stitch survive within the browser session and clear on reload.
- Monthly Star local-session edits do not change Supabase records.
- Generated finance presentation text remains editable after upload.
- Light and dark modes render without text collapse or unreadable contrast.
- `npm run test -- NorthStar StitchNorthStar leadership --reporter=dot`, full `npm test -- --reporter=dot`, and `npm run build` pass before push.

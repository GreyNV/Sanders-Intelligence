# Implementation Spec — Inventory Browser Sorting (Tier 2)

**Prepared:** 2026-05-22
**Project:** Sanders intelligence app
**Status:** Implemented on 2026-05-23
**Files touched:** `app/src/pages/purchasing/InventoryBrowser.tsx`, `app/src/pages/purchasing/InventoryBrowser.helpers.ts`, and focused tests

## Tasks covered

| Task | Asana | Due |
|---|---|---|
| B — BUG: Sorting profit data in the Inventory Browser | [1215004240586971](https://app.asana.com/1/1207304979265271/project/1214535706843813/task/1215004240586971) | 2026-06-04 |
| C — Feature: Inventory Browser sort by % of COGS | [1215004196463573](https://app.asana.com/1/1207304979265271/project/1214535706843813/task/1215004196463573) | 2026-06-05 |

Both are in the **In progress** section. They are specced together because they share one
refactor; doing them as a pair is the efficient path.

**Implementation result:** Both tasks are implemented in code. Inventory Browser now enriches
rows before sorting, exposes sortable Sell Price and Profit columns, and includes sortable
30-day COGS %. Automated verification passed; rendered interaction QA reached the local app
but could not access the protected inventory route without an authenticated session.

---

## Shared root cause

`InventoryBrowser.tsx` sorts on raw `InventoryRecord` fields only — the `sorted` memo reads
`(record as Record<string, unknown>)[sortKey]`. The Profit Today / 7d / 30d and Sell Price
values do **not** live on the record: they come from `useSkuMetrics()` as the `profitBySku`
and `priceBySku` Maps (keyed by `product_code`) and are looked up inline, per row, at render
time. They never enter the sort model. COGS % is not computed or displayed in this view at
all. Fixing both tasks means building one **enriched row model** that joins each record with
its metric data *before* the filter → sort → paginate pipeline runs.

---

## Task B — Profit columns sortable

### Problem
Profit Today / 7d / 30d and Sell Price render from `skuMetrics.profitBySku.get(...)` /
`priceBySku.get(...)`. Their `<th>` headers are plain (not the `SortTh` component), and even
if they were, `sortKey` indexes the record, which has no profit fields. Result: no sort
affordance and no way to sort by profit.

### Technical requirements
- Define an enriched row type, e.g.
  `InventoryRow = InventoryRecord & { sellingPrice: number|null; profitToday: number|null; profit7d: number|null; profit30d: number|null; cogsPct: number|null }`.
- Build the enriched rows once (`useMemo`) by joining `records` with `profitBySku` / `priceBySku`.
- Run the existing `filtered` → `sorted` → `paged` pipeline on the enriched rows.
- Convert the Profit Today, Profit 7d, Profit 30d and Sell Price headers to `SortTh` with
  keys `profitToday`, `profit7d`, `profit30d`, `sellingPrice`.
- The sort comparator must place `null` metric values **last in both directions** (a SKU with
  no metrics must not jump to the top on a descending sort).
- Row rendering switches from inline Map lookups to reading the enriched row fields — no
  change to displayed values or formatting.

### Completion criteria
- Clicking each of the four headers sorts the table by that metric; a second click reverses
  direction; the ↑/↓ indicator reflects the active column and direction.
- SKUs with no profit/price data always sort to the bottom, ascending **and** descending.
- Displayed values are byte-for-byte identical to today (same numbers, same `-` formatting).
- Search, the status/brand/vendor/class/velocity filters, pagination, and Export to Excel
  all still work and respect the active sort.
- No console errors or warnings.

---

## Task C — Sort by % of COGS

### Problem
The Inventory Browser shows Cost and Sell Price but no COGS %. There is no way to see or
sort by the cost-of-goods ratio per SKU.

### Technical requirements
- Add `cogsPct` to the enriched row, computed per SKU as
  `deriveFinancialPercentages({ revenue: revenue_30d, profit: accrual_profit_30d })` from
  `app/src/lib/financialMetrics.ts` — the same module and 30-day-accrual definition already
  used by the Executive Summary and Vendor View.
- Add a **COGS %** column with a `SortTh` (key `cogsPct`), placed near Cost / Sell Price.
- Cell display: one decimal place + `%`, or **N/A** when `cogsPct` is null (no revenue) —
  consistent with the Vendor View.
- Null `cogsPct` sorts last (uses the shared comparator from Task B).
- Update the `colSpan` on the "No records match filters" row to match the new column count.

### Completion criteria
- A COGS % column is visible in the Inventory Browser table.
- Each cell shows the 30-day COGS % or `N/A`.
- The COGS % header sorts ascending / descending; null values sort last in both directions.
- The value definition matches the Executive and Vendor views exactly: COGS % =
  `(revenue − profit) / revenue`, 30-day accrual.
- No console errors or warnings.

---

## Shared technical notes

- Reuse `app/src/lib/financialMetrics.ts`. No database, schema, or hook changes.
- Approved implementation direction: extract the enriched-row builder and
  null-last comparator into `app/src/pages/purchasing/InventoryBrowser.helpers.ts`
  with focused unit tests.
- The existing `app/src/__tests__/InventoryBrowser.static.test.ts` only asserts the SKU cell
  is not styled as a link — the refactor must keep that intact (do not reintroduce the
  `text-accent` link styling or the `title="Open in Inventory Browser"` attribute).

## Test plan

- In the running local app (`localhost:5173` → `/purchasing/inventory`): click each new
  sortable header, confirm ordering and the ↑/↓ indicator; confirm SKUs with no metrics sit
  at the bottom in both directions; confirm COGS % values and `N/A` handling; confirm
  search / filters / pagination / Export still behave; check the console for errors.
- Add unit tests alongside the existing `__tests__` suite and run them with
  `npm run test`; run `npm run build` after the component wiring is complete.

## Out of scope

- The corrupted "546" record — cancelled, treated as a source-CSV data issue.
- Any change to how profit / price metrics are fetched or stored.
- Adding profit or COGS columns to any other view.

## Confirmed implementation decisions

1. Place **COGS %** immediately after **Sell Price**.
2. Keep **Cls** and **Vel** unsortable and out of scope.
3. Extract `InventoryBrowser.helpers.ts` for enrichment and sorting logic, with unit tests.

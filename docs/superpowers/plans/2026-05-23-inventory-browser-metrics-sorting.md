# Inventory Browser Metrics Sorting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Inventory Browser price/profit fields sortable and add a sortable 30-day COGS % column with consistent missing-data handling.

**Architecture:** Add a pure `InventoryBrowser.helpers.ts` module that enriches inventory records with SKU metric maps and provides a null-last comparator. Keep URL filters, pagination, and rendering in `InventoryBrowser.tsx`, but feed them enriched rows and sortable derived fields.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, TanStack Query metric maps, existing `deriveFinancialPercentages` utility.

---

### Task 1: Enriched Inventory Row Model

**Files:**
- Create: `app/src/pages/purchasing/InventoryBrowser.helpers.ts`
- Create: `app/src/__tests__/InventoryBrowser.helpers.test.ts`
- Read: `app/src/hooks/useSkuMetrics.ts`
- Read: `app/src/lib/financialMetrics.ts`

- [x] **Step 1: Write failing tests for enrichment and COGS semantics**

Create tests using records and metric maps which assert:

```typescript
const row = buildInventoryRows([makeRecord({ product_code: 'SKU-1' })], {
  profitBySku: new Map([['SKU-1', {
    accrual_profit_today: 10,
    accrual_profit_7d: 25,
    accrual_profit_30d: 40,
    revenue_30d: 100,
  }]]),
  priceBySku: new Map([['SKU-1', { selling_price: 17.5 }]]),
})[0]

expect(row.sellingPrice).toBe(17.5)
expect(row.profitToday).toBe(10)
expect(row.profit7d).toBe(25)
expect(row.profit30d).toBe(40)
expect(row.cogsPct).toBe(60)
```

Add a second assertion that missing metric rows yield `null` derived fields.

- [x] **Step 2: Run tests to confirm RED**

Run: `npm run test -- src/__tests__/InventoryBrowser.helpers.test.ts`

Expected: FAIL because `InventoryBrowser.helpers.ts` and `buildInventoryRows` do not exist yet.

- [x] **Step 3: Implement the pure enrichment helper**

Create an `InventoryRow` type extending `InventoryRecord` with:

```typescript
sellingPrice: number | null
profitToday: number | null
profit7d: number | null
profit30d: number | null
cogsPct: number | null
```

Export `buildInventoryRows(records, metrics)`; for every record, read the maps by `product_code`, map missing values to `null`, and compute `cogsPct` via:

```typescript
deriveFinancialPercentages({
  revenue: profit?.revenue_30d ?? 0,
  profit: profit?.accrual_profit_30d ?? 0,
}).cogsPct
```

- [x] **Step 4: Run tests to confirm GREEN**

Run: `npm run test -- src/__tests__/InventoryBrowser.helpers.test.ts`

Expected: PASS.

### Task 2: Null-Last Sort Behavior

**Files:**
- Modify: `app/src/pages/purchasing/InventoryBrowser.helpers.ts`
- Modify: `app/src/__tests__/InventoryBrowser.helpers.test.ts`

- [x] **Step 1: Write failing sort tests**

Add cases for `sortInventoryRows(rows, 'profit30d', true)` and `sortInventoryRows(rows, 'profit30d', false)`:

```typescript
expect(ascending.map(row => row.product_code)).toEqual(['LOW', 'HIGH', 'MISSING'])
expect(descending.map(row => row.product_code)).toEqual(['HIGH', 'LOW', 'MISSING'])
```

Add a COGS sort case to prove the comparator accepts the derived key.

- [x] **Step 2: Run tests to confirm RED**

Run: `npm run test -- src/__tests__/InventoryBrowser.helpers.test.ts`

Expected: FAIL because `sortInventoryRows` is missing.

- [x] **Step 3: Implement sorting**

Export a sortable-key type covering existing inventory fields plus:

```typescript
'sellingPrice' | 'profitToday' | 'profit7d' | 'profit30d' | 'cogsPct'
```

Implement `sortInventoryRows` on a spread copy. Return null/undefined values after non-null values regardless of direction; compare numeric values numerically and string values with `localeCompare`.

- [x] **Step 4: Run tests to confirm GREEN**

Run: `npm run test -- src/__tests__/InventoryBrowser.helpers.test.ts`

Expected: PASS.

### Task 3: Wire Inventory Browser Table

**Files:**
- Modify: `app/src/pages/purchasing/InventoryBrowser.tsx`
- Preserve: `app/src/__tests__/InventoryBrowser.static.test.ts`

- [x] **Step 1: Integrate enriched rows into the pipeline**

Import `buildInventoryRows` and `sortInventoryRows`; create:

```typescript
const rows = useMemo(
  () => buildInventoryRows(records, skuMetrics),
  [records, skuMetrics],
)
```

Filter `rows` rather than raw `records`, and delegate sorted output to `sortInventoryRows(filtered, sortKey, sortAsc)`.

- [x] **Step 2: Add sortable derived headers and render derived fields**

Convert these headers to `SortTh`:

```tsx
<SortTh col="sellingPrice" label="Sell Price" />
<SortTh col="cogsPct" label="COGS %" />
<SortTh col="profitToday" label="Profit Today" />
<SortTh col="profit7d" label="Profit 7d" />
<SortTh col="profit30d" label="Profit 30d" />
```

Place `COGS %` immediately after `Sell Price`, display `N/A` for null COGS values, and use row properties rather than inline map lookups for price/profit cells. Update the empty-state `colSpan` from `18` to `19`.

- [x] **Step 3: Preserve existing behavior**

Keep the SKU cell as:

```tsx
<td className="font-mono text-[11px] text-text1 whitespace-nowrap">{r.product_code}</td>
```

Do not change search/filter parameters, pagination behavior, or CSV export inputs.

- [x] **Step 4: Run focused and full verification**

Run:

```powershell
npm run test -- src/__tests__/InventoryBrowser.helpers.test.ts src/__tests__/InventoryBrowser.static.test.ts
npm run test
npm run build
```

Expected: all tests pass and the production build completes.

# Inventory Balance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Purchasing inventory balance rollforward with admin-managed opening balance, PO receipt movements, and COGS from SellerCloud sales.

**Architecture:** Keep the monthly rollforward math in a pure helper, fetch settings and movement data through a focused TanStack Query hook, and expose the surface through the Purchasing route group. Extend Supabase with an opening balance table, a PO receipt movement ledger, and COGS columns on `sales_daily`; update PO and sales sync code so future syncs populate the movement inputs.

**Tech Stack:** React 18, TypeScript, Vite, TanStack Query, Supabase, Postgres RLS, Vitest, Tailwind, lucide-react.

**Spec:** `docs/superpowers/specs/2026-09-01-inventory-balance-design.md`

## Global Constraints

- Route is `/purchasing/inventory-balance`.
- Visible roles are `admin` and `purchasing`.
- Admins can edit the beginning balance period and value; purchasing users are read-only.
- Formula is `beginning_inventory_value + po_received_value - cogs_amount = ending_inventory_value`.
- PO receipt value is `received_delta_units * unit_price`.
- Sales date basis remains `shipDate`.
- COGS comes from SellerCloud P&L order cost, not estimated SKU cost.
- Public Supabase tables must have RLS enabled, grants scoped to authenticated users, and no `anon` access.
- Use `Promise.all()` for independent frontend data reads.
- Write failing tests before production code changes.

---

### Task 1: Rollforward Helper Contract

**Files:**
- Create: `app/src/pages/purchasing/InventoryBalance.helpers.ts`
- Test: `app/src/__tests__/InventoryBalance.helpers.test.ts`

**Interfaces:**
- Produces: `buildInventoryBalanceRows(input: InventoryBalanceInput): InventoryBalanceRow[]`
- Produces: `inventoryBalanceMonthEnd(periodMonth: string): string`
- Produces: `parseInventoryMoney(value: string): number`
- Produces: exported interfaces `InventoryBalanceSettingsInput`, `InventoryBalanceMovementInput`, `InventoryBalanceSalesInput`, `InventoryBalanceInput`, `InventoryBalanceRow`

- [x] **Step 1: Write failing helper tests**

Create `app/src/__tests__/InventoryBalance.helpers.test.ts` with tests for:

```typescript
expect(buildInventoryBalanceRows({
  settings: { beginning_period_month: '2026-04-01', beginning_inventory_value: 1000 },
  selectedPeriodMonth: '2026-06-01',
  receipts: [
    { period_month: '2026-04-01', received_value: 250 },
    { period_month: '2026-05-01', received_value: 500 },
    { period_month: '2026-06-01', received_value: -50 },
  ],
  sales: [
    { period_month: '2026-04-01', cogs_amount: 100, missing_cogs_count: 0 },
    { period_month: '2026-05-01', cogs_amount: 200, missing_cogs_count: 1 },
    { period_month: '2026-06-01', cogs_amount: 25, missing_cogs_count: 0 },
  ],
})).toEqual([
  { period_month: '2026-04-01', first_date: '2026-04-01', end_date: '2026-04-30', beginning_inventory_value: 1000, po_received_value: 250, cogs_amount: 100, ending_inventory_value: 1150, missing_cogs_count: 0 },
  { period_month: '2026-05-01', first_date: '2026-05-01', end_date: '2026-05-31', beginning_inventory_value: 1150, po_received_value: 500, cogs_amount: 200, ending_inventory_value: 1450, missing_cogs_count: 1 },
  { period_month: '2026-06-01', first_date: '2026-06-01', end_date: '2026-06-30', beginning_inventory_value: 1450, po_received_value: -50, cogs_amount: 25, ending_inventory_value: 1375, missing_cogs_count: 0 },
])
```

Also assert `parseInventoryMoney('$1,234.56') === 1234.56` and invalid input returns `0`.

- [x] **Step 2: Run helper tests to verify RED**

Run: `npm test -- --run src/__tests__/InventoryBalance.helpers.test.ts`

Expected: fail because `InventoryBalance.helpers.ts` does not exist.

- [x] **Step 3: Implement helper**

Create `InventoryBalance.helpers.ts` with UTC month arithmetic, Map-based monthly receipt and sales indexes, two-decimal rounding, and the interfaces named above.

- [x] **Step 4: Run helper tests to verify GREEN**

Run: `npm test -- --run src/__tests__/InventoryBalance.helpers.test.ts`

Expected: pass.

### Task 2: Supabase Migration Contract

**Files:**
- Modify: `supabase/migrations/20260903133038_inventory_balance.sql`
- Test: `app/src/__tests__/inventory-balance-migration.test.ts`

**Interfaces:**
- Consumes: table and column names from the design spec.
- Produces: `inventory_balance_settings`, `po_receipt_movements`, `po_items.last_balance_received_units`, `sales_daily.cogs_amount`, and `sales_daily.cogs_source`.

- [x] **Step 1: Write failing migration tests**

Create `app/src/__tests__/inventory-balance-migration.test.ts` that reads `supabase/migrations/20260903133038_inventory_balance.sql` and asserts it includes:

```typescript
expect(migration).toContain('create table if not exists public.inventory_balance_settings')
expect(migration).toContain('settings_key text not null default')
expect(migration).toContain('create table if not exists public.po_receipt_movements')
expect(migration).toContain('movement_key text not null')
expect(migration).toContain('add column if not exists last_balance_received_units numeric')
expect(migration).toContain('add column if not exists cogs_amount numeric not null default 0')
expect(migration).toContain('alter table public.inventory_balance_settings enable row level security')
expect(migration).toContain('to authenticated')
expect(migration).toContain('revoke all on public.po_receipt_movements from anon')
```

- [x] **Step 2: Run migration tests to verify RED**

Run: `npm test -- --run src/__tests__/inventory-balance-migration.test.ts`

Expected: fail because the migration file is empty.

- [x] **Step 3: Implement migration SQL**

Fill `supabase/migrations/20260903133038_inventory_balance.sql` with idempotent SQL for the settings table, receipt movements table, new columns, indexes, RLS policies, grants, and baseline update:

```sql
update public.po_items
set last_balance_received_units = qty_units_received
where last_balance_received_units is null;
```

- [x] **Step 4: Run migration tests to verify GREEN**

Run: `npm test -- --run src/__tests__/inventory-balance-migration.test.ts`

Expected: pass.

### Task 3: Inventory Balance Hook

**Files:**
- Create: `app/src/hooks/useInventoryBalance.ts`
- Modify: `app/src/types/index.ts`
- Test: `app/src/__tests__/useInventoryBalance.test.ts`

**Interfaces:**
- Consumes: `buildInventoryBalanceRows(input)` from Task 1.
- Produces: `useInventoryBalance(periodMonth: string)` returning `{ settings, rows, selectedRow, setupRequired }`.
- Produces: `useUpdateInventoryBalanceSettings()`.

- [x] **Step 1: Write failing hook tests**

Create `app/src/__tests__/useInventoryBalance.test.ts` with a Supabase-like fake client that returns two pages for `po_receipt_movements`, one page for `sales_daily`, and one settings row. Assert returned rows carry the balance from April to May, that `.range(0, 999)` and `.range(1000, 1999)` are called for receipt pagination, and that missing relation errors produce `setupRequired: true`.

- [x] **Step 2: Run hook tests to verify RED**

Run: `npm test -- --run src/__tests__/useInventoryBalance.test.ts`

Expected: fail because `useInventoryBalance.ts` does not exist.

- [x] **Step 3: Implement hook and types**

Add inventory balance types to `types/index.ts`. In `useInventoryBalance.ts`, fetch settings, receipts, and sales with independent requests where possible, paginate raw rows, aggregate by month in TypeScript, and invalidate `['inventory_balance']` after settings updates.

- [x] **Step 4: Run hook tests to verify GREEN**

Run: `npm test -- --run src/__tests__/useInventoryBalance.test.ts`

Expected: pass.

### Task 4: Sales Sync COGS

**Files:**
- Modify: `supabase/functions/sync-sales/index.ts`
- Test: `app/src/__tests__/edge-pagination-guards.test.ts`

**Interfaces:**
- Consumes: SellerCloud P&L fields `OrderCostUsd`, `orderCostUsd`, `OrderCost`, `orderCost`.
- Produces: `cogs_amount` and `cogs_source` on each `sales_daily` upsert row.

- [x] **Step 1: Write failing sync tests**

Extend `edge-pagination-guards.test.ts` to assert `sync-sales` contains `orderCogsAllocations(rows)`, writes `cogs_amount`, selects `cogs_amount` in `mergeSalesRowsWithExisting`, sums existing and incoming `cogs_amount`, and reads `OrderCostUsd` before `OrderCost`.

- [x] **Step 2: Run sync tests to verify RED**

Run: `npm test -- --run src/__tests__/edge-pagination-guards.test.ts`

Expected: fail because `cogs_amount` is not present.

- [x] **Step 3: Implement COGS allocation**

Add order-level COGS grouping, row allocation, missing COGS counts in `source_payload`, `cogs_source`, and merge support while keeping existing revenue precedence unchanged.

- [x] **Step 4: Run sync tests to verify GREEN**

Run: `npm test -- --run src/__tests__/edge-pagination-guards.test.ts`

Expected: pass.

### Task 5: PO Receipt Movement Sync

**Files:**
- Modify: `supabase/functions/sync-purchase-orders/index.ts`
- Modify: `app/scripts/sync-active-purchase-orders.mjs`
- Test: `app/src/__tests__/edge-pagination-guards.test.ts`

**Interfaces:**
- Consumes: `po_items.last_balance_received_units`.
- Produces: idempotent `po_receipt_movements` rows keyed by `movement_key`.

- [x] **Step 1: Write failing PO sync tests**

Extend `edge-pagination-guards.test.ts` to assert PO sync reads existing `last_balance_received_units`, calls `buildReceiptMovements`, upserts `po_receipt_movements` with `onConflict: 'movement_key'`, and sets `last_balance_received_units` on item rows.

- [x] **Step 2: Run sync tests to verify RED**

Run: `npm test -- --run src/__tests__/edge-pagination-guards.test.ts`

Expected: fail because receipt movement logic is absent.

- [x] **Step 3: Implement receipt movement sync**

In both Edge Function and local maintenance script, load existing item baselines for incoming item ids, build movement rows for non-zero received deltas, upsert movements before upserting item snapshots, and update `last_balance_received_units` to the incoming received quantity.

- [x] **Step 4: Run sync tests to verify GREEN**

Run: `npm test -- --run src/__tests__/edge-pagination-guards.test.ts`

Expected: pass.

### Task 6: Purchasing Page and Routing

**Files:**
- Create: `app/src/pages/purchasing/InventoryBalance.tsx`
- Modify: `app/src/App.tsx`
- Modify: `app/src/components/layout/Sidebar.tsx`
- Test: `app/src/__tests__/InventoryBalance.static.test.ts`

**Interfaces:**
- Consumes: `useInventoryBalance(periodMonth)` and `useUpdateInventoryBalanceSettings()`.
- Produces: a Purchasing nav item and route at `/purchasing/inventory-balance`.

- [x] **Step 1: Write failing static tests**

Create `app/src/__tests__/InventoryBalance.static.test.ts` to assert the page contains `useInventoryBalance`, `useUpdateInventoryBalanceSettings`, admin role guard text, table headers from the spreadsheet, App route `/purchasing/inventory-balance`, and Sidebar label `Inventory Balance`.

- [x] **Step 2: Run static tests to verify RED**

Run: `npm test -- --run src/__tests__/InventoryBalance.static.test.ts`

Expected: fail because page, route, and nav are not wired.

- [x] **Step 3: Implement page, route, and nav**

Build a compact Purchasing page with month controls, KPI strip, admin-only settings form, warning states, and rollforward table. Use lucide icons for buttons and keep helper components at module scope.

- [x] **Step 4: Run static tests to verify GREEN**

Run: `npm test -- --run src/__tests__/InventoryBalance.static.test.ts`

Expected: pass.

### Task 7: Verification and Commit

**Files:**
- Review all changed implementation files.

**Interfaces:**
- Consumes: completed Tasks 1-6.
- Produces: a verified implementation commit on `codex/inventory-balance`.

- [x] **Step 1: Run focused tests**

Run: `npm test -- --run src/__tests__/InventoryBalance.helpers.test.ts src/__tests__/useInventoryBalance.test.ts src/__tests__/inventory-balance-migration.test.ts src/__tests__/InventoryBalance.static.test.ts src/__tests__/edge-pagination-guards.test.ts`

Expected: pass.

- [x] **Step 2: Run full tests**

Run with dummy Supabase envs:

```powershell
$env:VITE_SUPABASE_URL='https://example.supabase.co'
$env:VITE_SUPABASE_ANON_KEY='test-anon-key'
npm test -- --run
```

Expected: pass.

- [x] **Step 3: Run build**

Run with dummy Supabase envs:

```powershell
$env:VITE_SUPABASE_URL='https://example.supabase.co'
$env:VITE_SUPABASE_ANON_KEY='test-anon-key'
npm run build
```

Expected: pass.

- [x] **Step 4: Stage and commit**

Run:

```powershell
git status --short
git add app/src/__tests__/InventoryBalance.helpers.test.ts app/src/__tests__/InventoryBalance.static.test.ts app/src/__tests__/inventory-balance-migration.test.ts app/src/__tests__/useInventoryBalance.test.ts app/src/__tests__/edge-pagination-guards.test.ts app/src/App.tsx app/src/components/layout/Sidebar.tsx app/src/hooks/useInventoryBalance.ts app/src/pages/purchasing/InventoryBalance.helpers.ts app/src/pages/purchasing/InventoryBalance.tsx app/src/types/index.ts app/scripts/sync-active-purchase-orders.mjs supabase/functions/sync-purchase-orders/index.ts supabase/functions/sync-sales/index.ts supabase/migrations/20260903133038_inventory_balance.sql docs/superpowers/plans/2026-09-03-inventory-balance.md
git commit -m "feat: add purchasing inventory balance"
```

Expected: commit succeeds on `codex/inventory-balance`.

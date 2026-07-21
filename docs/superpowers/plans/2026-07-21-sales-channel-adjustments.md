# Sales Channel Adjustments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin edit support for existing mappings, remove the screenshot-marked Sales by Channel sections, and make all remaining Channel pace columns sortable.

**Architecture:** Keep the feature inside the existing Sales by Channel route and admin mapping page. Use a pure row-sort helper for deterministic tests, local React state for selected sort and inline mapping edit mode, and the existing Supabase upsert mutation for both add and edit saves.

**Tech Stack:** React 18, TypeScript, Vite, TanStack Query, Supabase, Vitest, Tailwind, lucide-react.

---

### Task 1: Sales By Channel Sort Contract

**Files:**
- Modify: `app/src/pages/csuite/SalesByChannel.helpers.ts`
- Test: `app/src/__tests__/SalesByChannel.helpers.test.ts`

- [x] **Step 1: Write the failing test**

Add a test that imports `sortSalesByChannelRows` and asserts `mtd_revenue`, `goal_amount`, `projected_month_end`, `daily_lift`, `status`, and `channel` sorting while keeping `requires_mapping` rows last.

- [x] **Step 2: Run test to verify it fails**

Run: `cd app && npm test -- --run src/__tests__/SalesByChannel.helpers.test.ts`

Expected: fails because `sortSalesByChannelRows` is not exported.

- [x] **Step 3: Implement the helper**

Add `SalesByChannelSortKey`, `SalesByChannelSortDirection`, and `sortSalesByChannelRows(rows, sort)` to `SalesByChannel.helpers.ts`. Use copied rows, stable tie-breaking by channel, null-safe numeric comparisons, status ranking, and mapped-before-unmapped behavior.

- [x] **Step 4: Run helper test**

Run: `cd app && npm test -- --run src/__tests__/SalesByChannel.helpers.test.ts`

Expected: pass.

### Task 2: Executive Sales UI Removals And Sortable Headers

**Files:**
- Modify: `app/src/pages/csuite/SalesByChannel.tsx`
- Test: `app/src/__tests__/SalesByChannel.static.test.ts`

- [x] **Step 1: Write failing static assertions**

Update static tests to require sortable headers and to reject `LY MTD`, `YoY`, `signedCurrency(totalMtd - totalLyMtd)`, and the top-level `MetricCell label="Goal"`.

- [x] **Step 2: Run static test to verify it fails**

Run: `cd app && npm test -- --run src/__tests__/SalesByChannel.static.test.ts`

Expected: fails because the old columns and top Goal card still exist.

- [x] **Step 3: Implement the UI change**

Remove top-level LY/Goal summary UI, remove LY MTD and YoY table columns/cells, add sort state and `SortableHeader` buttons for Channel, MTD, Goal, Projected, Daily lift, and Status.

- [x] **Step 4: Run static test**

Run: `cd app && npm test -- --run src/__tests__/SalesByChannel.static.test.ts`

Expected: pass.

### Task 3: Admin Mapping Edit Mode

**Files:**
- Modify: `app/src/pages/admin/SalesChannelMappingsPage.tsx`
- Test: `app/src/__tests__/SalesByChannel.static.test.ts`

- [x] **Step 1: Write failing static assertions**

Assert the admin page includes edit/cancel controls, an active status checkbox, an `editingMappingId` state, and saves existing mappings through `handleExistingSubmit`.

- [x] **Step 2: Run static test to verify it fails**

Run: `cd app && npm test -- --run src/__tests__/SalesByChannel.static.test.ts`

Expected: fails because existing mappings are display-only.

- [x] **Step 3: Implement edit mode**

Add edit state, draft form state, an Edit button per row, inline inputs for existing mapping rows, a checkbox for active status, Save and Cancel icon buttons, and mutation reuse through `useUpsertSalesChannelMapping`.

- [x] **Step 4: Run static test**

Run: `cd app && npm test -- --run src/__tests__/SalesByChannel.static.test.ts`

Expected: pass.

### Task 4: Verification And Board Closeout

**Files:**
- Modify: `sprints/Sprint_2026-07-21_sales_channel_adjustments.json`
- Modify: Asana tasks `1216763500366104`, `1216763500316588`, `1216763499505833`, `1216763551946388`

- [x] **Step 1: Run focused tests**

Run: `cd app && npm test -- --run src/__tests__/SalesByChannel.helpers.test.ts src/__tests__/SalesByChannel.static.test.ts`

Expected: all focused tests pass.

- [x] **Step 2: Run full tests**

Run: `cd app && npm test -- --run`

Expected: all tests pass.

- [x] **Step 3: Run build**

Run: `cd app && npm run build`

Expected: TypeScript and Vite production build pass.

- [x] **Step 4: Update Asana**

Add a completion comment to each adjustment task with file/test evidence, then mark the tasks complete and move them to `Ready`.

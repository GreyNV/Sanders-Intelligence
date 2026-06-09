# Sprint Plan: Purchase Order Interface — Seller Cloud Integration
**Sanders Intelligence · June 2026**

---

## 1. Sprint Goal

Build a live Purchase Order interface inside Sanders Intelligence that pulls PO data from Seller Cloud via the REST API and presents it to purchasing and admin users — with PO-level and line-item detail — fully integrated into the existing Supabase + React stack.

- Purchasing and admin users can browse all open/received/ordered POs from Seller Cloud.
- Each PO is drillable to its individual line items (SKU, qty, unit price, delivery date).
- Line-item SKUs link directly into the Inventory Browser for immediate cross-reference.
- A "Sync" button triggers a fresh pull from the SC API; data is cached in Supabase.
- csuite role does not have access to the PO interface (consistent with existing role guards).

---

## 2. Architecture

### 2.1 Approach: Sync-to-Supabase (not live proxy)

SC PO data is synced into two new Supabase tables (`purchase_orders`, `po_items`) via a Supabase Edge Function. The React app reads from Supabase — not directly from the SC API — keeping the UI fast and offline-tolerant.

This mirrors the existing inventory pattern (CSV upload → `inventory_records` table) and avoids exposing SC credentials to the browser.

### 2.2 Data Flow

```
User clicks "Sync" (or cron fires)
      │
      ▼
Edge Function: sync-purchase-orders
  1. POST /rest/api/token  →  Bearer token (60 min TTL)
  2. GET  /rest/api/purchaseorders?pageNumber=N&pageSize=100
         Repeat until TotalResults exhausted
  3. For each PO → GET /rest/api/PurchaseOrders/{id}/Items
  4. UPSERT into purchase_orders + po_items (on conflict: SC PO ID)
      │
      ▼
Supabase tables: purchase_orders, po_items
      │
      ▼
React: usePurchaseOrders() / usePurchaseOrderItems(poId)
      │
      ▼
/purchasing/purchase-orders  (new route)
```

### 2.3 SC REST API — Key Endpoints

**Base URL (from .env):** `https://snc.api.sellercloud.com/rest`

**Auth**

| Field | Value |
|---|---|
| Method | POST |
| Endpoint | `/api/token` |
| Body | `{ "Username": "...", "Password": "..." }` |
| Returns | `access_token` (Bearer JWT, 60 min TTL) |

**Get All Purchase Orders — GET `/api/purchaseorders`**

| Parameter | Type | Required | Notes |
|---|---|---|---|
| pageNumber | integer | No | Default: 1 |
| pageSize | integer | No | Use 100 for sync batches |
| pOStatuses | List | No | Saved, Ordered, Received, Pending, Cancelled, Completed |
| createDateFrom / To | DateTime | No | ISO date; use for incremental sync |
| keyword | string | No | Global search across PO fields |

**Get PO Items — GET `/api/PurchaseOrders/{id}/Items`**

Path param `id` (integer) is the SC PO ID. Returns `PoCaseQtyEnabled` flag + `Items` array with fields: `ID`, `ProductID` (SKU), `ProductName`, `QtyUnitsOrdered`, `UnitPrice`, `QtyCasesOrdered`, `QtyUnitsPerCase`, `CasePrice`, `DiscountType`, `DiscountValue`, `ExpectedDeliveryDate`.

---

## 3. Database Schema

**Migration file:** `supabase/migrations/003_purchase_orders.sql`

### Table: `public.purchase_orders`

| Column | Type | Nullable | Notes |
|---|---|---|---|
| id | integer | No | SC PO ID — primary key |
| purchase_title | text | Yes | PurchaseTitle from SC |
| vendor_id | integer | Yes | SC VendorID |
| po_status | text | No | Saved \| Ordered \| Received \| Pending \| Cancelled \| Completed |
| payment_status | text | Yes | SC PaymentStatus enum value |
| shipping_status | text | Yes | None \| PartiallyShipped \| FullyShipped |
| receiving_status | text | Yes | None \| PartiallyReceived \| FullyReceived |
| date_ordered | timestamptz | Yes | DateOrdered from SC |
| expected_delivery_date | timestamptz | Yes | ExpectedDeliveryDate |
| created_on | timestamptz | Yes | CreatedOn from SC |
| grand_total | numeric | Yes | GrandTotal |
| order_total | numeric | Yes | OrderTotal |
| tax_total | numeric | Yes | TaxTotal |
| shipping_total | numeric | Yes | ShippingTotal |
| unit_counts | integer | Yes | UnitCounts — total units on order |
| warehouse_id | integer | Yes | WarehouseID |
| company_id | integer | Yes | CompanyID |
| memo | text | Yes | Free-text memo |
| tracking_numbers | jsonb | Yes | Array of `{ ShippingCarrier, TrackingNumber, ShippedOn }` |
| approved | boolean | Yes | PurchaseOrdersApproved |
| synced_at | timestamptz | No | Last sync timestamp — set by Edge Function |

### Table: `public.po_items`

| Column | Type | Nullable | Notes |
|---|---|---|---|
| id | integer | No | SC item ID — primary key |
| po_id | integer | No | FK → purchase_orders.id |
| source_sku | text | No | Raw SC `ProductID` — the source-system SKU |
| planning_sku | text | Yes | Resolved via `sku_bridge` at sync time; used for all internal links |
| product_name | text | Yes | ProductName from SC |
| qty_units_ordered | integer | Yes | QtyUnitsOrdered |
| qty_units_per_case | integer | Yes | QtyUnitsPerCase |
| unit_price | numeric | Yes | UnitPrice |
| case_price | numeric | Yes | CasePrice |
| discount_type | text | Yes | FixedAmount \| Percentage |
| discount_value | numeric | Yes | DiscountValue |
| expected_delivery_date | timestamptz | Yes | Per-item delivery date |

> **SKU resolution:** `source_sku` is the raw `ProductID` returned by SC. The Edge Function resolves it to `planning_sku` by querying `sku_bridge` where `source_system` matches the SC match methods (`seller_cloud_shadow_of_sku`, `seller_cloud_sku_box_qty_and_item_label`, etc.) and `is_active = true`. `planning_sku` may be null if no bridge entry exists yet — those items will surface in a "Unmatched SKUs" count.

### RLS Policies

- `purchase_orders`: SELECT for authenticated users with role `admin` or `purchasing`
- `po_items`: SELECT for authenticated users with role `admin` or `purchasing`
- INSERT/UPDATE for `service_role` only (Edge Function runs as service role)
- No FK constraint from `po_items.planning_sku` → `sku_bridge` (bridge is a lookup table, not a strict reference; unmatched SKUs must be allowed)

---

## 4. Files Created / Modified

| Action | Path | What |
|---|---|---|
| CREATE | `supabase/migrations/003_purchase_orders.sql` | New tables + RLS |
| CREATE | `supabase/functions/sync-purchase-orders/index.ts` | SC auth + paginated PO sync Edge Function |
| MODIFY | `app/src/types/index.ts` | Add `PurchaseOrder`, `POItem`, `POStatus` types; `POItem.source_sku` + `planning_sku` |
| CREATE | `app/src/hooks/usePurchaseOrders.ts` | `usePurchaseOrders()`, `useSyncPOs()` mutation |
| CREATE | `app/src/pages/purchasing/PurchaseOrders.tsx` | PO list page with filter bar + sync button |
| CREATE | `app/src/pages/purchasing/PODetailPanel.tsx` | Slide-over: PO header + line items table |
| CREATE | `app/src/pages/purchasing/PurchaseOrders.helpers.ts` | `fmtPOStatus()`, `statusVariant()`, column defs |
| MODIFY | `app/src/components/layout/Sidebar.tsx` | Add "Purchase Orders" nav link |
| MODIFY | `app/src/App.tsx` | Add `/purchasing/purchase-orders` route + RoleGuard |
| MODIFY | `app/src/components/ui/Badge.tsx` | Add PO status badge variants |
| MODIFY | `app/.env.example` | Document `SELLERCLOUD_DELTA_BASE` + credential vars |
| MODIFY | `app/src/CLAUDE.md` | Document new route, hooks, tables, and query key |

---

## 5. Task Breakdown

| ID | Task | Layer | Estimate | Key Notes |
|---|---|---|---|---|
| T-01 | Supabase DB migration: `purchase_orders` + `po_items` tables + RLS | Backend | 0.5 day | DB foundation for all other tasks |
| T-02 | Supabase Edge Function: SC token auth + PO list sync | Backend | 1.5 days | Paginates `GET /rest/api/purchaseorders`, upserts to Supabase |
| T-03 | Edge Function: PO items fetch + upsert | Backend | 1 day | Per-PO: `GET /rest/api/PurchaseOrders/{id}/Items` |
| T-04 | TypeScript types: `PurchaseOrder`, `POItem`, `POStatus` | Frontend | 0.5 day | Extend `src/types/index.ts` |
| T-05 | React hook: `usePurchaseOrders()` + `useSyncPOs()` mutation | Frontend | 0.5 day | TanStack Query; cache key `['purchase_orders']` |
| T-06 | React hook: `usePurchaseOrderItems(poId)` | Frontend | 0.5 day | Lazily fetches items for selected PO |
| T-07 | PO List page: `/purchasing/purchase-orders` | Frontend | 1.5 days | Table with status/date/vendor/total cols, filter bar, "Sync" button |
| T-08 | PO Detail panel: header + line items table | Frontend | 1 day | Slide-over drawer; SKU links to InventoryBrowser |
| T-09 | Sidebar nav entry + `App.tsx` route | Frontend | 0.25 day | Add "Purchase Orders" under Purchasing section |
| T-10 | SC credentials config: Supabase secrets + `.env.example` update | DevOps | 0.25 day | `SELLERCLOUD_DELTA_BASE` + credentials as Edge Function secrets |
| T-11 | Status badge variants for PO statuses | Frontend | 0.25 day | Extend `Badge.tsx`: ordered / received / pending / cancelled |
| T-12 | QA + cross-role access test | QA | 0.5 day | Verify admin/purchasing see POs; csuite does not |

**Total estimate: ~8.25 days** (assumes single developer; T-01 to T-03 should complete before frontend work begins)

---

## 6. Edge Function Detail — sync-purchase-orders

### 6.1 Logic

1. On invoke: check if cached token is still valid (exp > now + 5 min). If not, re-auth via `POST /api/token` using `SELLERCLOUD_DELTA_BASE` credentials from Edge Function secrets.
2. Fetch POs in pages of 100. Default filter: `pOStatuses = Saved, Ordered, Received, Pending`. Accept optional query param to include all statuses.
3. For each PO in the response, upsert to `purchase_orders`. Collect all SC PO IDs.
4. For each PO ID, call `GET /api/PurchaseOrders/{id}/Items`. For each item, look up the SC `ProductID` (= `source_sku`) in `sku_bridge` (active rows) to resolve `planning_sku`. Upsert both to `po_items`.
5. Respect SC rate limiting (60 req/min): add 1 s delay per 50 item fetches.
6. Return JSON summary: `{ synced: N, items: M, durationMs: T }`.

### 6.2 Token Handling

Tokens are valid for 60 minutes. The `.env` shows both `SELLERCLOUD_TOKEN` and `SELLERCLOUD_DELTA_TOKEN` from the purchasing-automation scripts. The Edge Function uses the **delta** endpoint (`snc.api.sellercloud.com/rest`) and manages its own token lifecycle — re-authenticating when < 5 minutes remain.

Store the Edge Function secrets in Supabase Dashboard → Project Settings → Edge Functions → Secrets:
- `SELLERCLOUD_DELTA_BASE` = `https://snc.api.sellercloud.com/rest`
- `SELLERCLOUD_USERNAME`
- `SELLERCLOUD_PASSWORD`

### 6.3 Incremental Sync

After first full sync, subsequent calls can pass `createDateFrom = last_synced_at` to limit the pull to recently modified POs. Store `last_synced_at` in a Supabase config row (e.g., extend `automation_config`) or pass as a function parameter.

---

## 7. Frontend Detail

### 7.1 PO List Page (`/purchasing/purchase-orders`)

- **Columns:** PO ID, Title, Vendor ID, Status (badge), Date Ordered, Expected Delivery, Grand Total, Receiving Status, Units
- **Filter bar:** Status multiselect, Date Ordered range picker, keyword search
- **"Sync from Seller Cloud"** button → calls `useSyncPOs()` mutation → invalidates `['purchase_orders']` cache on success, shows loading spinner during sync
- Clicking a row opens `PODetailPanel` (slide-over drawer)
- Loading and empty states consistent with existing pages (`PageLoader`, empty message)

### 7.2 PO Detail Panel

- **Header:** PO ID, title, vendor, status badge, ordered date, expected delivery, grand total, receiving status, memo
- **Tracking:** carrier + tracking number (if present)
- **Line items table:** Source SKU, Product Name, Qty Ordered, Unit Price, Line Total, Expected Delivery per item
- Each row shows `source_sku`; if `planning_sku` is resolved, it links to `/purchasing/inventory?search={planning_sku}`. Unresolved items show a warning icon (no link) and are counted in the panel header as "N unmatched SKUs".

### 7.3 Status Badges

| SC Status | Badge Variant | Color Intent |
|---|---|---|
| Ordered | `info` | Blue |
| Received | `success` | Green |
| Pending | `warning` | Amber |
| Saved | `default` | Grey |
| Cancelled | `danger` | Red |
| Completed | `ok` | Green (muted) |

---

## 8. Query Keys & Hooks Reference

| Hook | Cache Key | Notes |
|---|---|---|
| `usePurchaseOrders(filters?)` | `['purchase_orders', filters]` | Stale after 5 min |
| `usePurchaseOrderItems(poId)` | `['po_items', poId]` | Enabled only when `poId` is set |
| `useSyncPOs()` | mutation — no cache key | On success: invalidate `purchase_orders` |

---

## 9. Acceptance Criteria

### Must-have for sprint completion

- [ ] Migration runs clean in Supabase SQL Editor with no errors.
- [ ] Edge Function syncs at least 1 page of POs and all their items into Supabase.
- [ ] Purchasing and admin users can see the PO list page; csuite cannot navigate to it.
- [ ] PO status filters work correctly and update the table without a page reload.
- [ ] Clicking a PO opens the detail panel showing correct line items.
- [ ] SKU links in the detail panel navigate to InventoryBrowser pre-filtered.
- [ ] "Sync" button shows loading state and surfaces an error toast on failure.
- [ ] All existing tests pass; no regressions in ActionCenter, InventoryBrowser, or Tasks.

### Nice-to-have (if time allows)

- [ ] Incremental sync (`createDateFrom` filter) to speed up subsequent syncs.
- [ ] PO count KPI card on Executive Summary (total POs on order + total value).
- [ ] Scheduled nightly sync via Supabase cron.

---

## 10. Open Questions

1. **SKU bridge lookup strategy:** The Edge Function can resolve `source_sku → planning_sku` at sync time (recommended — keeps it consistent and fast for the UI), or we can do it lazily as a JOIN in the query. At sync time is preferred since `sku_bridge` rarely changes.
2. **Unmatched SKUs:** SC `ProductID` values with no `sku_bridge` entry will have `planning_sku = null`. Do we want a separate admin workflow to resolve these, or just surface them as warnings in the PO detail panel? Recommendation: warnings in panel + a future admin SKU-mapping screen.
3. **Vendor names:** SC returns `VendorID` but not `VendorName` in the PO list response. Requires a separate vendor lookup endpoint or a `vendor_names` reference table. Low priority — VendorID is enough for V1.
4. **Cancelled / completed POs:** Sync all statuses, let UI filter — avoids needing a full re-sync when someone wants history.
5. **Sync button permissions:** Admin-only, or available to all purchasing users?
6. **Rate limiting:** SC REST API allows ~60 req/min. With large PO counts, one item fetch per PO could hit this. Confirm PO volume before finalizing T-03 batch strategy.

---

*Sanders Intelligence · Confidential*

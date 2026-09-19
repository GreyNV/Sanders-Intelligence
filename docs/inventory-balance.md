# Inventory balance

The purchasing Inventory Balance page calculates opening inventory + received inventory value - sales COGS. Admins may move the opening month forward or backward and enter the inventory value at the start of that month. Historical data is retained independently of this setting. January of the current year is the initial draft month; no opening value is invented.

## Receipt history

Download the original SellerCloud Inventory Arrivals XLSX and drop it into the admin import panel, or use the file picker. No spreadsheet conversion is required. Native columns ReceivedOn, PO#, ProductID, QtyReceived, ReceiveSessionID, and WarehouseName provide dates and stable receipt identities. USD receipts use AdjustedPriceAfterMultiDiscount (then DiscountedPrice, then UnitPrice) plus ExtraCostPerUnit. Unsupported currencies are rejected. Negative quantities and zero costs are preserved, with preview counts. Today is excluded explicitly as an incomplete day; the selected completed-day range still requires confirmation. Do not infer export completeness from the first and last receipt dates alone. The generic CSV/XLSX template remains supported. Import a complete dated receiving export through the admin panel. CSV or XLSX columns: receipt_id, received_date, po_id, source_sku, quantity, unit_cost. Dates must be YYYY-MM-DD; costs must be USD. Each partial receipt or reversal needs a unique row ID; reversals use negative quantity. Use receiving dates, not PO creation dates or current cumulative quantities. The page provides a template and preview.

Confirm the export covers every receipt and reversal in its declared completed-day window. Import replaces that window atomically, including zero-receipt days. Re-importing does not duplicate data. Overlapping dates use imported history instead of observed PO deltas. Other dates remain unchanged.

The REST PO cache provides current quantities, not historical receiving dates. Its database trigger captures new quantity changes atomically with PO updates, including corrections and newly completed POs. These dates are observation dates and remain provisional until a dated receiving export covers them.

## COGS backfill

Run from app with Node 22+:

```powershell
node scripts/backfill-inventory-cogs.mjs --from=2026-01-01 --to=2026-09-12 --apply=true
```

Use --envDir for the app environment directory and --scEnv for the SellerCloud credential file. Credentials are read locally and never written to the cache. The default SellerCloud environment path is D:/Sanders/purchasing-automation/.env. Required keys: SELLERCLOUD_DELTA_BASE, SELLERCLOUD_USERNAME, SELLERCLOUD_PASSWORD, VITE_SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY).

Without --apply=true the script only caches results. Successful days are cached in app/.inventory-cogs-cache and resumed on rerun. Use --refresh=true to refetch corrected days. Run completed days only. The script queries all shipped orders in the configured SellerCloud account, validates complete pagination, and sums P&L ItemCostUsd (goods cost, excluding shipping and marketplace expenses) once per order. Zero and negative costs are preserved; missing costs are flagged. It writes inventory_cogs_daily, leaving existing sales/revenue rows unchanged. A full historical run can take several hours.

Normal sales sync now enriches missing COGS. Complete-day coverage comes from the backfill script; run it for newly completed days or corrected historical periods. No new recurring schedule is installed by this feature.

## Coverage and deployment

Balances remain provisional while any included day lacks complete receipt or COGS coverage, or costs are missing. Later monthly balances carry that uncertainty forward. Moving the opening month does not backfill missing source data automatically; import/backfill earlier dates if needed.

Apply migrations in order: 20260903133038_inventory_balance.sql, 20260911231510_inventory_balance_history.sql, 20260913194908_inventory_receipt_import_validation.sql. They have been applied to the connected project through the migration API; reconcile remote migration versions before using a bulk CLI push. Deploy sync-purchase-orders and sync-sales together with the frontend. Existing authentication settings are preserved.

Validation: 297 unit/static tests, TypeScript and production build, mocked browser flows for admin/purchasing access and opening-month changes, and rollback-only live database checks in supabase/tests_inventory_balance.sql. Database checks cover atomic receipt deltas, repeat imports, historical precedence, invalid imports, and purchasing-role denial.

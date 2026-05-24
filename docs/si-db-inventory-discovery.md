# SI DB Inventory Discovery Notes

Date: 2026-05-19

## Goal

This workstream is about tying the Sanders Intelligence app to the SI App MySQL database and deriving the company's real current inventory without relying on Netstock exports. Netstock should be treated as a comparison target only after SI-native sources are isolated and modeled.

The local sample file at `docs/sample-data/fullreport.csv` is based on the April 30 Netstock export. It is useful for later validation, but should not drive source selection.

## Safety Rules Followed

- MySQL exploration used read-only queries only.
- No deletes, updates, inserts, drops, migrations, or DDL were run.
- `net_stock_inventory` was deliberately excluded from source modeling.
- Environment values were pulled/used locally but not documented.

## Current Access / Tooling

- Vercel project was linked locally to `greynvs-projects/sanders-intelligence`.
- `SI_MYSQL_*` variables were pulled into ignored local env files.
- `mysql2` was installed so local Node scripts can connect to MySQL.
- `app/.gitignore` was updated to ignore `.env.*.local`.

## Tables To Exclude For This Workstream

Exclude these categories unless there is a specific reason to revisit them:

- `net_stock_inventory`
- tables ending in or containing `_old`, `_bkp`, `backup`, `_holder`
- dated snapshot backups like `inventory_plan_sku__2024_08_20`
- `seller_cloud_sale`, because it stops in 2025; use `seller_cloud_sale_new`
- `ebay_daily_sale`, because it stops in 2025
- `vendor_purchase_order_item_new_2`, because it stops in 2024
- Walmart tables with future-dated rows should always use `date <= CURRENT_DATE()` or another explicit cutoff

## Inventory Source Candidates

### SellerCloud Warehouse Inventory

Primary table: `seller_cloud_warehouse_inventory`

Latest snapshot found:

```text
DB timestamp: 2026-05-17T21:00:00.000Z
Local date: 2026-05-18
Rows: 62,603
Distinct SKUs: 31,302
```

Important fields:

```text
date
sku
company_name
warehouse_id
warehouse_name
physical_qty
warehouse_physical_qty
reserved_qty
warehouse_physical_qty_value
average_cost
last_cost
site_cost
qty_sold_30
qty_sold_90
qty_sold_365
status
```

Latest value findings:

```text
warehouse_physical_qty_value:             $23,213,035.27
warehouse_physical_qty * calculated cost: $23,263,667.52
physical_qty * calculated cost:           $24,311,866.40
```

SellerCloud-only value is below the currently reported Netstock value of roughly `$26.3M`. The closest SellerCloud-only basis is `physical_qty * calculated cost`, still about `$1.99M` low.

Likely reason for the gap: at least part of the missing value appears to be Amazon Vendor inventory. Vendor inventory mapped through ASIN produced slices in the `$1.97M` to `$2.46M` range, which is close to the remaining gap. Adding all Vendor inventory overshoots, so the correct channel/account/SKU mapping still needs to be defined.

Initial modeling recommendation:

```text
owned_inventory_current =
  latest seller_cloud_warehouse_inventory
  using physical_qty as the first candidate quantity basis
  using cost basis COALESCE(average_cost, last_cost, site_cost)
```

Keep `warehouse_physical_qty_value` as a native reference value, but test whether `physical_qty` is closer to business inventory.

### Amazon Vendor Inventory

Primary table: `vendor_daily_inventory`

Latest snapshot found:

```text
DB timestamp: 2026-05-14T21:00:00.000Z
Local date: 2026-05-15
Rows: 5,658
Distinct SKUs: 5,657
```

Important fields:

```text
account
asin
sku
sellable_on_hand_units
sellable_on_hand_inventory
unsellable_on_hand_units
unsellable_on_hand_inventory
open_purchase_order_quantity
unfilled_customer_ordered_units
```

Latest totals:

```text
sellable_on_hand_units:        323,220
sellable_on_hand_inventory:    $7,763,295.74
unsellable_on_hand_units:      5,288
open_purchase_order_quantity:  91,209
unfilled_customer_ordered_units: 2,738
```

Important mapping note:

- Vendor SKUs do not directly match the Netstock/product-code universe.
- Direct vendor SKU mapping to Netstock-like product codes was effectively zero in the April 30 file.
- ASIN-based mapping only explains part of Vendor inventory.
- Vendor inventory should be modeled as a separate channel first, then mapped into planning SKUs once the correct mapping rules are known.

### Amazon / FBA Inventory Reports

Candidate tables:

```text
daily_inventory
daily_inventory_merchant
daily_fba_inventory_detail
fba_inventory_price_details
```

These are useful for channel-level FBA/Merchant/listing availability, reserved, inbound, unfulfillable, and listing status. They may overlap with SellerCloud facts if added blindly.

Observed `fba_inventory_price_details` latest snapshot:

```text
available:     41,586
reserved:      1,739
inbound:       82
unfulfillable: 460
```

Recommendation:

- Use these to explain Amazon channel inventory and listing state.
- Do not add them into company inventory totals until overlap with SellerCloud and Vendor sources is resolved.

## Inbound Source Candidates

### Internal Purchase Orders

Best source: `po_item_balances`

This appears to be a purpose-built view over purchase order items and allocations.

Observed totals:

```text
Rows:               5,277
Distinct SKUs:      2,896
quantity_ordered:   1,358,130
quantity_allocated: 5,096
remaining:          1,353,034
```

Recommendation:

```text
internal_inbound_current =
  po_item_balances.remaining
```

Join back to purchase order metadata if ETA/status/supplier fields are needed.

### Amazon Vendor Purchase Orders

Candidate tables:

```text
vendor_purchase_order_item
vendor_purchase_order_item_new
```

`vendor_purchase_order_item_new` is very large and slow for casual probing. `vendor_purchase_order_item` looks more practical for current PO status exploration.

Observed `vendor_purchase_order_item` status summary:

```text
Acknowledged outstanding: 119,265
Acknowledged outstanding value: ~$1.72M
Closed outstanding: 3,093
```

Recommendation:

```text
vendor_inbound_current =
  vendor_purchase_order_item
  where status = 'Acknowledged'
  using quantity_outstanding and quantity_outstanding * cost
```

### FBA Inbound Shipments

Candidate table: `daily_fba_inbound_shipment`

For 2026-05-18:

```text
RECEIVING remaining:  540
IN_TRANSIT remaining: 82
```

Recommendation:

```text
fba_inbound_current =
  daily_fba_inbound_shipment
  where shipment_status indicates in-transit or receiving
  remaining = quantity_shipped - quantity_received
```

### Wayfair Inbound

Candidate table: `wayfair_inbound_order`

Latest observed:

```text
Open CastleGate planned: 10,020
received at warehouse:  410
remaining:              9,610
```

Recommendation:

```text
wayfair_inbound_current =
  wayfair_inbound_order
  where order_status = 'Open'
  remaining = planned_qty - received_at_warehouse_qty
```

## Sales Source Candidates

### Broad SellerCloud Sales

Primary table: `seller_cloud_sale_new`

Use this instead of `seller_cloud_sale`; the older table stops in 2025.

Latest 30-day company-level observations:

```text
Sanders Collection:                       164,841 units
Sanders Collection Wholesale - Sleeptone: 38,496 units
Macys:                                    10,583 units
TargetPlus:                               7,292 units
Wayfair CastleGate:                       4,227 units
Cloud 9 Fundraising:                      4,156 units
```

Important fields:

```text
date
sku
shadow_of
company_name
qty
line_total
cost_price
average_cost
last_cost
back_order_qty
qty_returned
```

Recommendation:

```text
sales_30d_broad =
  seller_cloud_sale_new
  using COALESCE(NULLIF(shadow_of, ''), sku) as planning SKU candidate
```

### Marketplace / Channel Sales

Candidate table: `seller_cloud_marketplace_order_new`

Latest 30-day observations:

```text
WFS:                 32,804 units
VendorCentral:       24,762 units
Walmart_Marketplace: 7,957 units
Dropship_Central:    5,203 units
FBA:                 4,718 units
```

This table is useful for channel attribution, but may overlap with `seller_cloud_sale_new`.

### Amazon Seller Sales

Candidate table: `daily_sale`

Latest 30-day observations:

```text
THE_COMFORT_ZONE_USA:    15,471 units
THE_COMFORT_ZONE_CANADA: 558 units
THE_COMFORT_ZONE_MEXICO: 319 units
STORAGEBUD_LLC_USA:      110 units
```

This is useful for Amazon account-level metrics, but likely overlaps with marketplace/SellerCloud sales.

### Amazon Vendor Sales

Candidate table: `vendor_daily_sale`

Latest 30-day observations:

```text
CLARA_CLARK_USA: 97,134 units
CLARA_CLARK_UK:  417 units
```

Recommendation:

```text
vendor_sales_30d =
  vendor_daily_sale
```

Treat as a separate channel from SellerCloud until overlap is proven.

### Walmart Sales

Candidate table: `walmart_daily_sale`

Important caveat: Walmart tables include future dates, so always filter with a current-date cutoff.

Latest 30-day observation using date <= 2026-05-18:

```text
WALMART_COZY_ARRAY: 42,024 units
```

Recommendation:

```text
walmart_sales_30d =
  walmart_daily_sale
  where date <= CURRENT_DATE()
```

## Backorder Source Candidates

### SellerCloud Current Backorders

Primary table: `seller_cloud_back_order`

Observed totals:

```text
Rows: 270
SKUs: 270
order_qty: 66,036
```

### SellerCloud Sales Backorder Field

Source: `seller_cloud_sale_new.back_order_qty`

Latest 30-day observed backorder quantities:

```text
Sanders Collection:                       1,877
Sanders Collection Wholesale - Sleeptone: 1,071
Cloud 9 Fundraising Online:               95
Cloud 9 Fundraising:                      89
```

This is useful historically, but `seller_cloud_back_order` is more likely the current backlog table.

### Vendor Unfilled Demand

Source: `vendor_daily_inventory.unfilled_customer_ordered_units`

Observed latest:

```text
Rows with unfilled demand: 915
Unfilled units:           2,738
```

## Proposed Domain Model

Start with separated source domains instead of one blended inventory number.

```text
owned_warehouse_inventory
  source: seller_cloud_warehouse_inventory
  grain: snapshot date + sku + company + warehouse

vendor_inventory
  source: vendor_daily_inventory
  grain: snapshot date + vendor sku + asin + account

amazon_fba_inventory
  source: fba_inventory_price_details / daily_fba_inventory_detail
  grain: snapshot date + account + sku + asin

internal_inbound
  source: po_item_balances
  grain: purchase_order_item + sku

vendor_inbound
  source: vendor_purchase_order_item
  grain: purchase order number + sku + asin

channel_inbound
  source: daily_fba_inbound_shipment, wayfair_inbound_order
  grain: shipment/order + sku/part number

sales_30d
  source: seller_cloud_sale_new plus separate channel tables
  grain: date + normalized sku + company/channel

backorders_current
  source: seller_cloud_back_order plus vendor_daily_inventory unfilled units
  grain: sku/channel
```

## Open Questions

1. Which company names should be included in the company inventory total?
   - `Sanders Collection`
   - `Sanders Collection Wholesale - Sleeptone`
   - `StorageBud`
   - `Cloud 9 Fundraising`
   - Others?

2. Should current inventory include Amazon Vendor inventory?
   - The `$26.3M` Netstock value suggests some Vendor inventory may be included.
   - Adding all Vendor inventory overshoots, so a filter or mapping is needed.

3. Which quantity basis should be canonical for SellerCloud?
   - `warehouse_physical_qty`
   - `physical_qty`
   - `physical_qty + reserved_qty`

4. Which SKU normalization should be used?
   - Direct `sku`
   - `shadow_of`
   - ASIN-based mapping
   - product master mapping

## Next Investigation: Selling Price And Profit By SKU

The next dashboard step needs current selling price and daily profit by SKU.

Candidate price sources to explore:

```text
product.price
product.sale_price
daily_inventory.price
daily_inventory.business_price
daily_inventory_merchant.price
fba_inventory_price_details.price
fba_inventory_price_details.business_price
fba_inventory_price_details.buy_box_price
walmart_daily_sale.selling_price
walmart_item.price
walmart_item_catalog.price
wayfair_item.retail_price
seller_cloud_warehouse_inventory.site_price
seller_cloud_warehouse_inventory.amazon_price
```

Candidate profit sources to explore:

```text
seller_cloud_order_product_profit_loss
seller_cloud_product_profit_and_loss
seller_cloud_order_profit_and_loss
seller_cloud_marketplace_order_new
sanders_sku_settlement_profit
walmart_item_cost
walmart_daily_sale
vendor_daily_sale
```

Initial hypothesis:

```text
current_selling_price_by_sku =
  channel-specific current listing/price tables,
  not one universal product.price field

daily_profit_by_sku =
  seller_cloud_order_product_profit_loss for SellerCloud orders
  plus channel-specific profit/cost tables where not already represented
```

First checks for next session:

1. Confirm date coverage and latest dates for profit tables.
2. Profile SKU/channel grain in each profit table.
3. Compare revenue, item cost, shipping cost, fees, and profit fields.
4. Determine whether profit is precomputed or must be derived.
5. Define a normalized SKU/channel daily fact model.

## Selling Price And Profit Discovery

Date: 2026-05-19

This section starts the next workstream: finding current selling price by SKU and daily profit by SKU from SI App MySQL sources.

### Price Source Findings

There does not appear to be one universal current selling-price field that covers every SKU/channel. Price should be modeled as channel-specific.

Weak source:

```text
product.price
product.sale_price
```

Reason: `product` is useful as product master data, but price coverage is thin. For example, `THE_COMFORT_ZONE_USA` has 34,146 product rows but only 1,421 non-zero `price` rows, and `sale_price` was effectively empty in the observed profile.

Better current price sources:

#### SellerCloud Price Fields

Table: `seller_cloud_warehouse_inventory`

Latest snapshot:

```text
DB timestamp: 2026-05-17T21:00:00.000Z
Local date: 2026-05-18
```

Useful fields:

```text
site_price
amazon_price
store_price
company_name
sku
date
```

Coverage observed:

```text
Sanders Collection:
  rows: 58,657
  SKUs: 29,329
  site_price rows: 13,478
  amazon_price rows: 25,490

Sanders Collection Wholesale - Sleeptone:
  rows: 1,132
  SKUs: 566
  site_price rows: 976
  amazon_price rows: 976

FBA MX:
  rows: 2,336
  SKUs: 1,168
  site_price rows: 2,312
  amazon_price rows: 2,334
```

This is a good broad SellerCloud/SI-side current-price candidate, but because it is warehouse/company snapshot data, it may have duplicate SKU rows. A current-price model should aggregate by:

```text
date + company_name + sku
```

and choose a price priority such as:

```text
COALESCE(NULLIF(site_price, 0), NULLIF(amazon_price, 0))
```

The exact priority should be validated by channel.

#### Amazon / FBA Listing Prices

Tables:

```text
fba_inventory_price_details
daily_inventory
daily_inventory_merchant
```

`fba_inventory_price_details` latest coverage:

```text
account: THE_COMFORT_ZONE_USA
Active rows: 2,170+
price coverage: nearly all rows
buy_box_price coverage: most active rows
business_price coverage: nearly all active rows
```

Useful fields:

```text
price
business_price
buy_box_price
competitive_price
lowest_price
sale_price
state
account
sku
asin
sync_date_time
```

Recommendation:

```text
amazon_current_price_by_sku =
  latest fba_inventory_price_details
  using price as listing price
  buy_box_price as market/buy-box reference
```

`daily_inventory` also has strong current listing price coverage by account/status and can serve as a second Amazon listing price source, especially for out-of-stock listings.

#### Walmart Prices

Tables:

```text
walmart_item_catalog
walmart_daily_sale
walmart_item
```

Important caveat: Walmart tables contain future-dated rows. Use explicit cutoff:

```sql
sync_date <= CURRENT_DATE()
date <= CURRENT_DATE()
```

Observed `walmart_item_catalog` current date:

```text
current sync_date: 2026-05-11 local date
ACTIVE + PUBLISHED rows: 9,182
price rows: 9,182
buy_box rows: 8,250
```

Observed `walmart_daily_sale` current date:

```text
current date: 2026-05-17 local date
rows: 954
SKUs: 954
selling_price rows: 951
```

Recommendation:

```text
walmart_current_price_by_sku =
  latest walmart_item_catalog where sync_date <= CURRENT_DATE()
  and lifecycle_status = 'ACTIVE'
  and publish_status = 'PUBLISHED'
```

Use `walmart_daily_sale.selling_price` as recent observed selling price, not full catalog price.

#### Wayfair Prices

Table: `wayfair_item`

Useful fields:

```text
sku
display_sku
product_status
base_cost
retail_price
minimum_advertised_price
```

Observed coverage:

```text
Live rows: 7,678
Live SKUs: 454
retail_price rows: 7,179
base_cost rows: 7,678
```

Recommendation:

```text
wayfair_current_price_by_sku =
  wayfair_item
  where product_status like 'Live%'
  using retail_price
```

### Profit Source Findings

Best source found:

```text
seller_cloud_product_profit_and_loss
```

Equivalent-looking source:

```text
seller_cloud_marketplace_order_new
```

The two returned the same last-30-day aggregates for company/channel in the sampled queries. `seller_cloud_product_profit_and_loss` is more semantically direct for profit reporting, while `seller_cloud_marketplace_order_new` looks like the same or closely related line-item P&L data.

Avoid as primary:

```text
seller_cloud_order_product_profit_loss
seller_cloud_order_profit_and_loss
```

Reason: these are large and current only through `2026-05-14` local date in observed profiling. They also use company/channel IDs, and `seller_cloud_order_product_profit_loss` produced odd gross-sales math in a quick aggregate. Keep them as secondary audit sources.

Other profit/cost sources:

```text
sanders_sku_settlement_profit
walmart_item_cost
walmart_daily_sale
vendor_daily_sale
```

Notes:

- `sanders_sku_settlement_profit` stops around March 2026 in observed profiling, so it is not current enough for daily dashboard use.
- `walmart_item_cost` stops around January 2026 in observed profiling, so it is not current enough.
- `walmart_daily_sale` has current sales and cost fields, but also future rows; always filter by `date <= CURRENT_DATE()`.
- `vendor_daily_sale` is current and has revenue, units, vendor sale price, and cost price, but not full profit/fees. Vendor profit may need to be derived.

### SellerCloud Daily SKU Profit

Primary table: `seller_cloud_product_profit_and_loss`

Observed date coverage:

```text
min ship_date: 2025-09-28 local date
max ship_date: 2026-05-18 local date
```

Useful fields:

```text
company
channel
ship_date
order_date
order_id
order_item_id
sku
original_shadow_sku
qty_sold
qty_returned
unit_price
sub_total
items_cost
shipping_cost
commission
transaction_fee
posting_fee
drop_ship_fee
co_op_fee
tax_payable
total_fees
item_cost_total
accrual_profit
cash_profit
accrual_profit_margin
cash_profit_margin
profit_status
asin
```

Recommended SKU normalization:

```sql
COALESCE(NULLIF(original_shadow_sku, ''), sku)
```

Observed last-30-day quality:

```text
Actual rows:    53,323
Actual SKUs:    7,213
Actual qty:     126,998
Actual accrual profit: ~$1.241M

Estimated rows: 5,910
Estimated SKUs: 1,612
Estimated qty:  6,261
Estimated accrual profit: ~$52.9k
```

Recent daily coverage showed no null `accrual_profit` or `cash_profit` rows in the sampled last 14 ship dates.

Recommended daily profit model:

```sql
daily_profit_by_sku_channel =
  SELECT
    ship_date,
    company,
    channel,
    COALESCE(NULLIF(original_shadow_sku, ''), sku) AS normalized_sku,
    SUM(qty_sold) AS units_sold,
    SUM(qty_returned) AS units_returned,
    SUM(sub_total) AS revenue,
    SUM(item_cost_total) AS item_cost,
    SUM(shipping_cost) AS shipping_cost,
    SUM(total_fees) AS total_fees,
    SUM(accrual_profit) AS accrual_profit,
    SUM(cash_profit) AS cash_profit
  FROM seller_cloud_product_profit_and_loss
  WHERE ship_date <= CURRENT_DATE()
  GROUP BY ship_date, company, channel, normalized_sku
```

Keep `profit_status` in downstream data so dashboard users can filter or flag `Actual` vs `Estimated`.

### Open Questions For Price / Profit

1. Should the dashboard show one current price per SKU, or one price per SKU/channel?
   - The data strongly supports SKU/channel price.

2. Should profit use `ship_date` or `order_date`?
   - `ship_date` appears better aligned with fulfilled profit.
   - `order_date` may be better for sales velocity.

3. Should dashboard profit default to `accrual_profit` or `cash_profit`?
   - Both are available in the primary SellerCloud P&L table.
   - Last-30-day values were close but not identical.

4. Should `Estimated` profit rows be included by default?
   - They are a minority but not negligible.
   - Recommended: include but flag, or default to Actual with a toggle.

5. How should Vendor profit be handled?
   - `vendor_daily_sale` has revenue, units, sale price, and cost price, but not full fee/profit fields.
   - Vendor profit may need its own derived formula or a separate Vendor P&L table if found later.

## Supabase SKU To SI Profit Matching Audit

Audit date: 2026-05-19

Latest Supabase inventory upload used for the audit:

```text
upload_id:    f436857b-9f6b-4a2e-bda5-d9b1198a4b96
uploaded_at:  2026-05-19T13:15:16.8319+00:00
filename:     fullreport (12).csv
rows/SKUs:    12,805
```

SI profit source used:

```text
seller_cloud_product_profit_and_loss
max ship_date: 2026-05-18 local date
```

The first direct match attempt was intentionally conservative:

```text
Supabase key: inventory_records.product_code
SI profit key: COALESCE(NULLIF(original_shadow_sku, ''), sku)
```

Direct matching alone is poor:

```text
30-day direct matches: 499 Supabase SKUs / 12,805 = 3.90%
90-day direct matches: 1,052 Supabase SKUs / 12,805 = 8.22%
```

The mismatch is largely because the SI profit SKU often includes a channel/vendor prefix that is not present in the Netstock/Supabase product code. Common observed prefixes:

```text
WM-
V-
VC-
VP-
VPO-
VDS-
vend-
vend_
```

Recommended matching transform for profit-to-planning-SKU work:

```text
1. lower/trim both sides
2. compare direct SKU
3. strip known channel/vendor prefixes from SI profit SKU
4. compare prefix-stripped SKU
5. compare compact canonical form with punctuation removed
```

Using this transform materially improves profit matching:

```text
30-day SI profit SKUs:             8,732
30-day matched profit SKUs:        2,183 / 8,732 = 25.00%
30-day matched Supabase SKUs:      1,823 / 12,805 = 14.24%
30-day matched revenue:            $1.130M / $3.394M = 33.30%
30-day matched accrual profit:     $403.5k / $1.318M = 30.62%

90-day SI profit SKUs:             15,837
90-day matched profit SKUs:        3,798 / 15,837 = 23.98%
90-day matched Supabase SKUs:      2,899 / 12,805 = 22.64%
90-day matched revenue:            $4.005M / $12.382M = 32.35%
90-day matched accrual profit:     $1.384M / $4.623M = 29.95%
```

30-day matched profit contribution by tier:

```text
direct revenue/profit:             $95.7k / $29.1k
prefix-stripped revenue/profit:    $957.3k / $352.1k
compact-canonical revenue/profit:  $77.2k / $22.3k
```

Representative non-direct matches:

```text
vc-ex-glsscntnr-4pc-blk -> EX-GLSSCNTNR-4PC-BLK
v-nb-pcl-2pc-blk       -> NB-PCL-2PC-BLK
v-nb-pcl-2pc-gry       -> NB-PCL-2PC-GRY
v-cc-bthst-b-blk       -> CC-BTHST-B-BLK
wm-nb-pcl-2pc-blk      -> NB-PCL-2PC-BLK
v-nb-iceplw-b-1        -> NB-Iceplw-B-1
vc_hh_chenile-rug-sm-huntr -> HH_chenile-rug-sm-huntr
```

Important caution:

```text
Supabase compact canonical collisions found: 4 keys
```

That means compact matching should be treated as a fallback tier and should retain an audit flag. Direct and prefix-stripped exact matches are safer.

Top remaining unmatched Supabase inventory SKUs by on-hand value after the 30-day transformed match:

```text
S-FMPBF-HB                 $430.1k
NB-redingplw-m-gry          $195.3k
S-Adjstbl1-K                $164.1k
sht3lnnb18q_gry             $153.8k
NB-AB-Q                     $148.0k
NB-MFM-10-Q                 $143.8k
S-Adjstbl5-K                $132.4k
S-Adjstbl5-Q                $118.9k
sht3lcc18q_gry              $114.9k
S-FMPBF-F                   $109.1k
```

Top remaining unmatched 30-day SI profit SKUs by absolute accrual profit:

```text
wm-cc-183ln-q-gry           $31.7k accrual profit
vp-hhdyicm11-new            $20.6k
wm-nb-183ln-q-gry           $16.0k
vpo-hh-hds-05               $12.9k
wm-cc-183ln-q-wht            $9.0k
vend_bath-rug_3pack-hunter   $9.0k
v-hh-sht-rvq-gry             $8.7k
wm-cc-183ln-k-gray           $7.3k
vc-ne-glsscntnr-4pc-blk      $7.1k
v-nb-rpld-l-prplegg-new      $6.5k
```

Interpretation:

- We do have enough context to begin matching Supabase planning SKUs to SI profit rows, but not enough for a fully reliable one-pass join.
- Prefix stripping should be part of the production model.
- Remaining misses look like alias/family issues, color/size spelling variants, "new" prefixes/suffixes, and possibly channel-specific bundle SKUs.
- A durable bridge table is likely needed: `source_system`, `source_sku`, `planning_sku`, `match_method`, `confidence`, `is_active`, `reviewed_at`.
- The dashboard should keep match confidence visible internally while the mapping is being hardened.

### Existing SI Mapping Tables

Follow-up discovery found existing SI tables that explain the stripped/mapped SKU relationships much better than hand-coded prefix stripping alone.

Best evidence source:

```text
seller_cloud_shadow_of_sku
columns: sku, shadow_of, kit_parents, number_of_items, package_qty, qty_per_pallet, qty_per_case, replenishable
usable rows observed: 100,178 where sku <> shadow_of
```

Supporting sources:

```text
standard_sku
columns: sku, standard_sku
rows observed: 4,824

seller_cloud_sku_box_qty_and_item_label
columns: parent_sku, sku, box_qty, item_label
rows observed: 4,633
```

Prefix/family tables exist, but they map to parent/family SKUs rather than directly to Netstock/Supabase planning SKUs:

```text
seller_cloud_sku_prefix_tag
walmart_sku_prefix_tag
walmart_dsv_sku_prefix_tag
sku_prefix_tag
```

These are useful context for category/family reporting, but they did not directly improve product-code-level matching because their `sanders_parent_sku` values were not present as Supabase `inventory_records.product_code` values in this audit.

Read-only audit script added:

```text
app/scripts/audit-sku-bridge.mjs
npm run audit:sku-bridge
```

The script loads local env files, reads the latest complete Supabase upload, reads SI MySQL profit/mapping tables, and prints match coverage without writing to either database.

Latest audit result using evidence tables:

```text
30-day SI profit SKUs:             8,732
30-day matched profit SKUs:        7,755 / 8,732 = 88.81%
30-day matched Supabase SKUs:      4,461 / 12,805 = 34.84%
30-day matched revenue:            $3.036M / $3.394M = 89.46%
30-day matched accrual profit:     $1.186M / $1.318M = 89.97%
```

Match contribution by source:

```text
seller_cloud_shadow_of_sku_exact:             5,570 profit SKUs, $1.905M revenue, $781.9k profit
channel_prefix_strip_exact:                   1,598 profit SKUs, $957.3k revenue, $352.1k profit
direct_exact:                                   510 profit SKUs, $95.7k revenue, $29.1k profit
channel_prefix_strip_compact:                    66 profit SKUs, $76.8k revenue, $22.2k profit
direct_compact:                                   9 profit SKUs, $0.4k revenue, $0.1k profit
seller_cloud_sku_box_qty_and_item_label_exact:    2 profit SKUs, $0.9k revenue, $0.3k profit
```

Representative high-value `seller_cloud_shadow_of_sku` matches:

```text
wm-cc-183ln-q-gry         -> sht3lcc18q_gry
vp-hhdyicm11-new          -> HHDYICM11
wm-nb-183ln-q-gry         -> sht3lnnb18q_gry
vpo-hh-hds-05             -> SB-HDS-05
vend_bath-rug_3pack-hunter -> sc-cc-bathmat-lscontr-hunter
v-hh-sht-rvq-gry          -> NB-Sht-RVQ-Gry
vc-ne-glsscntnr-4pc-blk   -> EX-GLSSCNTNR-4PC-BLK
```

Production bridge recommendation:

1. Materialize `seller_cloud_shadow_of_sku` matches into Supabase as high-confidence rows.
2. Add direct and channel-prefix-stripped matches as high/medium-confidence rows.
3. Keep compact-canonical matches as lower-confidence rows because compact matching can collide.
4. Use `standard_sku` and `seller_cloud_sku_box_qty_and_item_label` as secondary evidence.
5. Add manual overrides only for the remaining high-dollar unmatched profit SKUs.

Local migration added:

```text
supabase/migrations/004_sku_bridge.sql
```

It creates `public.sku_bridge` with:

```text
source_system
source_sku
planning_sku
match_method
confidence
evidence
is_active
reviewed_by
reviewed_at
created_at
updated_at
```

This table should be populated from the read-only SI sources through a service-role ETL job. The SI App MySQL database remains read-only for this workstream.

## SKU Metrics Refresh

Added local migration:

```text
supabase/migrations/005_sku_metrics.sql
```

It creates two read-only-to-users materialized metric tables:

```text
public.sku_profit_metrics
public.sku_price_metrics
```

`sku_profit_metrics` stores one row per planning SKU with:

```text
metric_date
units_today / revenue_today / accrual_profit_today / cash_profit_today
units_7d / revenue_7d / accrual_profit_7d / cash_profit_7d
units_30d / revenue_30d / accrual_profit_30d / cash_profit_30d
matched_source_skus
match_methods
refreshed_at
```

`sku_price_metrics` stores one row per planning SKU with:

```text
price_date
selling_price
price_min
price_max
price_avg
price_source
price_source_count
refreshed_at
```

Refresh code:

```text
app/scripts/lib/si-metrics-refresh.mjs
app/scripts/refresh-si-metrics.mjs
app/api/cron/refresh-si-metrics.js
```

NPM commands:

```text
npm run refresh:si-metrics:dry-run
npm run refresh:si-metrics
```

Vercel cron:

```text
path: /api/cron/refresh-si-metrics
schedule: 0 2 * * *
```

The cron endpoint requires:

```text
Authorization: Bearer $CRON_SECRET
```

The refresh reads SI MySQL and Supabase, maps source SKUs to planning SKUs using the same matching hierarchy as the bridge audit, and upserts metrics into Supabase. It does not write to SI MySQL.

Dry run on 2026-05-20:

```text
latest Supabase upload: fullreport (13).csv
latest upload time: 2026-05-20T12:14:57.91359+00:00
profit metric date: 2026-05-19
planning SKUs: 12,805

profit source rows: 8,679
profit matched source rows: 7,701
profit materialized rows: 4,441

price source rows: 29,639
price matched source rows: 15,318
price materialized rows: 8,214
```

UI wiring:

```text
app/src/hooks/useSkuMetrics.ts
app/src/pages/purchasing/InventoryBrowser.tsx
app/src/pages/purchasing/InboundPipeline.tsx
```

Inventory Browser and Inbound Pipeline now display:

```text
Sell Price
Profit Today
Profit 7d
Profit 30d
```

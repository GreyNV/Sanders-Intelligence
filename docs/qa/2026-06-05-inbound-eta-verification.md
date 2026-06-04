# Inbound ETA Verification - 2026-06-05

## Result

**Fail: arrival-month calculations do not use the completed upload timestamp.**

Both the chart grouping and the table's `Est. Arrival` column call
`estimatedArrivalMonth(record.lt_days)`. That helper starts from `new Date()`,
so the displayed month moves as time passes even when the underlying upload is
unchanged.

The required definition is:

`completed upload uploaded_at + lead_time_days`

## Evidence

- `app/src/pages/purchasing/InboundPipeline.tsx`: chart grouping and table cell
  both call `estimatedArrivalMonth(r.lt_days)`.
- `app/src/lib/utils.ts`: `estimatedArrivalMonth()` initializes its calculation
  from the browser's current date.
- `app/src/hooks/useInventory.ts`: the latest upload metadata is used to select
  inventory rows, but its `uploaded_at` value is not returned with the inbound
  records or supplied to the ETA helper.

## Sample Review

The sample file `docs/sample-data/fullreport.csv` was inspected for on-order
SKUs. These ten rows span every meaningful lead-time range available in the
file:

| SKU | Lead time | On order |
|---|---:|---:|
| HH-MLCHGLU-1GL | 0 | 432 |
| sc-EA-Cloth-M-12-Blu | 5 | 96 |
| NB-MP-48 | 62 | 84 |
| batmatcc24_egg | 63 | 84 |
| HH216PC-CK-bablue | 77 | 480 |
| bdsktnbck_lav | 82 | 12 |
| HHDYICM51 | 90 | 144 |
| EX-GB-12 | 120 | 24 |
| NB-PCL-2PC-BVT | 150 | 820 |
| S-ES-CK-GRY | 162 | 24 |

The sample contains no on-order rows with a null lead time or lead time above
365 days. Those edge cases could not be live-sampled.

## Bug To File

**BUG: Inbound estimated arrival month drifts from upload date**

Reproduction:

1. Complete an upload and note the inbound ETA month for an on-order SKU.
2. Revisit the unchanged upload in a later calendar month.
3. Observe that the ETA month moves because it is calculated from the visit
   date rather than the upload timestamp.

Suggested follow-up: return the latest upload timestamp with inventory data and
change the ETA helper to accept an explicit baseline date. Define null and
invalid lead-time behavior before implementing.

# Vendor Total Profit Design

**Date:** 2026-05-26
**Scope:** Vendor View headline profit metric
**Status:** Approved for implementation

## Goal

Expose vendor-level 30-day accrual profit in the Vendor View so purchasing users can compare and rank vendors by actual profit contribution.

## Decisions

- Use 30-day accrual profit, consistent with the displayed `COGS %` and `Margin %` metrics.
- Label the vendor table column and summary card `Total Profit (30d)` so the period is explicit.
- Add profit as a fifth KPI card; keep all existing KPI cards.

## Data And Display

The existing `buildVendorWindowMetrics()` helper already sums per-SKU accrual profit for the `30d` window. Each vendor summary row will expose:

```typescript
totalProfit30d: windowMetrics.hasMetrics ? windowMetrics['30d'].profit : null
```

This distinguishes a real zero-profit metric from a vendor with no profit metric data. The table cell and KPI card use existing currency formatting; vendor rows without metrics display `N/A`. Negative profit values use the danger color.

## Interaction

The vendor table gains a sortable `Total Profit (30d)` column. Numeric values sort ascending or descending through the table's existing comparator, while unavailable values remain last in either direction. The expanded per-vendor time-window panel remains unchanged and provides the detail that reconciles with the headline 30-day value.

## Testing

- Add a focused source/UI guard for the new table header, fifth KPI label, and `N/A`/negative value rendering.
- Exercise nullable sorting behavior using a small exported row sorter so unavailable profit remains last both ascending and descending.
- Run the full Vitest suite and production build.


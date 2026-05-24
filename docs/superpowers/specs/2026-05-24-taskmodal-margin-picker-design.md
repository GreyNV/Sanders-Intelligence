# TaskModal Margin Picker Design

**Date:** 2026-05-24
**Scope:** Task-creation SKU picker only
**Status:** Approved for implementation

## Goal

Add a sortable `Margin %` decision metric to the `Select SKUs` picker in the task modal so purchasing users can prioritize candidate products using the same margin definition already shown elsewhere in the application.

## Decisions

- Label the new column `Margin %` to stay consistent with the Vendor View and Executive Summary terminology.
- Place it immediately after `Status`, producing the key sequence `Status | Margin % | On Hand`.
- Show margin only inside the `Select SKUs` picker for this change.
- Leave the compact selected-SKU list unchanged; a future enhancement may summarize total order value and projected margin there.

## Data And Calculation

`TaskModal` will consume existing SKU metrics and enrich selector rows with a nullable `marginPct` value. The value must come from the shared financial calculation:

```typescript
deriveFinancialPercentages({
  revenue: revenue_30d,
  profit: accrual_profit_30d,
}).marginPct
```

This preserves the current app-wide definition: 30-day accrual `Margin % = profit / revenue`, with no value when revenue is missing or non-positive.

## UI Behavior

The SKU picker table gains a sortable `Margin %` header after `Status`. Cells display one decimal place followed by `%`, or `N/A` when the margin cannot be calculated. The empty-state row `colSpan` increases for the additional column.

The compact selected-SKU list on the parent task form does not gain per-SKU margin values in this implementation.

## Sorting And Boundaries

Selector sorting will operate on enriched row objects rather than raw inventory records. Sorting by `Margin %` supports ascending and descending order, with `N/A` rows always placed after numeric rows in either direction. Existing filters, checkbox selection, selected-row tie behavior, and the 200-row display limit remain unchanged.

## Testing

- Unit test row enrichment using 30-day revenue and accrual profit.
- Unit test missing metric data produces `null` margin.
- Unit test ascending and descending margin sorting keep unavailable rows last.
- Add a focused component/source guard for the `Margin %` header placement, displayed value, and updated empty-state column span if existing component tests are source-based.
- Run the focused tests, complete test suite, and production build.


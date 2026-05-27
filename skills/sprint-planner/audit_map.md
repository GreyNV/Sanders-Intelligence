# Audit Map — Sanders Intelligence

Where to look when an Asana task says X. Extend this file as the codebase grows. Each row is "task pattern → distinctive file/symbol to grep → quick yes/no signal."

| Task keyword pattern | Primary file(s) | Distinctive symbol / string to grep | Notes |
|---|---|---|---|
| PM%, Margin %, profit margin in task picker | `app/src/components/tasks/TaskModal.helpers.ts`, `app/src/components/tasks/TaskModal.tsx` | `marginPct`, `SkuSelectorSortField` | If `'marginPct'` is in the SkuSelectorSortField union and TaskModal.tsx has a SortableTh with `field="marginPct"`, it's done. |
| Total Profit / vendor profit ranking | `app/src/pages/purchasing/VendorView.tsx`, `VendorView.helpers.ts` | `totalProfit30d`, `Total Profit` | If neither string appears, the column is missing. Margin% being present does NOT mean Total Profit is done. |
| COGS % column anywhere | `app/src/lib/financialMetrics.ts` | `cogsPct`, `deriveFinancialPercentages` | Shared formula; reuse, don't reinvent. |
| Drill-through clickable charts | `app/src/pages/csuite/ExecutiveSummary.tsx` | `navigate(`, `onClick={(entry)` | Recharts onClick wired to react-router navigate calls. |
| Action Center snooze / dismiss | `app/src/hooks/useDismissedActions.ts`, `app/src/pages/purchasing/ActionCenter.tsx` | `useDismissedSet`, `useDismissAction`, `DismissModal` | Migration: `supabase/migrations/002_dismissed_actions.sql`. |
| Avg sales per day in Inventory Browser | `app/src/pages/purchasing/InventoryBrowser.tsx` | `average_sales / 30`, `Avg/day` | Computed in UI from `average_sales` (monthly). |
| Data freshness banner | `app/src/components/layout/DataFreshnessBar.tsx` | `Freshness`, `fetchFreshness` | If the JSX only mentions upload date and not "pull", the overnight-pull task is NOT done. |
| Auto-task creation / gating rules | `app/src/lib/autoTaskRules.ts` (planned), `supabase/functions/` | `GatingRule`, `runRules`, `source='auto'` | No edge function dir = the server-side variant is not done. Client-side stop-gap lives in `lib/autoTaskRules.ts`. |
| Email alerts / daily digest | `supabase/functions/email-digest/` (planned) | `email-digest`, `sendDigest` | Pure Phase 2 work; no client-side surface. |
| Slack integration | `supabase/functions/slack-notify/` (planned) | `slack`, webhook URL env vars | Phase 2; no client-side surface. |
| Excel export on a table | `app/src/lib/exportCsv.ts` | `downloadCsv`, `inventoryToExportRows` | If any new table doesn't import these, it's missing export. |
| Tasks page / kanban | `app/src/pages/tasks/TasksPage.tsx` | `KanbanColumn`, `useTasks` | |
| Task creation modal | `app/src/components/tasks/TaskModal.tsx` | `TaskModal`, `selectableSkus` | SKU picker is a sub-modal here. |
| Inbound pipeline arrival-month grouping | `app/src/pages/purchasing/InboundPipeline.tsx` | `estimatedArrivalMonth`, `Units by Estimated Arrival Month` | |
| SI app DB connector | `app/src/lib/supabase.ts` + `supabase/migrations/004_sku_bridge.sql`, `005_sku_metrics.sql` | `sku_bridge`, `sku_metrics` | Migrations 004 and 005 are the integration layer; bridge table maps SI-app SKUs to inventory rows. |
| Auth / invite / password reset | `app/src/pages/ResetPassword.tsx`, `app/src/contexts/AuthContext.tsx`, `app/src/lib/supabase.ts` | `initialUrlAuthType`, `PASSWORD_RECOVERY`, `mode=invite` | |
| Multi-warehouse support | (none yet) | `warehouse_id`, `location_code` | If no column exists, task not started. |
| AI chatbox | (none yet) | `chatbox`, `Anthropic`, `openai` | If no API client deps in package.json, task not started. |

## How to use this file in an audit

1. Take an open Asana task.
2. Find the row whose keyword pattern matches the task title or notes.
3. Run `Grep` on the distinctive symbol against `D:\Sanders Intelligence\app\src` (and `supabase/` for backend pieces).
4. If the symbol exists with the expected semantics, the task is DONE — close it in Asana with file:line evidence.
5. If the symbol exists but the task asks for more (e.g., Margin% exists but Total Profit doesn't), the task is PARTIAL — keep open, write the sprint brief with the remaining scope.
6. If the symbol doesn't exist, the task is NOT STARTED — leave open, factor into the re-rank.

When a new feature area gets its own home in the codebase, add a row here.

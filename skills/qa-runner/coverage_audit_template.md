# Test Coverage Audit Template

Snapshot from 2026-05-26. Refresh this table each QA run by re-globbing.

## Expected pairs

| Source | Expected test file | Present (2026-05-26)? |
|---|---|---|
| `app/src/pages/purchasing/ActionCenter.helpers.ts` | `__tests__/ActionCenter.helpers.test.ts` | Yes |
| `app/src/pages/purchasing/InventoryBrowser.helpers.ts` | `__tests__/InventoryBrowser.helpers.test.ts` | Yes |
| `app/src/pages/purchasing/InventoryBrowser.helpers.ts` (static) | `__tests__/InventoryBrowser.static.test.ts` | Yes |
| `app/src/pages/purchasing/VendorView.helpers.ts` | `__tests__/VendorView.helpers.test.ts` | Yes |
| `app/src/pages/purchasing/VendorView.helpers.ts` (static) | `__tests__/VendorView.static.test.ts` | Yes |
| `app/src/pages/purchasing/InboundPipeline.tsx` (NO helpers) | `__tests__/InboundPipeline.helpers.test.ts` | **NO — file FEATURE ticket** |
| `app/src/pages/csuite/ExecutiveSummary.helpers.ts` | `__tests__/ExecutiveSummary.helpers.test.ts` | Yes |
| `app/src/components/tasks/TaskModal.helpers.ts` | `__tests__/TaskModal.helpers.test.ts` | Yes |
| `app/src/components/tasks/TaskModal.helpers.ts` (static) | `__tests__/TaskModal.static.test.ts` | Yes |
| `app/src/components/layout/DataFreshnessBar.helpers.ts` | `__tests__/DataFreshnessBar.helpers.test.ts` | Yes |
| `app/src/components/layout/DataFreshnessBar.helpers.ts` (static) | `__tests__/DataFreshnessBar.static.test.ts` | Yes |
| `app/src/lib/utils.ts` | `__tests__/utils.test.ts` | Yes |
| `app/src/lib/financialMetrics.ts` | `__tests__/financialMetrics.test.ts` | **NO — file FEATURE ticket** |
| `app/src/lib/exportCsv.ts` | `__tests__/exportCsv.test.ts` | **NO — file FEATURE ticket** |
| `app/src/hooks/useInventory.ts` | `__tests__/useInventory.test.ts` | **NO — file FEATURE ticket** |
| `app/src/hooks/useDismissedActions.ts` | `__tests__/useDismissedActions.test.ts` | **NO — file FEATURE ticket** |
| `app/src/hooks/useSkuMetrics.ts` | `__tests__/useSkuMetrics.test.ts` | **NO — file FEATURE ticket** |
| `app/src/hooks/useTasks.ts` | `__tests__/useTasks.test.ts` | NO (lower priority) |
| `app/src/hooks/useUploads.ts` | `__tests__/useUploads.test.ts` | NO (lower priority) |
| `app/src/hooks/useUsers.ts` | `__tests__/useUsers.test.ts` | NO (lower priority) |
| `app/src/contexts/AuthContext.tsx` | `__tests__/AuthContext.test.tsx` | **NO — file FEATURE ticket** |
| `app/src/pages/ResetPassword.tsx` | `__tests__/ResetPassword.test.tsx` | **NO — file FEATURE ticket** |

## Priority rules for filing FEATURE tickets

File a ticket when ANY of these is true:
- The module touches **money** (financialMetrics, exportCsv, profit columns).
- The module touches **auth** (AuthContext, ResetPassword, Sidebar role-gating).
- The module does **pagination across the Supabase 1000-row cap** (useInventory).
- The module has had a **historical bug** (cite the closed Asana task).
- The module is a **shared utility used by 3+ consumers** (financialMetrics, exportCsv).

Skip filing if:
- It's a one-off page component with no extracted logic.
- It's covered transitively by a helpers test (e.g., TaskModal.tsx is covered by TaskModal.helpers.test.ts).
- Coverage already exists for the critical paths even if not 100% statement coverage.

## How to fold this into the QA run

1. Glob `app/src/**/*.helpers.ts` `app/src/lib/*.ts` `app/src/hooks/*.ts` `app/src/contexts/*.tsx`
2. Glob `app/src/__tests__/*.test.{ts,tsx}`
3. For each source file, derive expected test name and check existence.
4. For each missing one matching the priority rules above, file a FEATURE ticket using the ticket conventions in SKILL.md.
5. Update the table above with current state so the next run starts from an accurate snapshot.

# Sanders Intelligence — Codebase Reference

> Token-efficient guide for future Codex sessions. Read this before touching any file.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS (custom design tokens via CSS vars) |
| Routing | React Router v6 |
| Data fetching | TanStack Query v5 (`@tanstack/react-query`) |
| Backend / DB | Supabase (Postgres + Auth + RLS) |
| Charts | Recharts |
| Icons | lucide-react |
| Deploy | Vercel (auto-deploys from git push) |

**Dev command:** `cd app && npm run dev`  
**Workspace root:** `D:\Sanders Intelligence\`  
**App source:** `D:\Sanders Intelligence\app\src\`

---

## User Roles

| Role | Home Route | Access |
|---|---|---|
| `admin` | `/purchasing/action-center` | All pages |
| `purchasing` | `/purchasing/action-center` | Purchasing pages + Uploads + Tasks |
| `csuite` | `/executive` | Executive pages + Tasks |

Role guard: `<RoleGuard allow={['admin', 'purchasing']}>` in `App.tsx`.

---

## Route Map

```
/login                          Login.tsx
/reset-password                 ResetPassword.tsx  (invite + recovery flows)
/                               → HomeRedirect (role-based)

/purchasing/action-center       ActionCenter.tsx      [admin, purchasing]
/purchasing/inventory           InventoryBrowser.tsx  [admin, purchasing]
/purchasing/inbound             InboundPipeline.tsx   [admin, purchasing]

/executive                      ExecutiveSummary.tsx  [admin, csuite]
/executive/departments          DepartmentOverview.tsx [admin, csuite]

/tasks                          TasksPage.tsx         [all roles]

/admin/users                    UsersPage.tsx         [admin]
/admin/uploads                  UploadsPage.tsx       [admin, purchasing]
```

---

## Inventory Status Values

All 6 raw CSV values — must match exactly (case-sensitive):

| Value | Meaning | KPI Bucket |
|---|---|---|
| `Ok` | Adequately stocked | OK |
| `Excess stock` | Too much on hand | Excess |
| `Surplus orders` | Over-ordered (on order exceeds need) | Excess |
| `Potential s/o` | Risk of stockout | At Risk |
| `Stocked out` | Already stocked out | At Risk |
| `New item` | First-time stock | New Items |

**KPI groupings** (used in hooks and charts):
- **At Risk** = `Potential s/o` OR `Stocked out`
- **Excess** = `Excess stock` OR `Surplus orders`

Badge variants are defined in `Badge.tsx`: `ok`, `excess`, `stockout`, `surplus`, `new_item`.

---

## URL Parameters — InventoryBrowser

`/purchasing/inventory` reads these params on mount to pre-filter the table:

| Param | Example | Effect |
|---|---|---|
| `?status=` | `?status=Potential+s%2Fo` | Pre-selects status dropdown |
| `?search=` | `?search=ABC123` | Pre-fills search box |
| `?brand=` | `?brand=Nike` | Pre-fills brand filter |

Multiple params combine: `?status=Excess+stock&brand=Nike`

Use `encodeURIComponent()` when building links — `s/o` must become `s%2Fo`.  
Implementation: `useLocation()` + `URLSearchParams` in InventoryBrowser's initial state.

---

## Key Hooks

### `useInventory()` — `hooks/useInventory.ts`
Fetches all records for the latest complete upload. Paginates past Supabase's 1000-row cap.  
Cache key: `['inventory', 'latest']`, stale after 5 min.

### `fetchInventoryForUpload(uploadId)` — `hooks/useInventory.ts`
Non-hook async function. Paginates all records for a specific upload. Used by UploadsPage for CSV download.

### `useInventoryKPIs()` — `hooks/useInventory.ts`
Returns: `totalOnHandValue`, `totalUnits`, `atRiskCount`, `excessCount`, `okCount`, `newItemCount`, `backorderCount`, `totalBackorderValue`, `excessValue`, `recOrderValue`, `fillRate`, `totalSkus`, `activeSkus`.

### `useAtRiskItems()` — `hooks/useInventory.ts`
Filters for `Potential s/o` OR `Stocked out` with `recommended_order > 0`.

### `useBackorderItems()` — `hooks/useInventory.ts`
Filters for `unsatisfied_customer_orders_units > 0`.

### `useDismissedActions()` — `hooks/useDismissedActions.ts`
Fetches active dismissals (permanent `dismissed_until = null`, or future date).  
Cache key: `['dismissed_actions']`, stale after 2 min.

### `useDismissedSet(actionType)` — `hooks/useDismissedActions.ts`
Returns `Set<string>` of product_codes dismissed for the given action type (`'at_risk'` or `'backorder'`). O(1) lookup.

### `useDismissAction()` — `hooks/useDismissedActions.ts`
Mutation: inserts a dismissal record. Params: `{ product_code, action_type, dismissed_until: string|null, reason?: string }`.  
`dismissed_until = null` = permanent. Pass ISO date string for snooze.

### `useRestoreAction()` — `hooks/useDismissedActions.ts`
Mutation: deletes dismissal. Non-admins can only delete their own (RLS enforced).

---

## Database Tables

### `public.users`
`id` (uuid, = auth.uid) · `email` · `name` · `role` (admin/purchasing/csuite) · `department` · `is_active` · `created_at`

### `public.uploads`
`id` · `uploaded_by` (→ users) · `uploaded_at` · `filename` · `row_count` · `status` (processing/complete/failed) · `notes`

### `public.inventory_records`
Full CSV row per product per upload. Key fields: `upload_id`, `product_code`, `status` (6 values above), `on_hand_value`, `excess_value`, `recommended_order_value`, `unsatisfied_customer_orders_units/value`, `average_sales` (monthly), `back_orders`.

**Avg sales/day** = `average_sales / 30` (computed in UI, not stored).

### `public.tasks`
`id` · `title` · `description` · `status` (todo/in_progress/done/cancelled) · `priority` (low/medium/high/urgent) · `due_date` · `department` · `assigned_to` (→ users) · `created_by` · `sku_code` · `source` (manual/auto)

### `public.dismissed_actions`
`id` · `product_code` · `action_type` (at_risk/backorder) · `dismissed_by` (→ users) · `dismissed_until` (date, null = permanent) · `reason` · `created_at`

RLS: all authenticated users can read; users manage their own; admins can delete any.  
**Migration file:** `supabase/migrations/002_dismissed_actions.sql` — must be run manually in Supabase SQL Editor.

---

## Component Map

```
src/
├── main.tsx                    App entry; ErrorBoundary wraps entire tree
├── App.tsx                     Routes, RoleGuard, HomeRedirect, useDeactivatedSignOut
├── contexts/
│   └── AuthContext.tsx         session, profile, loading, signIn, signOut, signUp
│                               PGRST116 error → setProfile(null) → triggers sign-out
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx        Layout wrapper (sidebar + outlet)
│   │   ├── Sidebar.tsx         Nav links; renders null when !profile
│   │   └── DataFreshnessBar.tsx  Shows age of latest upload
│   └── ui/
│       ├── Badge.tsx           statusVariant() maps status string → badge variant
│       ├── ErrorBoundary.tsx   Class component; catches render errors
│       ├── KPICard.tsx         Metric card with variants: default/success/warning/danger/info
│       ├── LoadingSpinner.tsx  + PageLoader (full-screen)
│       └── Modal.tsx           Generic modal wrapper
├── pages/
│   ├── Login.tsx
│   ├── ResetPassword.tsx       Handles invite (mode=invite) and recovery flows
│   ├── purchasing/
│   │   ├── ActionCenter.tsx    At-risk + backorder tables; snooze/restore per row
│   │   ├── InventoryBrowser.tsx  Full table; URL param filters; Avg/day column
│   │   └── InboundPipeline.tsx   On-order items
│   ├── csuite/
│   │   ├── ExecutiveSummary.tsx  $ health bar; pie + bar charts (clickable drill-through)
│   │   └── DepartmentOverview.tsx
│   ├── tasks/
│   │   └── TasksPage.tsx       Kanban; edit button per task
│   └── admin/
│       ├── UsersPage.tsx       Invite, deactivate, reset PW
│       └── UploadsPage.tsx     Upload CSV; download CSV per upload row
├── hooks/
│   ├── useInventory.ts         useInventory, useInventoryKPIs, useAtRiskItems,
│   │                           useBackorderItems, useInboundItems, fetchInventoryForUpload
│   ├── useDismissedActions.ts  useDismissedActions, useDismissedSet,
│   │                           useDismissAction, useRestoreAction
│   ├── useTasks.ts             useTasks, useCreateTask, useUpdateTask
│   ├── useUploads.ts           useUploads, useUploadCSV
│   └── useUsers.ts             useUsers, useInviteUser, useUpdateUser
├── lib/
│   ├── supabase.ts             Supabase client; exports initialUrlAuthType
│   └── utils.ts                fmtCurrency, fmtNumber, fmtDate, groupBy
└── types/
    └── index.ts                AppUser, Upload, InventoryRecord, Task, etc.
```

---

## ActionCenter — Snooze/Archive Feature

- At-risk and backorder rows each have a **Snooze** button.
- Clicking opens `DismissModal` (inline in ActionCenter) with duration options: 3/7/14/30 days or Permanent, plus optional reason text.
- Snoozed rows are filtered from the main table via `useDismissedSet`.
- Section headers show a badge with snoozed count + "Show snoozed" toggle to reveal dismissed rows.
- Dismissed rows show a **Restore** button instead of Snooze.
- Restore calls `useRestoreAction` → deletes the `dismissed_actions` row.
- Non-admins can only restore their own dismissals (RLS).

**Data quality flag:** If a row has `Excess stock` or `Surplus orders` status but also has `back_orders > 0`, an `AlertCircle` icon appears (this is a source data issue, not a logic bug).

---

## Auth Flows

### Invite new user
1. Admin sends invite via UsersPage → Supabase sends magic link
2. User clicks link → Supabase processes `#access_token` (type=invite) in `createClient()` at module load
3. `initialUrlAuthType` captured in `supabase.ts` before hash is removed
4. `AuthRedirectHandler` in App.tsx sees `initialUrlAuthType === 'invite'` → navigates to `/reset-password?mode=invite`

### Password recovery
1. Admin clicks "Reset PW" in UsersPage → `supabase.auth.resetPasswordForEmail()`
2. User clicks email link → Supabase fires `PASSWORD_RECOVERY` auth event
3. `AuthRedirectHandler` catches it → navigates to `/reset-password`

### Deactivated users
1. `loadProfile` in AuthContext fetches `public.users` row
2. If `PGRST116` (no row found = deactivated/deleted) → `setProfile(null)`
3. `useDeactivatedSignOut` in App.tsx detects `!loading && session && !profile` → calls `signOut()`
4. Sidebar renders `null` when `!profile` (hides nav, prevents stuck UI)

---

## Patterns & Conventions

### Always paginate Supabase queries
Supabase returns max 1000 rows by default. Use `.range(from, from + PAGE_SIZE - 1)` in a loop.

### Async mutation error handling
Always use `try/catch/finally` so loading state always clears:
```typescript
setLoading(true)
try { await doThing() }
catch (err) { setError(err) }
finally { setLoading(false) }
```

### CSV download (client-side)
Files are NOT stored in Supabase Storage — CSVs are regenerated client-side from `inventory_records`.  
See `fetchInventoryForUpload()` + `recordsToCsv()` in UploadsPage.

### Recharts drill-through
- `<Pie onClick={(entry) => navigate(...)}>` — entry has the original data object
- `<BarChart onClick={(data) => data?.activePayload?.[0]?.payload...}>` — use `activePayload`

### URL-param-driven filters
```typescript
const location = useLocation()
const params = new URLSearchParams(location.search)
const [status, setStatus] = useState(params.get('status') ?? '')
```

### TanStack Query keys
- `['inventory', 'latest']` — current upload records
- `['uploads']` — upload history
- `['users']` — all users
- `['tasks']` — all tasks
- `['dismissed_actions']` — active dismissals

---

## Pending / Known Items

- **Run migration:** `supabase/migrations/002_dismissed_actions.sql` must be executed in Supabase SQL Editor before the snooze feature works in production.
- **Historical trends:** ExecutiveSummary has a placeholder card that activates after 7+ days of uploads (week-over-week KPI movement).
- **Bash tool:** `mcp__workspace__bash` is sometimes unavailable. Fallback: write git commands to clipboard via computer-use tools.

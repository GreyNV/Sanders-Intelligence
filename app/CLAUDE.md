# Sanders Intelligence

Inventory intelligence dashboard for Sanders Collection.
React + Vite + TypeScript + Tailwind frontend. Supabase backend (Postgres, Auth, Edge Functions). Vercel hosting.

## Roles
`admin` · `purchasing` · `csuite`  
Users have a `department` field for Phase 3 multi-dept expansion.

## Key tables
- `users` — extends auth.users; role + department + is_active
- `uploads` — append-only CSV upload log; freshness = compare uploaded_at to today
- `inventory_records` — all CSV columns per upload_id; query latest complete upload for dashboards
- `tasks` — scoped by department; source 'manual'|'auto' (auto = Phase 2)

## Freshness rule
`date(latest_upload.uploaded_at) < CURRENT_DATE` → show Outdated banner on ALL views

## File map
```
src/
  App.tsx               # routes + role guards
  contexts/AuthContext   # Supabase auth + profile
  hooks/
    useInventory.ts      # inventory queries + KPI derivations
    useTasks.ts          # task CRUD
    useUploads.ts        # upload history + CSV upload mutation
    useUsers.ts          # user management
  pages/
    Login.tsx
    purchasing/          # ActionCenter, InventoryBrowser, InboundPipeline
    csuite/              # ExecutiveSummary, DepartmentOverview (placeholder)
    tasks/TasksPage.tsx
    admin/               # UsersPage, UploadsPage
  components/
    layout/              # AppShell, Sidebar, DataFreshnessBar
    ui/                  # KPICard, Badge, LoadingSpinner, Modal
    tasks/TaskModal.tsx
  lib/
    supabase.ts          # Supabase client
    utils.ts             # fmtNumber, fmtCurrency, fmtDate, cn, groupBy, etc.
  types/index.ts         # All shared TypeScript interfaces
supabase/
  migrations/001_initial_schema.sql   # Run this first in Supabase SQL Editor
  functions/
    upload-csv/          # Parses fullreport.csv → inventory_records
    invite-user/         # Admin user invitation
```

## Env vars needed
```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```
Edge functions need `SUPABASE_SERVICE_ROLE_KEY` set in Supabase Dashboard → Edge Functions → Secrets.

## Phase roadmap
- Phase 2: auto-tasks, email/Slack alerts, trend charts from upload history
- Phase 3: SA DB connector (swap Edge Function), chatbox, multi-dept C-Suite view

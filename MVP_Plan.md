# Sanders Intelligence — MVP Planning Document

> **Status:** Planning Phase · Last updated: 2026-05-02  
> **Audience:** Internal reference — Purchasing users, C-Suite, Admins

---

## 1. Project Overview

Internal inventory intelligence dashboard for Sanders Collection. Replaces ad-hoc reporting with a role-specific, daily-updated web application fed by CSV uploads from the existing inventory management system (Netstock / fullreport.csv).

**Core promise to each user type:**
- **Purchasing:** Open the dashboard each morning and immediately know what needs to be ordered, what's at risk, and what's coming in.
- **C-Suite:** One clean page that shows inventory health and flags anything requiring executive attention — without operational noise.
- **Admin:** Manage users, upload files, monitor system health.

---

## 2. Tech Stack Decisions

| Layer | Choice | Rationale |
|---|---|---|
| **Frontend** | React + Vite + TypeScript | Component-based; new department views in Phase 3 are just new routes + components |
| **Styling** | Tailwind CSS | Utility-first; matches the dark-UI direction already established |
| **Charts** | Recharts | Already used in prototypes; good React integration |
| **Data fetching** | TanStack Query | Caching, background refresh, loading/error states out of the box |
| **Backend/DB** | Supabase | Managed Postgres + Auth + File Storage + Edge Functions + REST API — one platform for MVP |
| **Auth** | Supabase Auth (email/password) | Simple for MVP; SSO/OAuth available in Phase 2 if needed |
| **Frontend hosting** | Vercel | Zero-config, free tier, automatic deploys from Git |
| **Backend hosting** | Supabase | Free tier handles MVP volume; scales with the product |
| **CSV parsing** | Supabase Edge Function (Deno) | Serverless, runs close to DB, easy to swap for a DB connector in Phase 3 |

**Why Supabase specifically:**  
- Built-in Row Level Security (RLS) handles role-based data access without custom middleware  
- Auth + DB + Storage in one platform = no stitching multiple services together  
- Realtime subscriptions available for Phase 2 live alerts  
- Edge Functions are the clean swap point for Phase 3 DB connector integration  

---

## 3. User Roles & Access Matrix

| Role | MVP Count | Dashboard Access | Task Access | Upload Access |
|---|---|---|---|---|
| `admin` | 1–2 | All views | All tasks (all departments) | ✅ Can upload |
| `purchasing` | 1–2 | Purchasing dashboard | Purchasing dept tasks only | ✅ Can upload |
| `csuite` | 2–3 | C-Suite dashboard | Read all departments' tasks | ❌ |

**Scalability note:** Every user has a `department` field from day one. When new departments are added (Phase 3), their users are assigned the new department value — no schema changes needed. C-Suite always sees across all departments.

---

## 4. Database Schema

### `users`
```sql
id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
email         text UNIQUE NOT NULL
name          text NOT NULL
role          text NOT NULL  -- 'admin' | 'purchasing' | 'csuite'
department    text           -- 'purchasing' | 'warehouse' | 'marketing' | etc.
is_active     boolean DEFAULT true
created_at    timestamptz DEFAULT now()
```

### `uploads`
```sql
id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
uploaded_by   uuid REFERENCES users(id)
uploaded_at   timestamptz DEFAULT now()
filename      text NOT NULL
row_count     integer
status        text NOT NULL  -- 'processing' | 'complete' | 'failed'
notes         text
```
> **Append-only.** Never delete rows. This preserves history for Phase 2 trend charts — no migration needed.

### `inventory_records`
```sql
id                              uuid PRIMARY KEY DEFAULT gen_random_uuid()
upload_id                       uuid REFERENCES uploads(id) NOT NULL
warehouse                       text
product_code                    text NOT NULL
description                     text
supplier_code                   text
supplier_description            text
brand_code                      text
brand_name                      text
category_code                   text
category_name                   text
on_hand                         integer
days_on_hand                    integer
cost_price                      numeric(10,4)
on_hand_value                   numeric(12,4)
classification                  text   -- A | B | C | X | S
velocity                        text   -- H | M | L | X
status                          text   -- 'Ok' | 'Excess stock' | 'Potential s/o'
status_units                    integer
status_value                    numeric(12,2)
excess_units                    integer
excess_value                    numeric(12,2)
recommended_order               integer
recommended_order_value         numeric(12,2)
recommended_order_days          integer
age                             integer
average_sales                   numeric(10,4)
average_forecasted_sales        numeric(10,4)
lt_days                         integer
on_order                        integer
back_orders                     integer
total_customer_orders           integer
unsatisfied_customer_orders_units   integer
unsatisfied_customer_orders_value   numeric(12,2)
moq                             integer
order_multiples                 integer
selling_price                   numeric(10,4)
```
> Indexed on: `upload_id`, `product_code`, `status`, `brand_code`, `supplier_code`

### `tasks`
```sql
id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
title         text NOT NULL
description   text
status        text NOT NULL DEFAULT 'todo'  -- 'todo' | 'in_progress' | 'done' | 'cancelled'
priority      text NOT NULL DEFAULT 'medium' -- 'low' | 'medium' | 'high' | 'urgent'
due_date      date
department    text NOT NULL   -- tasks are scoped by department
assigned_to   uuid REFERENCES users(id)
created_by    uuid REFERENCES users(id) NOT NULL
created_at    timestamptz DEFAULT now()
updated_at    timestamptz DEFAULT now()
sku_code      text           -- optional link to a product (for Phase 2 auto-tasks)
source        text DEFAULT 'manual'  -- 'manual' | 'auto' (Phase 2)
```

---

## 5. Dashboard Views

### 5.1 Purchasing Dashboard

#### Tab 1 — Action Center *(default landing page)*
The daily "what do I work on today" view. Purchasing users land here every morning.

**Layout:**
- **Data freshness banner** (sticky top): Green "Data as of [today's date]" OR red "⚠ Outdated! Last updated on: [date]" — appears on every tab, not just this one.
- **KPI strip (4 cards):** Items needing orders | Potential stockouts | Active backorders | Total recommended order value ($)
- **Attention Required table:** Status = "Potential s/o" AND Recommended Order > 0, sorted by urgency (days on hand ASC). Columns: SKU · Description · Brand · On Hand · Days on Hand · Avg Sales/mo · Recommended Order Qty · Order Value · Backorders · Actions
- **Backorders panel:** Items with Unsatisfied Customer Orders > 0, sorted by value DESC
- **My Tasks widget:** Small panel showing open tasks for the purchasing department (links to full task view)

#### Tab 2 — Inventory Browser
Full filterable, sortable SKU-level table.

**Filters:** Free-text search (SKU / description / brand / supplier) · Status · Classification (A/B/C/X) · Velocity (H/M/L/X) · Brand · Category  
**Columns:** SKU · Description · Brand · Category · On Hand · Days on Hand · Status badge · Recommended Order · Avg Sales · On Order · Backorders · Cost Price

#### Tab 3 — Inbound Pipeline
What's on order and when it arrives.

**Layout:**
- KPI strip: Total units on order · # SKUs on order · Units arriving next 30/60/90 days
- Bar chart: Inbound units by month
- Table: Items on order with ETA breakdown

---

### 5.2 C-Suite Dashboard

#### View 1 — Executive Summary *(default)*
- **Data freshness banner** (same as purchasing)
- **Inventory health bar:** Visual breakdown by status — Ok / Excess / Potential s/o — by value and unit count
- **KPI row (5 cards):** Total inventory value · Fill rate % · SKUs at risk (potential s/o) · Excess stock value · Open backorders ($)
- **Urgent flags section:** Top 5 items by risk — large potential stockouts, major excess positions, high-value backorders
- **Trend area:** Placeholder in MVP ("Historical trends available after 7+ days of uploads") — auto-populates in Phase 2

#### View 2 — Department Overview *(Phase 3 placeholder)*
- Clean empty state in MVP: "Department-level reporting coming soon. Currently showing Purchasing."
- Structurally: a routed page, ready to receive department-specific components in Phase 3.
- C-Suite will eventually see: Purchasing · Warehouse · Marketing · etc. — each as a collapsible section.

---

## 6. Task Module Spec

### Core features (MVP)
- Create task: title, description, priority, due date, assignee (from same dept), optional SKU link
- Status flow: `Todo → In Progress → Done` (+ `Cancelled`)
- Department scoping: purchasing users see only purchasing tasks; C-Suite and Admin see all departments with a department filter

### Views
- **My Tasks:** Tasks assigned to the logged-in user
- **Department Board:** All tasks for the user's department (list view with status columns; kanban optional in Phase 2)
- **All Tasks (C-Suite / Admin):** Cross-department view with department filter, assignee filter, status filter

### Phase 2 auto-tasks
`source = 'auto'` flag is already in the schema. The trigger logic (e.g., "if Status = Potential s/o for 2+ consecutive uploads AND no open task exists for this SKU") will be an Edge Function — no schema changes needed. Duplicate detection: query for open tasks with matching `sku_code` before creating.

---

## 7. File Upload Flow

```
User selects fullreport.csv
         ↓
Frontend sends file to Supabase Edge Function
         ↓
Edge Function:
  1. Validates column headers match expected schema
  2. Parses CSV rows
  3. Inserts new row into `uploads` (status: 'processing')
  4. Bulk-inserts all records into `inventory_records` with upload_id
  5. Updates `uploads.status` → 'complete' (or 'failed' with error notes)
         ↓
All dashboard queries join against:
  SELECT * FROM inventory_records WHERE upload_id = (
    SELECT id FROM uploads WHERE status = 'complete' ORDER BY uploaded_at DESC LIMIT 1
  )
         ↓
Freshness check on every page load:
  IF date(latest_upload.uploaded_at) < CURRENT_DATE → show "⚠ Outdated!" banner
```

**Phase 3 swap point:** The Edge Function is replaced (or supplemented) by a DB connector call. The `inventory_records` insert logic stays identical — only the data source changes.

---

## 8. Data Freshness Logic

| Condition | Banner State |
|---|---|
| Latest upload = today | ✅ "Data as of [date]" (green) |
| Latest upload = yesterday or older | ⚠ "Outdated! Last updated on: [date]" (red/orange) |
| No uploads ever | ⚠ "No data loaded. Please upload the report." |

Banner appears on **every view** for **every role** — non-dismissable.

---

## 9. Data Fields Not Used in MVP (Available for Phase 2/3)

The following CSV columns are stored but not surfaced in MVP views. They become available without any schema changes:

- `average_forecasted_sales`, `average_forecasted_issues` → Phase 2 forecast intelligence
- `rc_days`, `rc_units`, `eff_rc_units` → Replenishment cycle analysis
- `ss_days`, `ss_units`, `model_units` → Safety stock modeling
- `allocated_stock` → Fulfillment/warehouse view (Phase 3)
- `unit_volume`, `unit_weight` → Logistics/warehouse dashboard (Phase 3)
- `actual_fill_%`, `target_fill_%` → Fill rate tracking (surfaced in C-Suite Phase 2)
- `selling_price` → Margin analysis (Phase 3)

---

## 10. Development Order (Recommended)

| Sprint | Deliverable |
|---|---|
| 1 | Supabase project: schema, RLS policies, auth config, seed test users |
| 2 | React app scaffold: Vite + Router + Tailwind + Supabase client + login page + role-based route guards |
| 3 | File upload pipeline: CSV → Edge Function → DB; freshness check logic |
| 4 | Purchasing Dashboard: Action Center (the highest-value view) |
| 5 | Purchasing Dashboard: Inventory Browser + Inbound Pipeline |
| 6 | C-Suite Dashboard: Executive Summary |
| 7 | Task Module: CRUD, department scoping, My Tasks + Department Board |
| 8 | Admin UI: user management, upload history, system health |
| 9 | QA pass: error states, loading states, empty states, mobile responsiveness |
| 10 | Deploy: Vercel + Supabase production config, custom domain (if applicable) |

---

## 11. Phase Roadmap

### Phase 1 — MVP (Current)
- Login gate with role-based routing
- Daily CSV upload with freshness alert
- Purchasing dashboard (3 tabs)
- C-Suite dashboard (1 active view)
- Task module (manual, department-scoped)
- Admin: user management + upload history

### Phase 2 — Intelligence Layer
- **Auto-task creation:** Edge Function triggered by upload; checks criteria (e.g., potential s/o), creates tasks if no duplicate exists
- **Email alerts:** Purchasing team gets daily digest of items requiring action; C-Suite gets weekly brief
- **Slack integration:** New urgent task notification to a channel; weekly inventory health post
- **Trend charts:** Historical upload data now has depth; C-Suite Summary shows week-over-week KPI movement
- Estimated additional infrastructure cost: ~$0–20/mo (Resend for email, Slack webhook is free)

### Phase 3 — Platform Expansion
- **SA app DB integration:** Swap CSV Edge Function for a direct DB connector; real-time or near-real-time data
- **Chatbox:** Natural language questions over inventory data ("What's our worst stockout risk by value right now?") — requires LLM API cost
- **Department expansion:** Add `warehouse`, `marketing` (etc.) dashboards; C-Suite view gains per-department drill-down
- **Multi-warehouse support:** `warehouse` field already in schema; RLS policies updated to scope by warehouse if needed

---

## 12. Project Discovery Docs (to be created at project init)

When development begins, create the following in the project root:

### `CLAUDE.md` (keep this lean — it's read every session)
```
# Sanders Intelligence

Inventory intelligence dashboard. React + Vite + TypeScript + Tailwind frontend.
Supabase backend (auth, Postgres, edge functions). Deployed on Vercel.

## Roles: admin | purchasing | csuite
## Key tables: users, uploads, inventory_records, tasks
## Data source: fullreport.csv (daily upload via /admin/upload)
## Freshness: if uploads.uploaded_at < today → show Outdated banner on all views

## File map
src/
  pages/         # route-level components (purchasing/, csuite/, admin/, tasks/)
  components/    # shared UI (DataFreshnessBar, TaskWidget, KPICard, etc.)
  lib/           # supabase client, query hooks, CSV parser
  types/         # shared TypeScript interfaces

supabase/
  migrations/    # schema SQL files (source of truth)
  functions/     # edge functions (upload-csv/, auto-tasks/ in Phase 2)
```

### `schema.sql` — source of truth for all table definitions (see Section 4 above)

### `views.md` — condensed version of Section 5 for quick reference during UI work

---

## 13. Open Questions / Decisions Deferred

- [ ] Custom domain for hosted app? (affects Vercel config)
- [ ] Should admins be able to manually mark an upload as "active" (i.e., override the latest-upload logic)? Useful if a bad file was uploaded and the previous day's data is more reliable.
- [ ] Notification preference per user (email vs Slack vs in-app) — design for Phase 2, decide format before Sprint 7
- [ ] Should "excess stock" items also appear in the Action Center (e.g., "items to consider not reordering")? Or keep Action Center focused on shortages only?
- [ ] Task due date: hard deadline or soft target? Should overdue tasks escalate in the UI?

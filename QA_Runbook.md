# Sanders Intelligence — QA Runbook

> **Version:** 1.0 | **Last updated:** May 2026  
> Run this document against the live Vercel deployment unless otherwise noted.

---

## Quick Reference

| Suite | When to run | Time |
|---|---|---|
| **Smoke Test** (⚡ marked cases) | After every deploy | ~10 min |
| **Full Regression** | Before releases / after major features | ~45 min |
| **Automated Unit Tests** | On every `git push` (CI) or manually via `npm test` | ~5 sec |

---

## 1. Test Environment & Accounts

### URL
```
https://[your-app].vercel.app
```

### Required test accounts

| Role | Email | Notes |
|---|---|---|
| Admin | admin@test.com | Full access to all pages |
| Purchasing | purchasing@test.com | Action Center, Inventory, Tasks, Uploads |
| C-Suite | csuite@test.com | Executive pages + Tasks only |
| Deactivated | deactivated@test.com | Should be force-signed-out on login |

> Fill in actual credentials above before distributing this document.

### Test data requirements
- At least one completed CSV upload in the system
- At least one at-risk item (`Potential s/o` or `Stocked out` status) in the latest upload
- At least one item with `Excess stock` or `Surplus orders` status
- At least one item with `unsatisfied_customer_orders_units > 0`
- At least one item with `on_order > 0`

---

## 2. Automated Tests

### What is automated
Vitest unit tests cover pure business logic — no browser, no Supabase required.

| File | What it tests |
|---|---|
| `src/__tests__/utils.test.ts` | All formatting & helper functions in `lib/utils.ts` |
| `src/__tests__/analyzeInventory.test.ts` | Inventory classification, KPI aggregation, item routing |

### How to run
```bash
cd app
npm test           # run once
npm run test:watch # watch mode during development
```

### What cannot be automated (yet)
The following require a live browser + Supabase and should remain in the manual suite:
- Auth flows (login, logout, invite, password reset)
- Role-based redirects
- Supabase data mutations (task create/edit/delete, snooze/restore, CSV upload)
- File downloads
- Chart drill-through navigation
- Multi-step modal flows

> **Future:** Playwright E2E tests could cover the full app against a test Supabase project. Add `@playwright/test` and seed data scripts when the team is ready.

---

## 3. Smoke Test — Run After Every Deploy (~10 min)

Run these 14 cases in order. Any failure blocks the release.

---

### ⚡ SMOKE-01 — Admin login and landing page
**Steps:**
1. Navigate to app URL in an incognito window
2. Enter admin credentials → click Sign In

**Expected:** Redirect to `/purchasing/action-center`. Page shows "Action Center" heading. 4 KPI cards visible in the strip. No spinner stuck on screen.

---

### ⚡ SMOKE-02 — Action Center KPI strip icons
**Steps:**
1. From SMOKE-01, observe the KPI strip

**Expected:** Cards show: "Needs Ordering" (triangle icon), "Recommended Order Value" (cart icon), "Active Backorders" (clock icon), "Open Tasks" (checkbox/checkSquare icon). **Dollar sign icon on Open Tasks is a known past bug — must show a checkbox.**

---

### ⚡ SMOKE-03 — Action Center data sections render
**Steps:**
1. Scroll through Action Center

**Expected:** "Attention Required" section is visible (either with rows or "No at-risk items" empty state). "Open Backorders" section visible. If excess items exist in data: "Overstock Actions" section visible. "Open Tasks" widget at bottom.

---

### ⚡ SMOKE-04 — Inventory Browser loads
**Steps:**
1. Click "Inventory Browser" in sidebar

**Expected:** Page loads showing a table with rows. SKU count shows in filter bar (e.g. "1,247 SKUs"). Status filter dropdown shows 6 status options.

---

### ⚡ SMOKE-05 — Inbound Pipeline chart has no month gaps
**Steps:**
1. Click "Inbound Pipeline" in sidebar
2. Observe the "Units by Estimated Arrival Month" bar chart

**Expected:** X-axis shows consecutive months (e.g. May 2026, Jun 2026, Jul 2026) with **no gaps**. A month with zero arrivals should display as a 0-height bar, not be absent.

---

### ⚡ SMOKE-06 — Executive Summary loads (admin only)
**Steps:**
1. Stay logged in as admin, click "Executive Summary" in sidebar (under C-Suite section)

**Expected:** Page loads. "Inventory Value Distribution ($)" pie chart renders. "Excess Value by Brand" bar chart renders. Title says "Top N" where N equals the actual number of excess brands visible.

---

### ⚡ SMOKE-07 — Tasks page loads
**Steps:**
1. Click "Tasks" in sidebar

**Expected:** Tasks page loads in list view. Group-by toggle (Status / Vendor / Category) visible. Board / List toggle visible. No error state.

---

### ⚡ SMOKE-08 — Create a single-SKU task
**Steps:**
1. On Tasks page, click "New Task"
2. Ensure "Single SKU" mode is selected
3. Enter title: "QA Smoke Test Task"
4. Select priority: High
5. Click "Create Task"

**Expected:** Modal closes. New task appears in the "To Do" section with correct title and High priority badge. No error toast.

---

### ⚡ SMOKE-09 — Create a vendor-order task from Action Center
**Steps:**
1. Navigate to Action Center
2. Click "Filters" in the Attention Required section
3. Select any vendor from the vendor dropdown
4. Click "Vendor Task" button

**Expected:** TaskModal opens in "Vendor Order" mode. Vendor name pre-filled. At-risk SKUs listed in the modal preview panel. Click Create Task → task appears in Open Tasks widget.

---

### ⚡ SMOKE-10 — Sign out and redirect
**Steps:**
1. Click "Sign out" at the bottom of the sidebar

**Expected:** Redirect to `/login`. Clicking browser Back does NOT return to the app — user stays on login page.

---

### ⚡ SMOKE-11 — Purchasing role login and access
**Steps:**
1. Log in as purchasing user

**Expected:** Redirect to `/purchasing/action-center`. Sidebar shows Purchasing and Work sections only. C-Suite section (Executive Summary, Departments) is NOT visible in the sidebar.

---

### ⚡ SMOKE-12 — C-Suite role login and access
**Steps:**
1. Log in as csuite user

**Expected:** Redirect to `/executive`. Sidebar shows C-Suite and Work sections. Purchasing section (Action Center, Inventory Browser, etc.) is NOT visible.

---

### ⚡ SMOKE-13 — Role access enforcement (purchasing → executive)
**Steps:**
1. Logged in as purchasing user
2. Manually type `/executive` in the URL bar and press Enter

**Expected:** Redirect to `/purchasing/action-center` (or home). Executive Summary does NOT load.

---

### ⚡ SMOKE-14 — Initial page load has no blank black screen
**Steps:**
1. Copy the app URL
2. Open a new browser tab
3. Paste URL and press Enter (direct navigation, not link click)

**Expected:** A loading spinner appears immediately (before React mounts). No blank dark screen visible for more than ~0.5 seconds. Content appears normally.

---

## 4. Full Regression Suite

---

### AUTH — Authentication & Access Control

---

#### AUTH-01 — Admin login redirects to Action Center ⚡ SMOKE-01
_(see SMOKE-01 above)_

---

#### AUTH-02 — Login with wrong password shows error
**Steps:**
1. Enter valid email, wrong password → click Sign In

**Expected:** Error message shown (e.g. "Invalid login credentials"). User stays on login page. No redirect.

---

#### AUTH-03 — Deactivated user is auto signed out
**Steps:**
1. Log in as the deactivated test account (account exists in auth but `is_active = false` in users table)

**Expected:** After auth resolves, user is automatically signed out and redirected to `/login`. No app content shown.

---

#### AUTH-04 — Admin role cannot be accessed by purchasing user ⚡ SMOKE-13
_(see SMOKE-13 above)_

---

#### AUTH-05 — Admin pages blocked for non-admin
**Steps:**
1. Log in as purchasing user
2. Navigate to `/admin/users`

**Expected:** Redirect away. Admin users page does NOT load.

---

#### AUTH-06 — C-Suite cannot access Purchasing pages
**Steps:**
1. Log in as csuite user
2. Navigate to `/purchasing/action-center`

**Expected:** Redirect to `/executive` or home.

---

#### AUTH-07 — Password reset flow
**Steps:**
1. Log in as admin → navigate to Admin → Users
2. Find a test user → click "Reset PW"
3. Check email for reset link
4. Click link → confirm `/reset-password` page loads

**Expected:** Reset password page renders. Entering a new password + confirming → success message or auto-redirect to login.

---

#### AUTH-08 — Invite new user flow
**Steps:**
1. Log in as admin → Admin → Users → "Invite User"
2. Fill in name, email, role, department → Submit
3. New user clicks the invite email link

**Expected:** Invite email received. Link opens `/reset-password?mode=invite`. Setting password logs the user in with correct role. New user row appears in Users page.

---

### AC — Action Center

---

#### AC-01 — KPI strip renders correctly ⚡ SMOKE-02
_(see SMOKE-02 above)_

#### AC-02 — Data sections render ⚡ SMOKE-03
_(see SMOKE-03 above)_

---

#### AC-03 — Sort Attention Required table
**Steps:**
1. Click "Days on Hand" column header
2. Click again

**Expected:** First click: ascending (↑ arrow). Second click: descending (↓ arrow). Rows reorder accordingly. Other column headers show the neutral sort icon.

---

#### AC-04 — Filter by vendor in Attention Required
**Steps:**
1. Click "Filters" in Attention Required section
2. Select a vendor from the vendor dropdown

**Expected:** Table rows filter to only show the selected vendor. Filter button shows a filled dot (●) indicator. "Vendor Task" button appears.

---

#### AC-05 — Filter by category in Attention Required
**Steps:**
1. With filters open, select a category from the category dropdown

**Expected:** Table filters to intersection of vendor + category. Row count decreases.

---

#### AC-06 — Snooze an at-risk item
**Steps:**
1. Click "Snooze" on any at-risk row
2. Select "7 days", add optional reason → click "Snooze 7d"

**Expected:** Modal closes. The snoozed row disappears from the table. A "1 snoozed" badge appears in the section header. "Show snoozed" button appears.

---

#### AC-07 — Show and restore snoozed item
**Steps:**
1. After AC-06, click "Show snoozed"

**Expected:** Snoozed row reappears with reduced opacity. Row shows "Restore" button instead of "Snooze". Click Restore → row returns to normal opacity with Snooze button, badge count decrements.

---

#### AC-08 — Create task from at-risk row
**Steps:**
1. Click "Task" on any at-risk row

**Expected:** TaskModal opens in Single SKU mode with title pre-filled ("Order: [description]") and SKU pre-filled. Submit → task appears in Open Tasks widget.

---

#### AC-09 — Overstock Actions section (if excess data available)
**Steps:**
1. Scroll to "Overstock Actions" section

**Expected:** Section shows "Open orders exist" sub-section (items with `on_order > 0`) with "Delay Order" + "Cancel Order" + "Snooze" buttons. "No inbound orders" sub-section (items with `on_order = 0`) with "Liquidation" + "Snooze" buttons.

---

#### AC-10 — Overstock action creates task with correct title
**Steps:**
1. Click "Delay Order" on an overstock row with on_order > 0

**Expected:** TaskModal opens with title pre-filled as "Delay Order: [description]". Task creates successfully.

---

#### AC-11 — Export at-risk items to CSV
**Steps:**
1. Click "Export" button in Attention Required section header

**Expected:** A CSV file downloads. Opening in Excel shows the at-risk items with correct columns (SKU, description, vendor, etc.).

---

#### AC-12 — Open Tasks widget shows correct count
**Steps:**
1. Observe "Open Tasks" KPI card value
2. Compare to the tasks listed in the Open Tasks widget at the bottom

**Expected:** KPI value matches the actual count of non-done, non-cancelled tasks. Widget shows up to 5. If more, "View all" link present.

---

### IB — Inventory Browser

---

#### IB-01 — Page loads with data ⚡ SMOKE-04
_(see SMOKE-04 above)_

---

#### IB-02 — Status filter
**Steps:**
1. Select "Excess stock" from the status dropdown

**Expected:** Table filters to only "Excess stock" rows. Row count in filter bar updates. Status badges in Status column all show "Excess stock".

---

#### IB-03 — Search by SKU code
**Steps:**
1. Type a known SKU code in the search box

**Expected:** Table filters to matching rows (SKU, description, brand, or vendor match). Row count updates. Clear the search → all rows return.

---

#### IB-04 — URL parameter pre-filters
**Steps:**
1. Navigate directly to `/purchasing/inventory?status=Excess+stock`

**Expected:** Status dropdown is pre-selected to "Excess stock". Table shows only excess rows on load.

---

#### IB-05 — URL parameter `?search=`
**Steps:**
1. Navigate to `/purchasing/inventory?search=TEST-SKU`

**Expected:** Search box is pre-filled with "TEST-SKU". Table filters accordingly.

---

#### IB-06 — Sort by column
**Steps:**
1. Click "On Hand Value" column header

**Expected:** Rows sort by on-hand value ascending. Click again → descending. Arrow icon reflects direction.

---

#### IB-07 — Avg Sales / Day column
**Steps:**
1. Observe the "Avg/Day" column

**Expected:** Values shown as decimals (e.g. "2.3"). These are computed as average_sales / 30. A SKU with `average_sales = 30` shows "1.0". Zero sales shows "0.0".

---

#### IB-08 — Export filtered data
**Steps:**
1. Apply a status filter (e.g. "At Risk")
2. Click "Export"

**Expected:** CSV downloads containing only the filtered rows. SKU count in file matches displayed count.

---

#### IB-09 — Pagination (if >100 rows)
**Steps:**
1. Ensure no filters are applied
2. Check if pagination controls appear at bottom

**Expected:** If total rows > 100, "Prev" / "Next" buttons appear. Clicking "Next" loads the next page. Page indicator shows "Page X of Y".

---

### IP — Inbound Pipeline

---

#### IP-01 — Page loads with KPI strip
**Steps:**
1. Navigate to Inbound Pipeline

**Expected:** 4 KPI cards: "SKUs On Order", "Units On Order", "Arriving ≤30d", "Arriving 31-90d". No spinner stuck.

---

#### IP-02 — Arrival month chart has no gaps ⚡ SMOKE-05
_(see SMOKE-05 above)_

---

#### IP-03 — Chart bar for empty month shows as 0
**Steps:**
1. Observe a month that has 0 arrivals on the chart

**Expected:** Bar is present (possibly as a 0-height bar with a visible x-axis label). Month is NOT skipped.

---

#### IP-04 — Arrival filter (0-30 days)
**Steps:**
1. Select "0-30 days" from the arrival dropdown

**Expected:** Table filters to only items with `lt_days <= 30`. KPI cards update to reflect filtered totals.

---

#### IP-05 — Multi-filter combination
**Steps:**
1. Select a brand + a vendor
2. Observe table

**Expected:** Only rows matching BOTH filters appear. "Clear filters" button appears. Clicking it resets all filters.

---

#### IP-06 — Sort by lead time
**Steps:**
1. Click "Lead Time" column header

**Expected:** Rows sort by `lt_days` ascending (shortest lead time first). Est. Arrival column values change accordingly.

---

#### IP-07 — Export filtered inbound
**Steps:**
1. Apply a vendor filter
2. Click "Export Excel"

**Expected:** File downloads. Row count matches the filtered table.

---

#### IP-08 — Pagination (if >100 rows)
**Steps:**
1. Remove all filters
2. Check for pagination controls

**Expected:** If items > 100, Prev/Next navigation works correctly.

---

### ES — Executive Summary

---

#### ES-01 — Page loads with KPI strip ⚡ SMOKE-06
_(partial — see SMOKE-06)_

---

#### ES-02 — Health bar proportions
**Steps:**
1. Observe the "Inventory Health — Value ($)" bar at the top
2. Compare the green (OK), blue (Excess), red (At Risk) segments to the legend values below

**Expected:** Bar segments are proportional to the dollar values shown. If Excess = $200k and total = $1M, Excess segment = ~20% of bar width.

---

#### ES-03 — Health bar segments are clickable
**Steps:**
1. Click the green "OK" segment of the health bar

**Expected:** Navigate to `/purchasing/inventory?status=Ok`. Inventory Browser loads pre-filtered to OK items.

---

#### ES-04 — Pie chart renders and segments are clickable
**Steps:**
1. Observe the "Inventory Value Distribution ($)" pie chart
2. Click a segment (e.g. "Excess")

**Expected:** Pie renders without errors. Clicking a segment navigates to Inventory Browser filtered by that status.

---

#### ES-05 — Brand chart shows all brands, no bars cut off ⚡ SMOKE-06 (partial)
**Steps:**
1. Observe "Excess Value by Brand" chart
2. Count visible bars
3. Compare to title (e.g. "Top 5")

**Expected:** Title says "Top N" where N matches the visible bar count. No bars are visually cut off at the bottom of the chart.

---

#### ES-06 — Brand chart bars are clickable
**Steps:**
1. Click a brand bar in the chart

**Expected:** Navigate to `/purchasing/inventory?status=Excess+stock&brand=[BrandName]`. Table pre-filtered.

---

#### ES-07 — Top Risk Items section
**Steps:**
1. Observe "Top Risk Items — Requires Attention" section

**Expected:** Shows up to 10 at-risk items, sorted by recommended order value (highest first). Each item shows: description, brand, SKU, on-hand, days OH, rec. order, order value.

---

#### ES-08 — Top Risk item is clickable
**Steps:**
1. Click any item in the Top Risk section

**Expected:** Navigate to `/purchasing/inventory?search=[product_code]`. Inventory Browser loads with that SKU in search.

---

#### ES-09 — Historical Trends (single upload)
**Steps:**
1. Check if only one upload exists in the system

**Expected:** "Historical Trends" section shows "Not enough data yet" card with explanation that 2+ uploads are needed.

---

#### ES-10 — Historical Trends (multiple uploads)
**Steps:**
1. Ensure 2+ completed uploads exist

**Expected:** 4 trend line/bar charts appear: Total Inventory Value, Fill Rate & At-Risk SKUs, Excess Inventory Value, Recommended Order Value. All charts show data points for each upload.

---

### DO — Department Overview

---

#### DO-01 — Page loads (admin or csuite)
**Steps:**
1. Click "Departments" in the C-Suite sidebar section

**Expected:** Page loads with department breakdown data. No error state.

---

#### DO-02 — Purchasing user cannot access
**Steps:**
1. Log in as purchasing, navigate to `/executive/departments`

**Expected:** Redirect away. Page does not load.

---

### TK — Tasks

---

#### TK-01 — Page loads in list view ⚡ SMOKE-07
_(see SMOKE-07 above)_

---

#### TK-02 — Create single-SKU task ⚡ SMOKE-08
_(see SMOKE-08 above)_

---

#### TK-03 — Create vendor order task ⚡ SMOKE-09
_(see SMOKE-09 above)_

---

#### TK-04 — Group by Status
**Steps:**
1. Ensure Group By is set to "Status" (default)

**Expected:** Tasks grouped under headers: "To Do", "In Progress", "Done". Cancelled shown only if cancelled tasks exist. Each header shows task count badge.

---

#### TK-05 — Group by Vendor
**Steps:**
1. Click "Vendor" in the Group By toggle

**Expected:** Tasks with description starting "Vendor: [Name]" are grouped under that vendor name. Tasks without a vendor prefix appear under "Other".

---

#### TK-06 — Group by Category
**Steps:**
1. Click "Category" in the Group By toggle

**Expected:** Tasks grouped by their `department` field. Tasks without a department go to "Other".

---

#### TK-07 — Board view
**Steps:**
1. Click "Board" toggle button

**Expected:** Kanban-style 4-column layout (To Do, In Progress, Done, Cancelled). Group By toggle is hidden in board mode.

---

#### TK-08 — Advance task status
**Steps:**
1. Find a "To Do" task
2. Click the circle icon on the left

**Expected:** Task status advances to "In Progress". Badge updates. If clicking "In Progress" task: advances to "Done" with strikethrough style on title.

---

#### TK-09 — Edit task opens modal with correct values
**Steps:**
1. Click the pencil icon on any task

**Expected:** Edit Task modal opens. Title, description, priority, due date, assignee, SKU, department all populated from saved values.

---

#### TK-10 — Edit task — Department/Category field
**Steps:**
1. Open edit modal for any task
2. Change Department dropdown to a different value
3. Click Save Changes

**Expected:** Modal closes. Task's department updates. If viewing in "Category" group mode, task moves to the new group.

---

#### TK-11 — Edit task with vendor prefix — Vendor field
**Steps:**
1. Open edit modal for a task whose description starts with "Vendor: [Name]"

**Expected:** A "Vendor" input field appears above the description. Current vendor name pre-filled. Changing the vendor name + saving → description's first line updates accordingly.

---

#### TK-12 — Delete task (creator)
**Steps:**
1. Find a task you created
2. Click the trash icon

**Expected:** Task removed immediately. No confirmation dialog. Row gone from list.

---

#### TK-13 — Admin department filter
**Steps:**
1. Log in as admin → navigate to Tasks
2. Use the "All departments" dropdown to select a specific department

**Expected:** Only tasks from that department shown. Selecting "All departments" restores full list.

---

### VV — Vendor View

---

#### VV-01 — Page loads with vendor list
**Steps:**
1. Click "Vendor View" in sidebar

**Expected:** Table loads showing vendors with columns: vendor name, SKU count per status, recommended order qty, etc. No error state.

---

#### VV-02 — Sort and filter
**Steps:**
1. Click a column header to sort
2. Use search to filter by vendor name

**Expected:** Sort arrows appear and rows reorder. Search filters rows to matching vendors.

---

### ADM — Admin — Users

---

#### ADM-01 — User list loads
**Steps:**
1. Log in as admin → Admin → Users

**Expected:** Table of users loads. Columns: name, email, role, department, status (active/inactive), actions.

---

#### ADM-02 — Deactivate a test user
**Steps:**
1. Find a test user (not yourself)
2. Click "Deactivate"

**Expected:** Row updates to show "Inactive". User is effectively locked out (verify by attempting login as that user — should be auto-signed out).

---

#### ADM-03 — Cannot deactivate yourself
**Steps:**
1. Find your own row in the Users table

**Expected:** No deactivate button on your own row, or deactivate is disabled/greyed out.

---

#### ADM-04 — Invite user (see AUTH-08)
---

#### ADM-05 — Reset password (see AUTH-07)
---

### UP — Admin — Uploads

---

#### UP-01 — Upload valid CSV
**Steps:**
1. Admin → Uploads → Upload new file
2. Select a valid inventory CSV file
3. Submit

**Expected:** New row appears in the upload history table with status "processing", then transitions to "complete". `row_count` shows correct number of records.

---

#### UP-02 — Upload invalid CSV shows failure
**Steps:**
1. Upload a badly formatted or wrong-type file

**Expected:** Upload row shows status "failed". Existing inventory data unchanged.

---

#### UP-03 — Download previous upload as CSV
**Steps:**
1. Find any completed upload in the history
2. Click the download icon

**Expected:** CSV file downloads. Row count matches the `row_count` shown in the table. Opening in Excel shows inventory columns with data.

---

#### UP-04 — Data freshness bar updates
**Steps:**
1. After a successful upload (UP-01), navigate to any page showing the data freshness bar

**Expected:** Bar shows "Data is fresh" or similar. Timestamp reflects the new upload date/time.

---

## 5. Known Limitations & Notes

| Topic | Note |
|---|---|
| Overstock section | Only appears if the current CSV upload contains `Excess stock` or `Surplus orders` items. If the section is absent, verify via Inventory Browser that such items exist. |
| Snooze persistence | Snoozed items return automatically after the snooze period expires. Permanent snoozes require manual restore. |
| Task timestamps | `created_at` and `updated_at` are set on create/update. If a task insert fails with a NOT NULL error, the fix is in `useTasks.ts` (already applied). |
| DB migration | The `dismissed_actions.action_type` check constraint must include `'overstock'` for the snooze feature on overstock items to work. Run `002_dismissed_actions.sql` in Supabase SQL Editor if not already done. |
| June 2026 / month gaps | Fixed in this release. If a month appears blank instead of as a 0-height bar, verify the `byMonth` fill logic in `InboundPipeline.tsx`. |
| Brand chart height | Now dynamic. If bars still appear cut off after this fix, increase the multiplier in `Math.max(200, brandExcess.length * 36)`. |
| Chrome extension errors | `A listener indicated an asynchronous response...` console errors are Chrome extension noise, not app bugs. Safe to ignore. |

---

## 6. Regression Sign-Off Checklist

Complete before marking a release as production-ready:

- [ ] All ⚡ Smoke tests pass (SMOKE-01 through SMOKE-14)
- [ ] AUTH-01 through AUTH-08 pass
- [ ] AC-01 through AC-12 pass  
- [ ] IB-01 through IB-09 pass
- [ ] IP-01 through IP-08 pass
- [ ] ES-01 through ES-10 pass
- [ ] TK-01 through TK-13 pass
- [ ] ADM-01 through ADM-05 pass
- [ ] UP-01 through UP-04 pass
- [ ] No console errors (excluding Chrome extension noise)
- [ ] No TypeScript errors (`cd app && npx tsc --noEmit`)
- [ ] Automated unit tests pass (`cd app && npm test`)
- [ ] Tested on Chrome and Edge (minimum)

**Tester:** ________________  **Date:** ________________  **Build/commit:** ________________

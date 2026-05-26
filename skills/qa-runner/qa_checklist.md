# QA Checklist — Sanders Intelligence

Print this or paste into a PR description. Tick each row as you go.

## Pre-flight

- [ ] Dev server reachable at http://localhost:5173/
- [ ] Logged in (autofill or user-typed) — sidebar footer shows the right name + role
- [ ] Data freshness banner is visible and shows BOTH upload date and mySQL pull timestamp

## Routes — load + first-glance sanity

### /purchasing/action-center
- [ ] All 4 KPI cards populated (Needs Ordering / Rec. Order Value / Active Backorders / Open Tasks)
- [ ] "Attention Required" table grouped by vendor + category
- [ ] Each row has Snooze and + Task buttons
- [ ] "Open Backorders" section appears below
- [ ] No console errors

### /purchasing/inventory
- [ ] KPI strip (Total SKUs / Total On-Hand / Inventory Value / Fill Rate)
- [ ] Search + status + class + velocity filters all render
- [ ] Table shows SKU, Description, Brand, On Hand, Days OH, Status, Rec. Order, Avg/Mo, Avg/Day, On Order, Backorders, Cost, Sell Price, COGS %, Profit Today, Profit 7d, Profit 30d
- [ ] Pagination footer shows "Page 1 of N · M results"
- [ ] Export to Excel button visible top-right

### /purchasing/inbound
- [ ] 4 KPI cards (SKUs On Order / Units On Order / Arriving ≤30d / Arriving 31-90d)
- [ ] "Units by Estimated Arrival Month" bar chart
- [ ] **REGRESSION**: x-axis should include every month in the range — no missing months even when units are zero (was 1214683866413708)
- [ ] Search + brand + vendor + status + arrival filters render
- [ ] Table shows On Order, Lead Time, Est. Arrival, Days OH, profit columns, Status

### /purchasing/vendors
- [ ] 5 KPI cards (Total Vendors / Vendors w/ At-Risk / Total Rec. Order Qty / Total Rec. Order Value / Total Profit (30D))
- [ ] Table has "Total Profit (30D)" column on the right
- [ ] Sort works on Total Profit column; nulls go to the bottom
- [ ] Clicking a vendor row expands to show the per-SKU detail with window metrics
- [ ] Pagination across 50+ vendors

### /executive
- [ ] Inventory Health bar with OK / Excess / At Risk segments
- [ ] **REGRESSION**: Excess value on the bar reconciles with the Excess Value KPI card below (was 1215143640254108 if still open)
- [ ] 5 KPI cards (Inventory Value / Fill Rate / SKUs At Risk / Excess Value / Backorder Value)
- [ ] Inventory Value Distribution pie chart (3 segments)
- [ ] **REGRESSION**: Excess Value by Brand bar chart shows top 8 brands, not 5 (was 1214683866413706)
- [ ] Top Risk Supplier — Requires Attention list with per-vendor breakdowns (OK / At Risk / Excess / Backordered + Avg Selling Price / Avg Profit / Margin / COGS)
- [ ] Pie + bar charts are clickable and drill into filtered views

### /executive/departments
- [ ] Phase 3 placeholder card
- [ ] "Currently active departments: Purchasing" link

### /tasks
- [ ] Status / Vendor / Category grouping toggles
- [ ] Board view toggle
- [ ] All departments filter
- [ ] New Task button
- [ ] Empty state ("No tasks") if there really are none

### /admin/users
- [ ] User list with Role badge, Department, Status (Active / Inactive), Joined date
- [ ] Edit / Reset PW / Deactivate or Activate buttons per row
- [ ] Invite User button top-right

### /admin/uploads
- [ ] Drop zone for fullreport.csv
- [ ] Upload History table — latest row should be today
- [ ] CSV download per row
- [ ] Status column shows Complete / Processing / Failed

## Cross-cutting

- [ ] Sidebar collapse/expand button works (top of sidebar)
- [ ] Sign Out button at the bottom of the sidebar logs out cleanly
- [ ] F5 reload on the Inventory Browser does not freeze the renderer for >20s (was 1215143557131647 if still open)
- [ ] Navigating between routes does not leave a blank black screen for >3s (was 1214683866413710 — should be fixed)

## After the walk

- [ ] Console clean across all routes (or only known LaunchDarkly-style harmless infos)
- [ ] All bugs filed in Asana with repro steps and likely cause
- [ ] All coverage gaps filed as FEATURE tickets
- [ ] Any sprint-candidate tasks that turned out to be done are closed with file:line evidence

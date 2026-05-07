@echo off
cd /d "D:\Sanders Intelligence"
echo === Staging all changes ===
git add .
echo.
echo === Committing ===
git commit -m "feat: vendor view, action center sorting/filters, trend charts, vendor-grouped tasks, excel export, QA fixes

- Add Vendor View page (/purchasing/vendors): group inventory by supplier,
  sortable/filterable table, expandable SKU rows, vendor task creation
- Action Center: sortable columns (all numeric fields), vendor + category
  filter bars, vendor-level task button, at-risk CSV export
- Task creation: Single SKU / Vendor Order mode; vendor order auto-fills
  title + embeds full at-risk SKU list in task description
- Executive Summary: replace trend placeholder with 4 live charts
  (inventory value, fill rate + at-risk, excess value, rec. order value
  over time across uploads)
- Export to Excel: Download button on Inventory Browser + Action Center
  (CSV format, opens natively in Excel)
- InventoryBrowser: add vendor URL param + vendor filter dropdown;
  sync filters from URL on navigation
- QA: fix Inbound Pipeline month sort (cross-browser safe); add error
  states to Action Center, Inventory Browser, Executive Summary;
  responsive KPI grids (grid-cols-2 md:grid-cols-4/5)"
echo.
echo === Pushing to main ===
git push origin main
echo.
echo === Done ===
pause

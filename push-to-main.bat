@echo off
cd /d "D:\Sanders Intelligence"
echo === Staging all changes ===
git add .
echo.
echo === Committing ===
git commit -m "feat: task grouping, overstock actions, task modal dept+vendor editing

- Tasks page: Group By toggle (Status / Vendor / Category); vendor
  parsed from 'Vendor: XXX' description prefix; non-vendor tasks
  bucket into 'Other'; error state added; TaskCard moved out of
  component to fix React remount anti-pattern
- Action Center: Overstock Suggested Actions section — excess + surplus
  items split by on_order status: on_order>0 shows Delay Order + Cancel
  Order buttons; on_order=0 shows Liquidation Campaign button; same
  snooze/restore mechanism as at-risk rows (action_type=overstock);
  vendor + category filters; sort by excess_value
- TaskModal: add Department/Category dropdown (create + edit); in edit
  mode, expose 'Vendor: XXX' prefix as editable field that stays in
  sync with description; assignee list respects selected department
- useTasks: add updated_at + created_at to task insert to prevent
  NOT NULL constraint errors
- useDismissedActions: expand action_type union to include 'overstock'
- useInventory: add useExcessItems() derived hook"
echo.
echo === Pushing to main ===
git push origin main
echo.
echo === Done ===
pause

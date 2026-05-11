@echo off
cd /d "D:\Sanders Intelligence"
echo === Staging all changes ===
git add .
echo.
echo === Committing ===
git commit -m "fix: black screen, icon, brand chart, June gap + full sprint 2

Bugs fixed today:
- index.html: inline splash spinner before React mounts — eliminates
  blank black screen on initial/direct navigation (bg #0f1117, CSS ring)
- ActionCenter: Open Tasks KPI card icon DollarSign → CheckSquare
- ExecutiveSummary: Excess Value by Brand height now dynamic
  Math.max(200, n*36) so all bars are visible; title shows actual count
- InboundPipeline: byMonth fills every calendar month in the range so
  June 2026 (or any gap month) always appears with units=0

Sprint 2 (first push — all previously committed locally):
- Tasks page: Group By toggle (Status / Vendor / Category)
- Action Center: Overstock Suggested Actions section (Delay/Cancel/Liquidation)
- TaskModal: Department/Category + Vendor editing in edit mode
- AuthContext: profileStatus, profileError, timeout handling, signOut fix
- Sidebar: explicit navigate to /login after sign out
- useTasks: created_at + updated_at on insert
- useDismissedActions: expand action_type to include overstock
- useInventory: useExcessItems + useInventoryAnalysis hooks"
echo.
echo === Pushing to main ===
git push origin main
echo.
echo === Done ===
pause

@echo off
cd /d "D:\Sanders Intelligence"
git add app/src/lib/supabase.ts app/src/App.tsx app/src/contexts/AuthContext.tsx app/src/pages/ResetPassword.tsx app/src/hooks/useInventory.ts
git commit -m "fix: capture URL auth type before Supabase clears hash — invite flow now works"
git push
echo.
echo Done! Check Vercel for the new deployment.
pause

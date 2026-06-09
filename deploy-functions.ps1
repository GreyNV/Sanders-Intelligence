# Sanders Intelligence — Deploy Edge Functions + Push to Vercel
# Run this script from D:\Sanders Intelligence
# Double-click or right-click → "Run with PowerShell"

Set-Location "D:\Sanders Intelligence"

Write-Host ""
Write-Host "=== Step 1: Deploy Edge Functions to Supabase ===" -ForegroundColor Cyan

# Check for supabase CLI
$supabaseCli = Get-Command supabase -ErrorAction SilentlyContinue
if (-not $supabaseCli) {
    Write-Host "Installing Supabase CLI via npm..." -ForegroundColor Yellow
    npm install -g supabase
}

$PROJECT_REF = "ohtgykzyahvgxvdpoejb"

Write-Host "Deploying sync-purchase-orders..." -ForegroundColor White
supabase functions deploy sync-purchase-orders --project-ref $PROJECT_REF --no-verify-jwt
if ($LASTEXITCODE -ne 0) {
    Write-Host "Note: If you get an auth error, run: supabase login" -ForegroundColor Yellow
}

Write-Host "Deploying refresh-news..." -ForegroundColor White
supabase functions deploy refresh-news --project-ref $PROJECT_REF --no-verify-jwt

Write-Host ""
Write-Host "=== Step 2: Git commit + push → Vercel deploy ===" -ForegroundColor Cyan

git add -A
git status

Write-Host ""
$commitMsg = "feat: purchase orders interface with SellerCloud sync and logistics news feed"
git commit -m $commitMsg
git push

Write-Host ""
Write-Host "=== Done! ===" -ForegroundColor Green
Write-Host "Vercel will auto-deploy from the push. Watch: https://vercel.com/dashboard" -ForegroundColor White
Write-Host ""
Read-Host "Press Enter to close"

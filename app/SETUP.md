# Sanders Intelligence — Setup Guide

## Prerequisites
- Node.js 18+
- A Supabase account (free at supabase.com)
- A Vercel account (free at vercel.com) — for production deployment
- Git (optional but recommended)

---

## Step 1 — Supabase Project

1. Go to [supabase.com](https://supabase.com) → New project
2. Choose a name (e.g. `sanders-intelligence`), set a strong DB password, pick a region
3. Wait ~2 minutes for the project to provision

**Disable public sign-ups** (important — only admins invite users):  
Settings → Auth → Email → **Enable Sign Ups: OFF**

---

## Step 2 — Run the Database Schema

1. In your Supabase project: **SQL Editor → New Query**
2. Paste the entire contents of `supabase/migrations/001_initial_schema.sql`
3. Click **Run**

---

## Step 3 — Create Your First Admin User

1. Supabase Dashboard → **Authentication → Users → Add user → Create new user**
2. Enter your email and a temporary password
3. Then run this in SQL Editor to give yourself admin role:
   ```sql
   UPDATE public.users SET role = 'admin', name = 'Your Name' WHERE email = 'your@email.com';
   ```

---

## Step 4 — Deploy the Edge Functions

Install the Supabase CLI if you haven't:
```bash
npm install -g supabase
supabase login
```

Link to your project:
```bash
supabase link --project-ref YOUR_PROJECT_REF
```
(Project ref is in: Supabase Dashboard → Settings → General)

Deploy both functions:
```bash
supabase functions deploy upload-csv
supabase functions deploy invite-user
```

Set the service role secret (used by both functions):
```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```
Find the service role key in: **Supabase Dashboard → Settings → API → service_role (secret)**

---

## Step 5 — Local Development

```bash
cd app
npm install

# Create your env file
cp .env.example .env
```

Fill in `.env` with your Supabase credentials  
(Dashboard → Settings → API):
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

Start the dev server:
```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) and sign in with your admin credentials.

---

## Step 6 — First Upload

1. Sign in as admin
2. Go to **Admin → Uploads**
3. Drag and drop `fullreport.csv`
4. Wait for the green confirmation — dashboards are now live

---

## Step 7 — Deploy to Vercel (Production)

1. Push your code to a GitHub repo
2. Go to [vercel.com](https://vercel.com) → New Project → Import from GitHub
3. Set environment variables in Vercel project settings:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy — Vercel auto-builds on every push to main

---

## Adding Users (after initial setup)

1. Sign in as admin
2. Go to **Admin → Users → Invite User**
3. Enter name, email, role, department
4. The user receives an invite email with a link to set their password

---

## Daily Workflow (Purchasing)

1. Download `fullreport.csv` from Netstock each morning
2. Go to **Admin → Uploads**, upload the file
3. All dashboards refresh immediately
4. If not uploaded, all users see the **Outdated** warning banner

---

## Troubleshooting

**"Missing Supabase env vars" error on startup:**  
Make sure `.env` exists and has both `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

**Upload fails with "Insert failed":**  
Check the CSV column headers match what's in the Edge Function. The headers must match exactly (case-insensitive).

**User can't log in:**  
Confirm the user row exists in `public.users` with `is_active = true`. Check Supabase → Auth → Users that their account is confirmed.

**Edge function returns 401:**  
Make sure the `Authorization: Bearer <token>` header is being sent. Check that the Supabase anon key is correct.

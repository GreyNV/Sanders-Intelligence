-- ═══════════════════════════════════════════════════════════════════════
-- Sanders Intelligence — Initial Schema
-- Run this in: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════════════

-- ─── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── USERS ───────────────────────────────────────────────────────────────────
-- Extends auth.users with role, department, display name, active flag.
CREATE TABLE IF NOT EXISTS public.users (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'purchasing'
                CHECK (role IN ('admin', 'purchasing', 'csuite')),
  department  TEXT,          -- 'purchasing' | 'warehouse' | 'marketing' | 'operations' | etc.
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger: auto-create a users row when a new auth user is invited/created.
-- Admin must update name/role/department after creation.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.users (id, email, name, role, department)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'purchasing'),
    NEW.raw_user_meta_data->>'department'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── UPLOADS ─────────────────────────────────────────────────────────────────
-- Append-only log of every CSV upload. Never delete rows.
CREATE TABLE IF NOT EXISTS public.uploads (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  filename     TEXT NOT NULL,
  row_count    INTEGER,
  status       TEXT NOT NULL DEFAULT 'processing'
                 CHECK (status IN ('processing', 'complete', 'failed')),
  notes        TEXT
);

CREATE INDEX IF NOT EXISTS uploads_uploaded_at_idx ON public.uploads (uploaded_at DESC);
CREATE INDEX IF NOT EXISTS uploads_status_idx      ON public.uploads (status);

-- ─── INVENTORY RECORDS ───────────────────────────────────────────────────────
-- One row per SKU per upload. Query latest upload for current state.
CREATE TABLE IF NOT EXISTS public.inventory_records (
  id                                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id                           UUID NOT NULL REFERENCES public.uploads(id) ON DELETE CASCADE,
  warehouse                           TEXT,
  product_code                        TEXT NOT NULL,
  description                         TEXT,
  supplier_code                       TEXT,
  supplier_description                TEXT,
  brand_code                          TEXT,
  brand_name                          TEXT,
  category_code                       TEXT,
  category_name                       TEXT,
  on_hand                             INTEGER DEFAULT 0,
  days_on_hand                        INTEGER DEFAULT 0,
  cost_price                          NUMERIC(12,4) DEFAULT 0,
  on_hand_value                       NUMERIC(14,4) DEFAULT 0,
  classification                      TEXT,   -- A | B | C | X | S
  velocity                            TEXT,   -- H | M | L | X
  status                              TEXT,   -- Ok | Excess stock | Potential s/o
  status_units                        INTEGER DEFAULT 0,
  status_value                        NUMERIC(14,2) DEFAULT 0,
  excess_units                        INTEGER DEFAULT 0,
  excess_value                        NUMERIC(14,2) DEFAULT 0,
  recommended_order                   INTEGER DEFAULT 0,
  recommended_order_value             NUMERIC(14,2) DEFAULT 0,
  recommended_order_days              INTEGER DEFAULT 0,
  age                                 INTEGER DEFAULT 0,
  average_sales                       NUMERIC(12,4) DEFAULT 0,
  average_forecasted_sales            NUMERIC(12,4) DEFAULT 0,
  lt_days                             INTEGER DEFAULT 0,
  on_order                            INTEGER DEFAULT 0,
  back_orders                         INTEGER DEFAULT 0,
  total_customer_orders               INTEGER DEFAULT 0,
  unsatisfied_customer_orders_units   INTEGER DEFAULT 0,
  unsatisfied_customer_orders_value   NUMERIC(14,2) DEFAULT 0,
  moq                                 INTEGER DEFAULT 1,
  order_multiples                     INTEGER DEFAULT 1,
  selling_price                       NUMERIC(12,4) DEFAULT 0
);

CREATE INDEX IF NOT EXISTS inv_upload_id_idx    ON public.inventory_records (upload_id);
CREATE INDEX IF NOT EXISTS inv_product_code_idx ON public.inventory_records (product_code);
CREATE INDEX IF NOT EXISTS inv_status_idx       ON public.inventory_records (status);
CREATE INDEX IF NOT EXISTS inv_brand_idx        ON public.inventory_records (brand_name);
CREATE INDEX IF NOT EXISTS inv_supplier_idx     ON public.inventory_records (supplier_code);

-- ─── TASKS ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  description  TEXT,
  status       TEXT NOT NULL DEFAULT 'todo'
                 CHECK (status IN ('todo', 'in_progress', 'done', 'cancelled')),
  priority     TEXT NOT NULL DEFAULT 'medium'
                 CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  due_date     DATE,
  department   TEXT NOT NULL,       -- scopes task to a department
  assigned_to  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_by   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sku_code     TEXT,                -- optional link to inventory_records.product_code
  source       TEXT NOT NULL DEFAULT 'manual'
                 CHECK (source IN ('manual', 'auto'))  -- 'auto' for Phase 2
);

CREATE INDEX IF NOT EXISTS tasks_dept_idx       ON public.tasks (department);
CREATE INDEX IF NOT EXISTS tasks_status_idx     ON public.tasks (status);
CREATE INDEX IF NOT EXISTS tasks_assigned_idx   ON public.tasks (assigned_to);
CREATE INDEX IF NOT EXISTS tasks_sku_idx        ON public.tasks (sku_code);

-- Auto-update updated_at on any task update
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_touch_updated_at ON public.tasks;
CREATE TRIGGER tasks_touch_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- ═══════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════

-- Helper: get the current user's role from public.users
CREATE OR REPLACE FUNCTION public.my_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM public.users WHERE id = auth.uid()
$$;

-- Helper: get the current user's department
CREATE OR REPLACE FUNCTION public.my_department()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT department FROM public.users WHERE id = auth.uid()
$$;

-- ─── users RLS ───────────────────────────────────────────────────────────────
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read all user rows (needed for assignee lookups)
CREATE POLICY "users_select_all_authenticated"
  ON public.users FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can insert/update/delete user rows (Edge Function uses service role)
CREATE POLICY "users_admin_all"
  ON public.users FOR ALL
  TO authenticated
  USING (public.my_role() = 'admin')
  WITH CHECK (public.my_role() = 'admin');

-- Users can update their own name
CREATE POLICY "users_update_own"
  ON public.users FOR UPDATE
  TO authenticated
  USING (id = auth.uid());

-- ─── uploads RLS ─────────────────────────────────────────────────────────────
ALTER TABLE public.uploads ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read uploads (needed for freshness check)
CREATE POLICY "uploads_select_authenticated"
  ON public.uploads FOR SELECT
  TO authenticated
  USING (true);

-- Admins and purchasing users can insert uploads (actual insert is done by Edge Function)
-- Edge Function uses service role so bypasses RLS, but this policy covers direct inserts if needed
CREATE POLICY "uploads_insert_admin_purchasing"
  ON public.uploads FOR INSERT
  TO authenticated
  WITH CHECK (public.my_role() IN ('admin', 'purchasing'));

-- ─── inventory_records RLS ───────────────────────────────────────────────────
ALTER TABLE public.inventory_records ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read inventory
CREATE POLICY "inventory_select_authenticated"
  ON public.inventory_records FOR SELECT
  TO authenticated
  USING (true);

-- Only service role (Edge Function) inserts records — no client-side INSERT policy needed

-- ─── tasks RLS ───────────────────────────────────────────────────────────────
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Purchasing users see only their department's tasks
-- Admin and csuite see all tasks
CREATE POLICY "tasks_select"
  ON public.tasks FOR SELECT
  TO authenticated
  USING (
    public.my_role() IN ('admin', 'csuite')
    OR department = public.my_department()
  );

-- Any authenticated user can create tasks (scoped to their department by app logic)
CREATE POLICY "tasks_insert"
  ON public.tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    public.my_role() IN ('admin', 'csuite')
    OR department = public.my_department()
  );

-- Users can update tasks they created or are assigned to; admins and csuite can update any
CREATE POLICY "tasks_update"
  ON public.tasks FOR UPDATE
  TO authenticated
  USING (
    public.my_role() IN ('admin', 'csuite')
    OR created_by = auth.uid()
    OR assigned_to = auth.uid()
  );

-- Only the creator or an admin can delete tasks
CREATE POLICY "tasks_delete"
  ON public.tasks FOR DELETE
  TO authenticated
  USING (
    public.my_role() = 'admin'
    OR created_by = auth.uid()
  );


-- ═══════════════════════════════════════════════════════════════════════
-- SEED: First admin user
-- ═══════════════════════════════════════════════════════════════════════
-- After creating your first user via Supabase Auth Dashboard or the invite
-- Edge Function, run this to make them an admin:
--
-- UPDATE public.users SET role = 'admin' WHERE email = 'your-email@company.com';

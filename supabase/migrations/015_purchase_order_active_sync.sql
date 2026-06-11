-- Active-only SellerCloud PO sync support.

alter table public.purchase_orders
  add column if not exists vendor_name text,
  add column if not exists po_status_code integer,
  add column if not exists payment_status_code integer,
  add column if not exists shipping_status_code integer,
  add column if not exists receiving_status_code integer,
  add column if not exists is_active boolean not null default false,
  add column if not exists shipped_on timestamptz,
  add column if not exists cancelled_po_id integer;

alter table public.po_items
  add column if not exists qty_units_received integer,
  add column if not exists qty_units_open integer,
  add column if not exists receiving_status text,
  add column if not exists receiving_status_code integer;

alter table public.sync_state
  add column if not exists state jsonb,
  add column if not exists last_error text;

create index if not exists idx_purchase_orders_is_active
  on public.purchase_orders(is_active, updated_on desc nulls last);

create index if not exists idx_purchase_orders_status_codes
  on public.purchase_orders(po_status_code, shipping_status_code, receiving_status_code);

create index if not exists idx_po_items_qty_open
  on public.po_items(qty_units_open)
  where qty_units_open > 0;

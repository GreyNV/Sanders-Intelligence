-- North Star admin-management adjustments.

alter table public.monthly_star
  add column if not exists dragging_channel_notes text;

alter table public.north_star_rows
  add column if not exists plan_value text,
  add column if not exists actual_mtd text,
  add column if not exists forecast text;

alter table public.north_star_rows
  drop constraint if exists north_star_rows_slot_index_check;

alter table public.north_star_rows
  add constraint north_star_rows_slot_index_check check (slot_index between 1 and 50);

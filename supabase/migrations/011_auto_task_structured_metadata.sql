-- Migration 011: Structured metadata for auto-created tasks.
-- Run after 010_auto_task_default_assignee_admin.sql.

alter table public.tasks
  add column if not exists rule_id text,
  add column if not exists vendor_supplier_code text,
  add column if not exists vendor_name text,
  add column if not exists affected_skus text[],
  add column if not exists upload_id uuid references public.uploads(id);

create index if not exists tasks_auto_rule_vendor_idx
  on public.tasks (rule_id, vendor_supplier_code, created_at desc)
  where source = 'auto';

update public.tasks
set rule_id = event.rule_id,
    vendor_supplier_code = event.vendor_code,
    vendor_name = event.vendor_name,
    affected_skus = event.affected_skus,
    upload_id = event.upload_id,
    updated_at = now()
from public.auto_task_events event
where tasks.id = event.task_id
  and event.outcome = 'created'
  and tasks.source = 'auto'
  and (
    tasks.rule_id is null
    or tasks.vendor_supplier_code is null
    or tasks.affected_skus is null
    or tasks.upload_id is null
  );

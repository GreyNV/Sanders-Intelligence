-- Migration 009: Prevent auto-task generation failures from blocking uploads.
-- Run after 008_task_activity_events.sql.

create or replace function public.run_auto_tasks_on_upload_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if tg_op = 'INSERT' then
      if new.status = 'complete' then
        perform public.generate_auto_tasks_for_upload(new.id);
      end if;
    elsif new.status = 'complete' and old.status is distinct from 'complete' then
      perform public.generate_auto_tasks_for_upload(new.id);
    end if;
  exception when others then
    raise warning 'Auto-task generation failed for upload %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

revoke all on function public.run_auto_tasks_on_upload_completion() from public;
revoke all on function public.run_auto_tasks_on_upload_completion() from anon;
revoke all on function public.run_auto_tasks_on_upload_completion() from authenticated;

with stuck_uploads as (
  select
    upload.id,
    count(record.id)::integer as record_count
  from public.uploads upload
  join public.inventory_records record
    on record.upload_id = upload.id
  where upload.status = 'processing'
    and upload.uploaded_at < now() - interval '15 minutes'
  group by upload.id
)
update public.uploads upload
set status = 'complete',
    row_count = stuck_uploads.record_count,
    notes = null
from stuck_uploads
where upload.id = stuck_uploads.id;

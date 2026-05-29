-- Migration 009: Harden auto-task default assignee config and admin controls.
-- Run after 008_task_activity_events.sql.

alter table public.automation_config
  add column if not exists default_assignee_user_id uuid references public.users(id);

update public.automation_config
set default_assignee_user_id = users.id,
    updated_at = now()
from public.users
where automation_config.key = 'auto_tasks'
  and lower(users.email) = 'mordechai@sanderscollection.com'
  and users.is_active = true
  and automation_config.default_assignee_user_id is null;

update public.tasks
set assigned_to = automation_config.default_assignee_user_id,
    updated_at = now()
from public.automation_config
join public.users assignee
  on assignee.id = automation_config.default_assignee_user_id
 and assignee.is_active = true
where automation_config.key = 'auto_tasks'
  and tasks.source = 'auto'
  and tasks.assigned_to is null;

create or replace function public.get_automation_config()
returns table (
  key text,
  enabled boolean,
  system_user_id uuid,
  default_assignee_user_id uuid,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    automation_config.key,
    automation_config.enabled,
    automation_config.system_user_id,
    automation_config.default_assignee_user_id,
    automation_config.updated_at
  from public.automation_config
  where automation_config.key = 'auto_tasks'
    and public.my_role() = 'admin';
$$;

create or replace function public.set_default_auto_assignee(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.my_role() <> 'admin' then
    raise exception 'Only admins can change automation settings';
  end if;

  if p_user_id is not null and not exists (
    select 1
    from public.users
    where id = p_user_id
      and is_active = true
  ) then
    raise exception 'Default auto assignee must be an active user';
  end if;

  update public.automation_config
  set default_assignee_user_id = p_user_id,
      updated_at = now()
  where key = 'auto_tasks';
end;
$$;

grant execute on function public.get_automation_config() to authenticated;
grant execute on function public.set_default_auto_assignee(uuid) to authenticated;

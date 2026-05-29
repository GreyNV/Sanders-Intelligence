-- Migration 007: Task workflow comments, postponement, and auto-task default assignee.
-- Run after 006_auto_task_gating.sql.

alter table public.tasks
  add column if not exists postponed_until date;

alter table public.tasks
  drop constraint if exists tasks_status_check;

alter table public.tasks
  add constraint tasks_status_check
  check (status in ('todo', 'in_progress', 'done', 'cancelled', 'postponed'));

create index if not exists tasks_postponed_until_idx
  on public.tasks (postponed_until)
  where status = 'postponed';

create table if not exists public.task_comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks(id) on delete cascade,
  author_id  uuid not null references public.users(id) on delete cascade,
  body       text not null check (length(trim(body)) > 0),
  kind       text not null default 'comment' check (kind in ('comment', 'cancel', 'postpone')),
  created_at timestamptz not null default now()
);

create index if not exists task_comments_task_created_idx
  on public.task_comments (task_id, created_at);

alter table public.task_comments enable row level security;

create policy "task_comments_select"
  on public.task_comments for select
  to authenticated using (
    exists (
      select 1
      from public.tasks task
      where task.id = task_comments.task_id
        and (
          public.my_role() in ('admin', 'csuite')
          or task.department = public.my_department()
        )
    )
  );

create policy "task_comments_insert_own"
  on public.task_comments for insert
  to authenticated with check (author_id = auth.uid());

create policy "task_comments_update_author_or_admin"
  on public.task_comments for update
  to authenticated using (
    author_id = auth.uid()
    or public.my_role() = 'admin'
  );

create policy "task_comments_delete_author_or_admin"
  on public.task_comments for delete
  to authenticated using (
    author_id = auth.uid()
    or public.my_role() = 'admin'
  );

create or replace function public.reactivate_expired_postponed_tasks()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_count integer;
begin
  update public.tasks
  set status = 'todo',
      postponed_until = null,
      updated_at = now()
  where status = 'postponed'
    and postponed_until <= current_date
    and (
      public.my_role() in ('admin', 'csuite')
      or department = public.my_department()
      or assigned_to = auth.uid()
      or created_by = auth.uid()
    );

  get diagnostics changed_count = row_count;
  return changed_count;
end;
$$;

grant execute on function public.reactivate_expired_postponed_tasks() to authenticated;

alter table public.automation_config
  add column if not exists default_assignee_user_id uuid references public.users(id);

update public.automation_config
set default_assignee_user_id = users.id,
    updated_at = now()
from public.users
where automation_config.key = 'auto_tasks'
  and lower(users.email) = 'mordechai@sanderscollection.com'
  and automation_config.default_assignee_user_id is null;

do $$
declare
  function_sql text;
begin
  select pg_get_functiondef('public.generate_auto_tasks_for_upload(uuid)'::regprocedure)
  into function_sql;

  function_sql := replace(
    function_sql,
    'automation_user_id uuid;',
    'automation_user_id uuid;
  default_assignee_user_id uuid;'
  );

  function_sql := replace(
    function_sql,
    'select enabled, system_user_id
  into automation_enabled, automation_user_id
  from public.automation_config',
    'select enabled, system_user_id, default_assignee_user_id
  into automation_enabled, automation_user_id, default_assignee_user_id
  from public.automation_config'
  );

  function_sql := replace(
    function_sql,
    'and task.status in (''todo'', ''in_progress'')',
    'and (
        task.status in (''todo'', ''in_progress'')
        or (task.status = ''postponed'' and task.postponed_until > current_date)
      )'
  );

  function_sql := replace(
    function_sql,
    '        null,
        automation_user_id,',
    '        coalesce(default_assignee_user_id, automation_user_id),
        automation_user_id,'
  );

  execute function_sql;
end;
$$;

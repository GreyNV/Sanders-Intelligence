-- Migration 008: Durable task activity timeline.
-- Records task creation and status changes for display alongside comments.

create table if not exists public.task_activity_events (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  actor_id    uuid references public.users(id) on delete set null,
  kind        text not null check (kind in ('created', 'status_changed')),
  from_status text check (from_status is null or from_status in ('todo', 'in_progress', 'done', 'cancelled', 'postponed')),
  to_status   text check (to_status is null or to_status in ('todo', 'in_progress', 'done', 'cancelled', 'postponed')),
  created_at  timestamptz not null default now()
);

create index if not exists task_activity_events_task_created_idx
  on public.task_activity_events (task_id, created_at);

alter table public.task_activity_events enable row level security;

create policy "task_activity_events_select"
  on public.task_activity_events for select
  to authenticated using (
    exists (
      select 1
      from public.tasks task
      where task.id = task_activity_events.task_id
        and (
          public.my_role() in ('admin', 'csuite')
          or task.department = public.my_department()
        )
    )
  );

create or replace function public.record_task_activity_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_actor_id uuid;
begin
  resolved_actor_id := auth.uid();

  if tg_op = 'INSERT' then
    insert into public.task_activity_events (
      task_id,
      actor_id,
      kind,
      from_status,
      to_status,
      created_at
    ) values (
      new.id,
      coalesce(resolved_actor_id, new.created_by),
      'created',
      null,
      new.status,
      new.created_at
    );

    return new;
  end if;

  if old.status is distinct from new.status then
    insert into public.task_activity_events (
      task_id,
      actor_id,
      kind,
      from_status,
      to_status,
      created_at
    ) values (
      new.id,
      coalesce(resolved_actor_id, new.assigned_to, new.created_by),
      'status_changed',
      old.status,
      new.status,
      now()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_record_activity_event on public.tasks;
create trigger tasks_record_activity_event
  after insert or update of status on public.tasks
  for each row execute function public.record_task_activity_event();

insert into public.task_activity_events (
  task_id,
  actor_id,
  kind,
  from_status,
  to_status,
  created_at
)
select
  task.id,
  task.created_by,
  'created',
  null,
  task.status,
  task.created_at
from public.tasks task
where not exists (
  select 1
  from public.task_activity_events event
  where event.task_id = task.id
    and event.kind = 'created'
);

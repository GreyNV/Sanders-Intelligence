-- Allow executive users to update BPR status and notes without granting structure edits.

create or replace function public.update_north_star_progress(
  p_row_id uuid,
  p_constraint_now text,
  p_weekly_move text,
  p_last_week_result text,
  p_status text
)
returns public.north_star_rows
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text;
  previous public.north_star_rows;
  updated public.north_star_rows;
begin
  select u.role into actor_role
  from public.users u
  where u.id = actor_id
    and u.is_active = true;

  if actor_role not in ('admin', 'csuite') then
    raise exception 'Executive role required' using errcode = '42501';
  end if;

  if p_status not in ('on_plan', 'at_risk', 'off_plan') then
    raise exception 'Invalid North Star status' using errcode = '22023';
  end if;

  select * into previous
  from public.north_star_rows
  where id = p_row_id;

  if not found then
    raise exception 'North Star row not found' using errcode = 'P0002';
  end if;

  update public.north_star_rows
  set constraint_now = nullif(btrim(coalesce(p_constraint_now, '')), ''),
      weekly_move = nullif(btrim(coalesce(p_weekly_move, '')), ''),
      last_week_result = nullif(btrim(coalesce(p_last_week_result, '')), ''),
      status = p_status,
      updated_by = actor_id,
      updated_at = now()
  where id = p_row_id
  returning * into updated;

  insert into public.north_star_history (row_id, field_name, old_value, new_value, edited_by, period_week)
  select previous.id, field_name, old_value, new_value, actor_id, previous.period_week
  from (
    values
      ('constraint_now', previous.constraint_now, updated.constraint_now),
      ('weekly_move', previous.weekly_move, updated.weekly_move),
      ('last_week_result', previous.last_week_result, updated.last_week_result),
      ('status', previous.status, updated.status)
  ) as changes(field_name, old_value, new_value)
  where old_value is distinct from new_value;

  return updated;
end;
$$;

revoke all on function public.update_north_star_progress(uuid, text, text, text, text) from public;
revoke all on function public.update_north_star_progress(uuid, text, text, text, text) from anon;
grant execute on function public.update_north_star_progress(uuid, text, text, text, text) to authenticated;

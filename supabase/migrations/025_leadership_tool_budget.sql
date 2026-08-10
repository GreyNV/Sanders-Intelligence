-- Add parsed Leadership Tool budget data to the singleton finance snapshot.

alter table public.leadership_tool_snapshot
  add column if not exists budget jsonb not null default '{}'::jsonb;

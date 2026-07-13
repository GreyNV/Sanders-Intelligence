-- Tighten Data API privileges for the singleton leadership-tool snapshot.

revoke all on public.leadership_tool_snapshot from anon, authenticated;
grant select, insert, update, delete on public.leadership_tool_snapshot to authenticated;

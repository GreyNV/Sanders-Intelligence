-- Vercel /api/cron/sync-sales handles sales sync in page chunks.
-- The legacy pg_cron job calls the Edge Function directly with one 20-page
-- batch and can overwrite complete high-volume days with partial aggregates.
do $$
begin
  perform cron.unschedule('sellercloud-sales-refresh');
exception
  when others then null;
end $$;

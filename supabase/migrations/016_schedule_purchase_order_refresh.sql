-- Scheduled SellerCloud PO refresh.
-- Requires Vault secrets:
--   si_supabase_url = https://<project-ref>.supabase.co
--   si_supabase_service_role_key = service role JWT

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

create schema if not exists internal;
revoke all on schema internal from anon, authenticated;

create or replace function internal.invoke_sellercloud_po_sync()
returns void
language plpgsql
security definer
set search_path = internal, public, extensions, vault
as $$
declare
  project_url text;
  service_role_key text;
begin
  select decrypted_secret into project_url
  from vault.decrypted_secrets
  where name = 'si_supabase_url'
  limit 1;

  select decrypted_secret into service_role_key
  from vault.decrypted_secrets
  where name = 'si_supabase_service_role_key'
  limit 1;

  if project_url is null or service_role_key is null then
    raise warning 'SellerCloud PO refresh skipped: missing Vault secrets';
    return;
  end if;

  perform net.http_post(
    url := project_url || '/functions/v1/sync-purchase-orders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := jsonb_build_object(
      'maxPages', 4,
      'pageSize', 50,
      'includeItems', true,
      'activeOnly', true,
      'useScanCursor', true
    )
  );
end;
$$;

do $$
begin
  perform cron.unschedule('sellercloud-po-refresh');
exception
  when others then null;
end $$;

select cron.schedule(
  'sellercloud-po-refresh',
  '*/15 * * * *',
  $$select internal.invoke_sellercloud_po_sync();$$
);

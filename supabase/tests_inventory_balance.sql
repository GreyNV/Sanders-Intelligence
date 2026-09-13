begin;
set local lock_timeout='3s';
do $$
declare po integer := -2000000000; n integer; v numeric;
begin
  insert into public.purchase_orders(id,po_status) values(po,'Test');
  insert into public.po_items(id,po_id,source_sku,qty_units_received,unit_price) values(po,po,'__inventory_validation__',5,10);
  update public.po_items set qty_units_received=5 where id=po;
  update public.po_items set qty_units_received=3 where id=po;
  select count(*),sum(received_value) into n,v from public.po_receipt_movements where po_id=po;
  assert n=2 and v=30, 'Receipt trigger duplicated or lost a quantity delta';
  update public.po_receipt_movements set observed_at='2026-01-05T12:00:00Z' where po_id=po;
  perform set_config('request.jwt.claim.sub',(select id::text from public.users where role='admin' and is_active limit 1),true);
end $$;
set local role authenticated;
do $$
declare payload jsonb := '[{"receipt_id":"__inventory_validation__","received_date":"2026-01-05","po_id":"test","source_sku":"test","quantity":2,"unit_cost":100,"received_value":200}]'; n integer; v numeric; covered bigint;
begin
  perform public.import_inventory_receipts('2026-01-05','2026-01-05','validation.csv',payload);
  perform public.import_inventory_receipts('2026-01-05','2026-01-05','validation.csv',payload);
  select count(*) into n from public.inventory_receipt_history where receipt_id='__inventory_validation__';
  assert n=1,'Reimport duplicated a receipt';
  begin
    perform public.import_inventory_receipts('2026-01-05','2026-01-05','bad.csv',null);
    raise exception 'Null import was accepted';
  exception when others then
    if sqlerrm <> 'Invalid receipt export' then raise; end if;
  end;
  select po_received_value,receipt_covered_days into v,covered from public.inventory_balance_months('2026-01-05','2026-01-05');
  assert v=200 and covered=1,'Historical receipts double counted observed movements';
  begin
    perform public.import_inventory_receipts('2026-01-05','2026-01-05','bad.csv',payload || payload);
    raise exception 'Duplicate import was accepted';
  exception when others then
    if sqlerrm <> 'Duplicate receipt IDs' then raise; end if;
  end;
end $$;
reset role;
do $$ begin perform set_config('request.jwt.claim.sub',(select id::text from public.users where role='purchasing' and is_active limit 1),true); end $$;
set local role authenticated;
do $$ begin
  begin
    perform public.import_inventory_receipts('2026-01-05','2026-01-05','forbidden.csv','[]');
    raise exception 'Purchasing import was accepted';
  exception when others then
    if sqlerrm <> 'Admin role required' then raise; end if;
  end;
end $$;
reset role;
rollback;
select 'PASS: atomic deltas, repeat import, historical precedence, duplicate rejection, purchasing denial; all fixtures rolled back' as validation;

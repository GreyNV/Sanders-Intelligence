-- Migration 012: Track auto-tasks that came back after closure and write structured metadata.
-- Run after 011_auto_task_structured_metadata.sql.

alter table public.tasks
  add column if not exists reopened_from_task_id uuid references public.tasks(id);

create index if not exists tasks_reopened_from_idx
  on public.tasks (reopened_from_task_id)
  where reopened_from_task_id is not null;

create or replace function public.generate_auto_tasks_for_upload(p_upload_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_upload public.uploads%rowtype;
  previous_upload public.uploads%rowtype;
  automation_enabled boolean;
  automation_user_id uuid;
  configured_assignee_user_id uuid;
  active_assignee_user_id uuid;
  detection record;
  existing_task_id uuid;
  closed_task_id uuid;
  created_task_id uuid;
  detection_event_key text;
begin
  select *
  into current_upload
  from public.uploads
  where id = p_upload_id
    and status = 'complete';

  if not found then
    return;
  end if;

  select enabled, system_user_id, default_assignee_user_id
  into automation_enabled, automation_user_id, configured_assignee_user_id
  from public.automation_config
  where key = 'auto_tasks';

  if not coalesce(automation_enabled, false) or automation_user_id is null then
    return;
  end if;

  select users.id
  into active_assignee_user_id
  from public.users
  where users.id = configured_assignee_user_id
    and users.is_active = true;

  select *
  into previous_upload
  from public.uploads
  where status = 'complete'
    and (uploaded_at, id) < (current_upload.uploaded_at, current_upload.id)
  order by uploaded_at desc, id desc
  limit 1;

  if not found then
    return;
  end if;

  for detection in
    with matched_records as (
      select
        current_record.product_code,
        coalesce(nullif(trim(current_record.supplier_code), ''), 'UNKNOWN') as vendor_code,
        coalesce(nullif(trim(current_record.supplier_description), ''), 'Unknown vendor') as vendor_name,
        previous_record.cost_price as previous_cost_price,
        current_record.cost_price as current_cost_price,
        previous_record.selling_price as previous_selling_price,
        current_record.selling_price as current_selling_price,
        previous_record.status as previous_status,
        current_record.status as current_status
      from public.inventory_records current_record
      join public.inventory_records previous_record
        on previous_record.upload_id = previous_upload.id
       and previous_record.product_code = current_record.product_code
      where current_record.upload_id = current_upload.id
    ),
    current_vendor_values as (
      select
        coalesce(nullif(trim(supplier_code), ''), 'UNKNOWN') as vendor_code,
        max(coalesce(nullif(trim(supplier_description), ''), 'Unknown vendor')) as vendor_name,
        sum(on_hand_value) as total_value,
        sum(case when status in ('Potential s/o', 'Stocked out') then on_hand_value else 0 end) as at_risk_value,
        array_agg(product_code order by product_code)
          filter (where status in ('Potential s/o', 'Stocked out')) as at_risk_skus
      from public.inventory_records
      where upload_id = current_upload.id
      group by coalesce(nullif(trim(supplier_code), ''), 'UNKNOWN')
    ),
    previous_vendor_values as (
      select
        coalesce(nullif(trim(supplier_code), ''), 'UNKNOWN') as vendor_code,
        sum(on_hand_value) as total_value,
        sum(case when status in ('Potential s/o', 'Stocked out') then on_hand_value else 0 end) as at_risk_value
      from public.inventory_records
      where upload_id = previous_upload.id
      group by coalesce(nullif(trim(supplier_code), ''), 'UNKNOWN')
    )
    select
      'price_review_cogs_rise'::text as rule_id,
      vendor_code,
      max(vendor_name) as vendor_name,
      null::text as bucket,
      array_agg(product_code order by product_code) as affected_skus,
      jsonb_build_object(
        'rule_name', 'Price review: COGS rose without selling-price update',
        'cost_increase_threshold_pct', 2,
        'selling_price_tolerance', 0.01,
        'items', jsonb_agg(jsonb_build_object(
          'sku', product_code,
          'previous_cost_price', previous_cost_price,
          'current_cost_price', current_cost_price,
          'previous_selling_price', previous_selling_price,
          'current_selling_price', current_selling_price
        ) order by product_code)
      ) as details,
      'Price review: COGS rose without selling-price update'::text as task_title,
      'high'::text as priority,
      public.add_business_days(current_date, 1) as due_date,
      min(product_code)::text as sku_code,
      format('%s SKUs with COGS rising for %s', count(*), max(vendor_name)) as task_description
    from matched_records
    where current_cost_price > previous_cost_price * 1.02
      and abs(current_selling_price - previous_selling_price) <= 0.01
    group by vendor_code

    union all

    select
      'entered_at_risk'::text as rule_id,
      vendor_code,
      max(vendor_name) as vendor_name,
      'at_risk'::text as bucket,
      array_agg(product_code order by product_code) as affected_skus,
      jsonb_build_object(
        'rule_name', 'Inventory review: SKUs newly at risk',
        'items', jsonb_agg(jsonb_build_object(
          'sku', product_code,
          'previous_status', previous_status,
          'current_status', current_status
        ) order by product_code)
      ) as details,
      'Inventory review: SKUs newly at risk'::text as task_title,
      'urgent'::text as priority,
      current_date as due_date,
      min(product_code)::text as sku_code,
      format('%s SKUs newly at risk for %s', count(*), max(vendor_name)) as task_description
    from matched_records
    where current_status in ('Potential s/o', 'Stocked out')
      and previous_status not in ('Potential s/o', 'Stocked out')
    group by vendor_code

    union all

    select
      'entered_excess'::text as rule_id,
      vendor_code,
      max(vendor_name) as vendor_name,
      'excess'::text as bucket,
      array_agg(product_code order by product_code) as affected_skus,
      jsonb_build_object(
        'rule_name', 'Inventory review: SKUs newly excess',
        'items', jsonb_agg(jsonb_build_object(
          'sku', product_code,
          'previous_status', previous_status,
          'current_status', current_status
        ) order by product_code)
      ) as details,
      'Inventory review: SKUs newly excess'::text as task_title,
      'medium'::text as priority,
      public.add_business_days(current_date, 3) as due_date,
      min(product_code)::text as sku_code,
      format('%s SKUs newly excess for %s', count(*), max(vendor_name)) as task_description
    from matched_records
    where current_status in ('Excess stock', 'Surplus orders')
      and previous_status not in ('Excess stock', 'Surplus orders')
    group by vendor_code

    union all

    select
      'vendor_at_risk_value_share'::text as rule_id,
      current_values.vendor_code,
      current_values.vendor_name,
      null::text as bucket,
      coalesce(current_values.at_risk_skus, '{}'::text[]) as affected_skus,
      jsonb_build_object(
        'rule_name', 'Vendor review: at-risk value share increased',
        'previous_at_risk_value', previous_values.at_risk_value,
        'previous_total_value', previous_values.total_value,
        'previous_at_risk_pct', (previous_values.at_risk_value / previous_values.total_value) * 100,
        'current_at_risk_value', current_values.at_risk_value,
        'current_total_value', current_values.total_value,
        'current_at_risk_pct', (current_values.at_risk_value / current_values.total_value) * 100,
        'increase_percentage_points',
          ((current_values.at_risk_value / current_values.total_value) -
           (previous_values.at_risk_value / previous_values.total_value)) * 100
      ) as details,
      'Vendor review: at-risk value share increased'::text as task_title,
      'high'::text as priority,
      public.add_business_days(current_date, 1) as due_date,
      null::text as sku_code,
      format('At-risk value share increased for %s', current_values.vendor_name) as task_description
    from current_vendor_values current_values
    join previous_vendor_values previous_values
      on previous_values.vendor_code = current_values.vendor_code
    where current_values.total_value > 0
      and previous_values.total_value > 0
      and (
        (current_values.at_risk_value / current_values.total_value) -
        (previous_values.at_risk_value / previous_values.total_value)
      ) * 100 >= 1.00
  loop
    detection_event_key := concat(
      current_upload.id::text,
      ':',
      detection.rule_id,
      ':',
      detection.vendor_code,
      ':',
      coalesce(detection.bucket, '')
    );

    perform pg_advisory_xact_lock(
      hashtextextended(
        concat(detection.rule_id, ':', detection.vendor_code, ':', coalesce(detection.bucket, '')),
        0
      )
    );

    if exists (
      select 1
      from public.auto_task_events
      where event_key = detection_event_key
    ) then
      continue;
    end if;

    existing_task_id := null;
    closed_task_id := null;

    select event.task_id
    into existing_task_id
    from public.auto_task_events event
    join public.tasks task
      on task.id = event.task_id
    where event.rule_id = detection.rule_id
      and event.vendor_code = detection.vendor_code
      and coalesce(event.bucket, '') = coalesce(detection.bucket, '')
      and task.source = 'auto'
      and (
        task.status in ('todo', 'in_progress')
        or (task.status = 'postponed' and task.postponed_until > current_date)
      )
    order by event.created_at desc
    limit 1;

    if existing_task_id is null then
      select event.task_id
      into closed_task_id
      from public.auto_task_events event
      join public.tasks task
        on task.id = event.task_id
      where event.rule_id = detection.rule_id
        and event.vendor_code = detection.vendor_code
        and coalesce(event.bucket, '') = coalesce(detection.bucket, '')
        and task.source = 'auto'
        and task.status in ('done', 'cancelled')
        and task.updated_at >= now() - interval '30 days'
      order by task.updated_at desc, event.created_at desc
      limit 1;

      insert into public.tasks (
        title,
        description,
        status,
        priority,
        due_date,
        department,
        assigned_to,
        created_by,
        sku_code,
        source,
        rule_id,
        vendor_supplier_code,
        vendor_name,
        affected_skus,
        upload_id,
        reopened_from_task_id,
        created_at,
        updated_at
      ) values (
        detection.task_title,
        detection.task_description,
        'todo',
        detection.priority,
        detection.due_date,
        'purchasing',
        active_assignee_user_id,
        automation_user_id,
        detection.sku_code,
        'auto',
        detection.rule_id,
        detection.vendor_code,
        detection.vendor_name,
        detection.affected_skus,
        current_upload.id,
        closed_task_id,
        now(),
        now()
      )
      returning id into created_task_id;

      insert into public.auto_task_events (
        upload_id,
        previous_upload_id,
        rule_id,
        vendor_code,
        vendor_name,
        bucket,
        event_key,
        affected_skus,
        details,
        outcome,
        task_id
      ) values (
        current_upload.id,
        previous_upload.id,
        detection.rule_id,
        detection.vendor_code,
        detection.vendor_name,
        detection.bucket,
        detection_event_key,
        detection.affected_skus,
        detection.details,
        'created',
        created_task_id
      );
    else
      insert into public.auto_task_events (
        upload_id,
        previous_upload_id,
        rule_id,
        vendor_code,
        vendor_name,
        bucket,
        event_key,
        affected_skus,
        details,
        outcome,
        suppressed_by_task_id
      ) values (
        current_upload.id,
        previous_upload.id,
        detection.rule_id,
        detection.vendor_code,
        detection.vendor_name,
        detection.bucket,
        detection_event_key,
        detection.affected_skus,
        detection.details,
        'suppressed',
        existing_task_id
      );
    end if;
  end loop;
end;
$$;

revoke all on function public.generate_auto_tasks_for_upload(uuid) from public;
revoke all on function public.generate_auto_tasks_for_upload(uuid) from anon;
revoke all on function public.generate_auto_tasks_for_upload(uuid) from authenticated;

-- Linked Supabase verification; all users, tenants, time records and audit events roll back.
begin;
do $$
declare
  v_owner uuid := gen_random_uuid(); v_manager uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid(); v_outsider uuid := gen_random_uuid();
  v_manager_email text := gen_random_uuid()::text || '@example.invalid';
  v_user_email text := gen_random_uuid()::text || '@example.invalid';
  v_org uuid; v_other_org uuid; v_employee uuid; v_type uuid; v_request uuid;
  v_count integer; v_available bigint; v_used bigint;
begin
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
    (v_owner,gen_random_uuid()::text || '@example.invalid',now(),'{}'),
    (v_manager,v_manager_email,now(),'{}'),
    (v_user,v_user_email,now(),'{}'),
    (v_outsider,gen_random_uuid()::text || '@example.invalid',now(),'{}');
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  v_org := public.create_organisation('Time transaction QA','97' || lpad(floor(random()*100000000)::text,8,'0'));
  perform public.set_organisation_member(v_org,v_manager_email,'manager',null);
  insert into public.employees(organisation_id,first_name,last_name,email,job_title,department,workplace,start_date,manager_user_id)
    values(v_org,'QA','Time',v_user_email,'Developer','QA','Office','2026-09-01',v_manager) returning id into v_employee;
  perform public.set_organisation_member(v_org,v_user_email,'employee',v_employee);
  select id into strict v_type from public.leave_types where organisation_id=v_org and category='annual';
  perform public.save_leave_allowance(v_org,v_employee,v_type,2026,20);
  perform public.save_calendar_day(v_org,'2026-09-22',false,'QA closure');
  perform set_config('request.jwt.claim.sub',v_user::text,true);
  v_request := public.request_leave(v_org,v_employee,v_type,'2026-09-21','2026-09-25');
  select days into v_count from public.leave_requests where id=v_request;
  if v_count <> 4 then raise exception 'FAIL: working-day count'; end if;
  select available into v_available from public.leave_balance_summary(v_org,v_employee,2026) where leave_type_id=v_type;
  if v_available <> 16 then raise exception 'FAIL: pending reservation'; end if;
  begin
    perform public.decide_leave(v_org,v_request,1,'approved','');
    raise exception 'FAIL: self approval';
  exception when insufficient_privilege then null; end;
  begin
    perform public.request_leave(v_org,v_employee,v_type,'2026-09-23','2026-09-23');
    raise exception 'FAIL: overlap accepted';
  exception when sqlstate 'L0005' then null; end;
  perform set_config('request.jwt.claim.sub',v_manager::text,true);
  perform public.decide_leave(v_org,v_request,1,'approved','');
  select count(*) into v_count from public.attendance_month(v_org,v_employee,'2026-09-01') where category='annual' and recorded and worked_hours=0;
  if v_count <> 4 then raise exception 'FAIL: leave attendance projection'; end if;
  begin
    perform public.save_attendance(v_org,v_employee,'2026-09-23',8,8,'none',null);
    raise exception 'FAIL: worked hours over approved leave';
  exception when sqlstate 'L0008' then null; end;
  perform public.save_attendance(v_org,v_employee,'2026-09-28',8,7.5,'none',null);
  begin
    perform public.save_attendance(v_org,v_employee,'2026-09-28',8,8,'none',null);
    raise exception 'FAIL: stale attendance overwrite';
  exception when sqlstate 'P0006' then null; end;
  begin
    update public.leave_requests set status='cancelled' where id=v_request;
    raise exception 'FAIL: direct mutation';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',v_outsider::text,true);
  v_other_org := public.create_organisation('Other time transaction QA','96' || lpad(floor(random()*100000000)::text,8,'0'));
  select count(*) into v_count from public.leave_requests where organisation_id=v_org;
  if v_count <> 0 then raise exception 'FAIL: cross-tenant leave'; end if;
  select count(*) into v_count from public.attendance where organisation_id=v_org;
  if v_count <> 0 then raise exception 'FAIL: cross-tenant attendance'; end if;
  begin
    perform public.attendance_month(v_org,v_employee,'2026-09-01');
    raise exception 'FAIL: cross-tenant attendance RPC';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  perform public.decide_leave(v_org,v_request,2,'cancelled','QA cancellation');
  select used,available into v_used,v_available from public.leave_balance_summary(v_org,v_employee,2026) where leave_type_id=v_type;
  if v_used <> 0 or v_available <> 20 then raise exception 'FAIL: balance release'; end if;
  select count(*) into v_count from public.audit_log where entity_id=v_request and action in ('leave.requested','leave.approved','leave.cancelled');
  if v_count <> 3 then raise exception 'FAIL: leave audit history'; end if;
  execute 'reset role';
end;
$$;
select 'PASS: leave, balance, approval, attendance, stale updates, isolation and audit; fixtures rolled back' as result;
rollback;

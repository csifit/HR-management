-- Every fixture and audit event is rolled back, including temporary auth users.
begin;
do $$
declare
  v_owner uuid:=gen_random_uuid(); v_user uuid:=gen_random_uuid(); v_outsider uuid:=gen_random_uuid();
  v_email text:=gen_random_uuid()::text || '@example.invalid';
  v_org uuid; v_other_org uuid; v_employee uuid; v_provider uuid; v_benefit uuid; v_enrolment uuid; v_run uuid;
  v_item public.benefit_run_items; v_version bigint; v_count integer; v_total numeric; v_summary jsonb;
begin
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
    (v_owner,gen_random_uuid()::text || '@example.invalid',now(),'{}'),
    (v_user,v_email,now(),'{}'),(v_outsider,gen_random_uuid()::text || '@example.invalid',now(),'{}');
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  v_org:=public.create_organisation('Benefits transaction QA','95'||lpad(floor(random()*100000000)::text,8,'0'));
  insert into public.employees(organisation_id,first_name,last_name,email,job_title,department,workplace,start_date,status)
    values(v_org,'QA','Benefits',v_email,'Developer','QA','Office','2026-01-01','active') returning id into v_employee;
  perform public.set_organisation_member(v_org,v_email,'employee',v_employee);
  insert into public.employment_contracts(organisation_id,employee_id,contract_number,start_date,job_title,cor_code,workplace,gross_salary,status)
    values(v_org,v_employee,'QA-BEN','2026-01-01','Developer','251202','Office',10000,'active');
  v_provider:=public.save_benefit_provider(v_org,null,null,'QA provider','pluxee',true);
  v_benefit:=public.save_benefit(v_org,null,null,v_provider,'QA daily benefit','per_worked_day',45,true);
  v_enrolment:=public.save_employee_benefit(v_org,null,null,v_employee,v_benefit,'2026-01-01',null,true);
  perform public.save_attendance(v_org,v_employee,'2026-07-02',8,8,'none',null);
  v_run:=public.prepare_benefit_month(v_org,'2026-07-01',null);
  select * into strict v_item from public.benefit_run_items where run_id=v_run;
  if v_item.suggested_amount is distinct from 1035 or v_item.worked_days is distinct from 23 then raise exception 'FAIL: automatic plus manual worked-day calculation'; end if;
  begin
    perform public.approve_benefit_month(v_org,v_run,1);
    raise exception 'FAIL: unreviewed approval';
  exception when sqlstate 'B0003' then null; end;
  perform set_config('request.jwt.claim.sub',v_user::text,true);
  select count(*) into v_count from public.benefit_run_items where run_id=v_run;
  if v_count<>0 then raise exception 'FAIL: employee read draft'; end if;
  begin
    perform public.prepare_benefit_month(v_org,'2026-08-01',null);
    raise exception 'FAIL: employee prepared benefits';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  perform public.review_benefit_item(v_org,v_item.id,1,true,45,'QA review completed');
  perform public.save_attendance(v_org,v_employee,'2026-07-03',8,0,'none',null);
  begin
    perform public.approve_benefit_month(v_org,v_run,2);
    raise exception 'FAIL: source change ignored';
  exception when sqlstate 'B0002' then null; end;
  perform public.prepare_benefit_month(v_org,'2026-07-01',2);
  select * into strict v_item from public.benefit_run_items where run_id=v_run;
  if v_item.suggested_amount is distinct from 990 then raise exception 'FAIL: reprepare'; end if;
  perform public.review_benefit_item(v_org,v_item.id,1,true,990,'QA second review');
  select version into v_version from public.benefit_runs where id=v_run;
  perform public.approve_benefit_month(v_org,v_run,v_version);
  v_summary:=public.benefit_month_summary(v_org,v_run);
  if (v_summary->>'total')::numeric is distinct from 990 or (v_summary->>'worked_days')::integer is distinct from 22 then raise exception 'FAIL: monthly totals'; end if;
  begin
    perform public.review_benefit_item(v_org,v_item.id,2,false,0,'Forbidden correction');
    raise exception 'FAIL: approved record mutation';
  exception when sqlstate 'B0001' then null; end;
  perform set_config('request.jwt.claim.sub',v_user::text,true);
  select final_amount into v_total from public.benefit_run_items where run_id=v_run;
  if v_total is distinct from 990 then raise exception 'FAIL: own approved visibility'; end if;
  perform set_config('request.jwt.claim.sub',v_outsider::text,true);
  v_other_org:=public.create_organisation('Other benefits QA','94'||lpad(floor(random()*100000000)::text,8,'0'));
  select count(*) into v_count from public.benefit_run_items where run_id=v_run;
  if v_count<>0 then raise exception 'FAIL: cross-tenant visibility'; end if;
  begin
    perform public.benefit_month_summary(v_org,v_run);
    raise exception 'FAIL: cross-tenant summary';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  select count(*) into v_count from public.audit_log where entity_id=v_run and action='benefit.month_approved';
  if v_count<>1 then raise exception 'FAIL: approval audit'; end if;
  execute 'reset role';
end;
$$;
select 'PASS: benefits preparation, HR review, stale sources, approval, employee access, isolation and audit; fixtures rolled back' as result;
rollback;

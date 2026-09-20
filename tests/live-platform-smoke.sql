-- Linked Supabase verification. Every fixture, role grant and audit event is rolled back.
begin;
do $$
declare
  v_admin uuid := gen_random_uuid(); v_owner uuid := gen_random_uuid();
  v_email text := gen_random_uuid()::text || '@example.invalid';
  v_cui text := '98' || lpad(floor(random() * 100000000)::text, 8, '0');
  v_org uuid; v_employee uuid; v_version bigint; v_count integer; v_list jsonb;
begin
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
    (v_admin,gen_random_uuid()::text || '@example.invalid',now(),'{}'), (v_owner,v_email,now(),'{}');
  insert into private.platform_admins(user_id) values(v_admin);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  v_org := public.platform_save_organisation(null,null,jsonb_build_object('name','Platform transaction QA','cui',v_cui,'city','București'),v_email);
  select count(*) into v_count from public.organisation_users;
  if v_count <> 0 then raise exception 'FAIL: platform admin acquired tenant membership'; end if;
  v_list := public.platform_organisation_list(v_cui,'active',1);
  if (v_list->>'total')::integer <> 1 then raise exception 'FAIL: platform list'; end if;
  v_version := (v_list->'organisations'->0->>'version')::bigint;
  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  insert into public.employees(organisation_id,first_name,last_name,email,job_title,department,workplace,start_date)
    values(v_org,'QA','Platform',v_email,'Developer','QA','Office','2026-09-01') returning id into v_employee;
  insert into public.employment_contracts(organisation_id,employee_id,contract_number,start_date,job_title,cor_code,workplace,gross_salary)
    values(v_org,v_employee,'QA-1','2026-09-01','Developer','251202','Office',10000);
  begin
    perform public.platform_set_organisation_status(v_org,v_version,'blocked','Forged owner request');
    raise exception 'FAIL: owner called platform mutation';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform public.platform_set_organisation_status(v_org,v_version,'suspended','QA suspension verification');
  v_version := v_version + 1;
  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  select count(*) into v_count from public.employees;
  if v_count <> 1 then raise exception 'FAIL: suspended reads unavailable'; end if;
  update public.employees set first_name='Forbidden' where id=v_employee;
  get diagnostics v_count = row_count;
  if v_count <> 0 then raise exception 'FAIL: suspended write'; end if;
  begin
    perform public.set_organisation_member(v_org,v_email,'organisation_owner',null);
    raise exception 'FAIL: suspended membership mutation';
  exception when sqlstate 'P0004' then null; end;
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform public.platform_set_organisation_status(v_org,v_version,'blocked','QA block verification');
  v_version := v_version + 1;
  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  select count(*) into v_count from public.employees;
  if v_count <> 0 then raise exception 'FAIL: blocked employee visibility'; end if;
  select count(*) into v_count from public.employment_contracts;
  if v_count <> 0 then raise exception 'FAIL: blocked contract visibility'; end if;
  select count(*) into v_count from public.employee_directory_details(v_org,array[v_employee]);
  if v_count <> 0 then raise exception 'FAIL: blocked directory RPC'; end if;
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  begin
    perform public.platform_set_organisation_status(v_org,v_version - 1,'active','Stale administrator request');
    raise exception 'FAIL: stale mutation';
  exception when sqlstate 'P0006' then null; end;
  perform public.platform_set_organisation_status(v_org,v_version,'active','QA restore verification');
  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  select count(*) into v_count from public.employees;
  if v_count <> 1 then raise exception 'FAIL: restoration'; end if;
  select count(*) into v_count from public.audit_log where action='organisation.status_changed' and user_id=v_admin;
  if v_count <> 3 then raise exception 'FAIL: access audit history'; end if;
  execute 'reset role';
end;
$$;
select 'PASS: platform onboarding, role checks, suspension, blocking, restoration, stale edits and audit; fixtures rolled back' as result;
rollback;

-- Run against the linked development project with `supabase db query --linked --file tests/live-rls-smoke.sql`.
-- All fixtures are rolled back, including auth users and audit entries.
begin;
do $$
declare
  owner_a uuid := gen_random_uuid(); owner_b uuid := gen_random_uuid(); employee_user uuid := gen_random_uuid();
  org_a uuid; org_b uuid; emp_a uuid; emp_b uuid; n integer;
  email_a text := gen_random_uuid()::text || '@example.invalid';
  email_b text := gen_random_uuid()::text || '@example.invalid';
  email_employee text := gen_random_uuid()::text || '@example.invalid';
begin
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
    (owner_a,email_a,now(),'{}'), (owner_b,email_b,now(),'{}'), (employee_user,email_employee,now(),'{}');
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',owner_a::text,true);
  org_a := public.create_organisation('RLS smoke A','RO123456');
  insert into public.employees(organisation_id,first_name,last_name,email,job_title,department,workplace,start_date)
    values(org_a,'Test','A',email_employee,'Developer','Engineering','București','2026-09-01') returning id into emp_a;
  perform public.set_organisation_member(org_a,email_employee,'employee',emp_a);
  perform set_config('request.jwt.claim.sub',owner_b::text,true);
  org_b := public.create_organisation('RLS smoke B','RO234567');
  insert into public.employees(organisation_id,first_name,last_name,email,job_title,department,workplace,start_date)
    values(org_b,'Test','B',email_b,'Developer','Engineering','București','2026-09-01') returning id into emp_b;
  perform set_config('request.jwt.claim.sub',owner_a::text,true);
  select count(*) into n from public.employees where id=emp_b;
  if n <> 0 then raise exception 'FAIL: owner can read another tenant'; end if;
  begin
    insert into public.employees(organisation_id,first_name,last_name,email,job_title,department,workplace,start_date)
      values(org_b,'Intruder','Test',email_a,'Developer','Engineering','București','2026-09-01');
    raise exception 'FAIL: cross-tenant insertion allowed';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',employee_user::text,true);
  select count(*) into n from public.employees;
  if n <> 1 then raise exception 'FAIL: employee visibility'; end if;
  update public.employees set first_name='Unauthorized' where id=emp_a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: employee self-edit allowed'; end if;
  execute 'reset role';
end;
$$;
select 'PASS: real Supabase tenant reads, cross-tenant writes, employee self-access, and write restrictions' as result;
rollback;

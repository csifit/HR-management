-- Synthetic users/tenants only; every fixture and audit event rolls back.
-- This checks metadata/RPCs, never fabricates Storage objects or sends emails.
begin;
do $$
declare
  v_owner uuid:=gen_random_uuid(); v_employee_user uuid:=gen_random_uuid(); v_other uuid:=gen_random_uuid();
  v_email text:=gen_random_uuid()::text||'@example.invalid';
  v_org uuid; v_other_org uuid; v_employee uuid; v_doc uuid; v_case uuid;
  v_task public.lifecycle_tasks; v_version integer; v_count integer;
begin
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
    (v_owner,gen_random_uuid()::text||'@example.invalid',now(),'{}'),
    (v_employee_user,v_email,now(),'{}'),
    (v_other,gen_random_uuid()::text||'@example.invalid',now(),'{}');
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_owner,'aal','aal1')::text,true);
  v_org:=public.create_organisation('Documents transaction QA','93'||lpad(floor(random()*100000000)::text,8,'0'));
  insert into public.employees(organisation_id,first_name,last_name,email,job_title,department,workplace,start_date,status)
    values(v_org,'QA','Documents',v_email,'Developer','QA','Office','2026-01-01','active') returning id into v_employee;
  perform public.set_organisation_member(v_org,v_email,'employee',v_employee);
  v_doc:=public.prepare_employee_document(v_org,v_employee,'QA pending PDF','employment','employee','uploaded','qa.pdf',200);
  begin
    perform public.complete_employee_document(v_org,v_doc,1);
    raise exception 'FAIL: missing Storage upload finalized';
  exception when sqlstate 'D0002' then null; end;
  begin
    perform public.prepare_document_email(v_org,v_doc,1,v_email);
    raise exception 'FAIL: pending PDF was shareable';
  exception when sqlstate 'D0001' then null; end;
  perform public.save_reges_identifiers(v_org,null,v_org,v_owner);
  begin
    perform public.save_reges_identifiers(v_org,null,null,null);
    raise exception 'FAIL: stale REGES update';
  exception when sqlstate 'P0006' then null; end;
  v_case:=public.create_lifecycle_case(v_org,v_employee,'offboarding','2026-10-01');
  begin
    perform public.close_lifecycle_case(v_org,v_case,1,'completed','');
    raise exception 'FAIL: unfinished checklist closed';
  exception when sqlstate 'D0005' then null; end;
  perform set_config('request.jwt.claim.sub',v_employee_user::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_employee_user,'aal','aal1')::text,true);
  select count(*) into v_count from public.employee_documents where id=v_doc;
  if v_count<>0 then raise exception 'FAIL: employee read pending document'; end if;
  select count(*) into v_count from public.lifecycle_cases where id=v_case;
  if v_count<>0 then raise exception 'FAIL: employee read HR checklist'; end if;
  select count(*) into v_count from public.reges_connections where organisation_id=v_org;
  if v_count<>0 then raise exception 'FAIL: employee read REGES identifiers'; end if;
  begin
    perform public.create_lifecycle_case(v_org,v_employee,'onboarding','2026-10-01');
    raise exception 'FAIL: employee created HR checklist';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',v_other::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_other,'aal','aal1')::text,true);
  v_other_org:=public.create_organisation('Other documents QA','92'||lpad(floor(random()*100000000)::text,8,'0'));
  perform public.set_organisation_member(v_other_org,v_email,'employee',null);
  select count(*) into v_count from public.employee_documents where id=v_doc;
  if v_count<>0 then raise exception 'FAIL: cross-tenant document read'; end if;
  begin
    perform public.update_employee_document(v_org,v_doc,1,'archive','employee');
    raise exception 'FAIL: cross-tenant mutation';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_owner,'aal','aal1')::text,true);
  for v_task in select * from public.lifecycle_tasks where case_id=v_case and task_key<>'revoke_access' loop
    perform public.update_lifecycle_task(v_org,v_task.id,v_task.version,'done','QA review');
  end loop;
  select * into strict v_task from public.lifecycle_tasks where case_id=v_case and task_key='revoke_access';
  perform public.revoke_lifecycle_access(v_org,v_task.id,v_task.version,v_employee_user,'QA offboarding access review');
  select version into v_version from public.lifecycle_cases where id=v_case;
  perform public.close_lifecycle_case(v_org,v_case,v_version,'completed','');
  perform public.update_employee_document(v_org,v_doc,1,'archive','employee');
  select count(*) into v_count from public.organisation_users where organisation_id=v_org and user_id=v_employee_user;
  if v_count<>0 then raise exception 'FAIL: offboarding membership remains'; end if;
  select count(*) into v_count from public.audit_log where entity_id=v_case and action='lifecycle.closed';
  if v_count<>1 then raise exception 'FAIL: lifecycle closure audit'; end if;
  perform set_config('request.jwt.claim.sub',v_employee_user::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_employee_user,'aal','aal1')::text,true);
  select count(*) into v_count from public.organisation_users where organisation_id=v_other_org and user_id=v_employee_user;
  if v_count<>1 then raise exception 'FAIL: another company membership was removed'; end if;
  execute 'reset role';
end;
$$;
select 'PASS: document metadata, lifecycle, scoped access revocation, REGES, tenant boundaries and audit; fixtures rolled back' as result;
rollback;

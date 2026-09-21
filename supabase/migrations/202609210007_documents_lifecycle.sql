-- Private documents and explicit onboarding/offboarding workflows.
create table public.employee_documents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  employee_id uuid not null,
  title text not null check (length(btrim(title)) between 1 and 160),
  category text not null check (category in ('employment','identity','certificate','other')),
  visibility text not null check (visibility in ('hr_only','employee')),
  origin text not null check (origin in ('uploaded','generated')),
  status text not null default 'pending' check (status in ('pending','uploaded','generated','signed','archived')),
  filename text not null check (length(filename) between 5 and 180 and filename ~* '\.pdf$' and filename !~ '[[:cntrl:]/\\]'),
  byte_size integer not null check (byte_size between 5 and 10485760),
  object_path text generated always as (organisation_id::text || '/' || id::text || '.pdf') stored unique,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  signed_at timestamptz,
  signed_by uuid references auth.users(id),
  version integer not null default 1,
  foreign key (organisation_id,employee_id) references public.employees(organisation_id,id)
);
create index employee_documents_employee_idx on public.employee_documents(organisation_id,employee_id,created_at desc,id);
create table public.lifecycle_cases (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  employee_id uuid not null,
  kind text not null check (kind in ('onboarding','offboarding')),
  status text not null default 'active' check (status in ('active','completed','cancelled')),
  target_date date not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  close_note text not null default '' check (length(close_note)<=1000),
  version integer not null default 1,
  unique (organisation_id,id),
  foreign key (organisation_id,employee_id) references public.employees(organisation_id,id)
);
create unique index lifecycle_active_idx on public.lifecycle_cases(organisation_id,employee_id,kind) where status='active';
create index lifecycle_case_list_idx on public.lifecycle_cases(organisation_id,created_at desc,id);
create table public.lifecycle_tasks (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  case_id uuid not null,
  task_key text not null,
  title text not null default '' check (length(title)<=160),
  position integer not null,
  status text not null default 'todo' check (status in ('todo','done','skipped')),
  note text not null default '' check (length(note)<=1000),
  completed_by uuid references auth.users(id),
  completed_at timestamptz,
  revoked_user_id uuid references auth.users(id),
  version integer not null default 1,
  foreign key (organisation_id,case_id) references public.lifecycle_cases(organisation_id,id),
  unique (case_id,position)
);
alter table public.employee_documents enable row level security;
alter table public.lifecycle_cases enable row level security;
alter table public.lifecycle_tasks enable row level security;
create policy documents_read on public.employee_documents for select to authenticated using (
  private.is_hr(organisation_id) or (visibility='employee' and ready_at is not null and status<>'archived' and private.owns_employee(organisation_id,employee_id))
);
create policy lifecycle_cases_read on public.lifecycle_cases for select to authenticated using (private.is_hr(organisation_id));
create policy lifecycle_tasks_read on public.lifecycle_tasks for select to authenticated using (private.is_hr(organisation_id));
revoke all on public.employee_documents,public.lifecycle_cases,public.lifecycle_tasks from public,anon,authenticated;
grant select on public.employee_documents,public.lifecycle_cases,public.lifecycle_tasks to authenticated;

create function private.require_documents_hr(p_org uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  perform private.lock_time_organisation(p_org);
  if not private.is_hr(p_org) then raise exception 'HR required' using errcode='42501'; end if;
end $$;

-- Bucket configuration only. All file transfers go through the Storage API.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('hrconnector-employee-documents','hrconnector-employee-documents',false,10485760,array['application/pdf'])
on conflict (id) do update set public=false,file_size_limit=10485760,allowed_mime_types=array['application/pdf'];

create function private.document_object_read(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.employee_documents d where d.object_path=p_path and
 (private.is_hr(d.organisation_id) or (d.visibility='employee' and d.ready_at is not null and d.status<>'archived' and private.owns_employee(d.organisation_id,d.employee_id))));
$$;
create function private.document_object_insert(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.employee_documents d join public.organisations o on o.id=d.organisation_id
 where d.object_path=p_path and d.status='pending' and d.created_by=auth.uid() and o.status='active' and private.is_hr(d.organisation_id));
$$;
create policy hr_documents_read on storage.objects for select to authenticated using (bucket_id='hrconnector-employee-documents' and private.document_object_read(name));
create policy hr_documents_insert on storage.objects for insert to authenticated with check (bucket_id='hrconnector-employee-documents' and private.document_object_insert(name));
-- Guards prevent broader policies for other buckets from opening this bucket.
create policy hr_documents_read_guard on storage.objects as restrictive for select to public using (bucket_id<>'hrconnector-employee-documents' or private.document_object_read(name));
create policy hr_documents_insert_guard on storage.objects as restrictive for insert to public with check (bucket_id<>'hrconnector-employee-documents' or private.document_object_insert(name));
create policy hr_documents_update_guard on storage.objects as restrictive for update to public using (bucket_id<>'hrconnector-employee-documents') with check (bucket_id<>'hrconnector-employee-documents');
create policy hr_documents_delete_guard on storage.objects as restrictive for delete to public using (bucket_id<>'hrconnector-employee-documents');

create function public.prepare_employee_document(p_org uuid,p_employee uuid,p_title text,p_category text,p_visibility text,p_origin text,p_filename text,p_bytes integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 perform private.require_documents_hr(p_org);
 insert into public.employee_documents(organisation_id,employee_id,title,category,visibility,origin,filename,byte_size,created_by)
 values(p_org,p_employee,btrim(p_title),p_category,p_visibility,p_origin,p_filename,p_bytes,auth.uid()) returning id into v_id;
 insert into public.audit_log(organisation_id,user_id,action,entity,entity_id) values(p_org,auth.uid(),'document.prepared','employee_documents',v_id);
 return v_id;
end $$;

create function public.complete_employee_document(p_org uuid,p_id uuid,p_version integer) returns void language plpgsql security definer set search_path='' as $$
declare v_doc public.employee_documents;
begin
 perform private.require_documents_hr(p_org);
 select * into v_doc from public.employee_documents where organisation_id=p_org and id=p_id for update;
 if not found then raise exception 'Not found' using errcode='42501'; end if;
 if v_doc.version is distinct from p_version then raise exception 'Stale' using errcode='P0006'; end if;
 if v_doc.status<>'pending' then raise exception 'Invalid state' using errcode='D0001'; end if;
 if not exists(select 1 from storage.objects where bucket_id='hrconnector-employee-documents' and name=v_doc.object_path
   and metadata->>'mimetype'='application/pdf' and (metadata->>'size')::bigint=v_doc.byte_size) then
   raise exception 'Upload incomplete' using errcode='D0002';
 end if;
 update public.employee_documents set status=origin,ready_at=now(),version=version+1 where id=p_id;
 insert into public.audit_log(organisation_id,user_id,action,entity,entity_id) values(p_org,auth.uid(),'document.ready','employee_documents',p_id);
end $$;

create function public.update_employee_document(p_org uuid,p_id uuid,p_version integer,p_action text,p_visibility text)
returns void language plpgsql security definer set search_path='' as $$
declare v_doc public.employee_documents;
begin
 perform private.require_documents_hr(p_org);
 select * into v_doc from public.employee_documents where organisation_id=p_org and id=p_id for update;
 if not found then raise exception 'Not found' using errcode='42501'; end if;
 if v_doc.version is distinct from p_version then raise exception 'Stale' using errcode='P0006'; end if;
 if v_doc.status='archived' then raise exception 'Archived' using errcode='D0001'; end if;
 if p_action='archive' then
   update public.employee_documents set status='archived',version=version+1 where id=p_id;
 elsif p_action='visibility' and p_visibility in ('hr_only','employee') then
   update public.employee_documents set visibility=p_visibility,version=version+1 where id=p_id;
 elsif p_action='signed' and v_doc.ready_at is not null and v_doc.status<>'signed' then
   update public.employee_documents set status='signed',signed_at=now(),signed_by=auth.uid(),version=version+1 where id=p_id;
 else raise exception 'Invalid state' using errcode='D0001'; end if;
 insert into public.audit_log(organisation_id,user_id,action,entity,entity_id,metadata)
 values(p_org,auth.uid(),'document.updated','employee_documents',p_id,jsonb_build_object('operation',p_action,'visibility',case when p_action='visibility' then p_visibility else v_doc.visibility end));
end $$;

create function public.create_lifecycle_case(p_org uuid,p_employee uuid,p_kind text,p_target date)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_keys text[];
begin
 perform private.require_documents_hr(p_org);
 if p_target not between date '1900-01-01' and date '2200-12-31' then raise exception 'Invalid date' using errcode='22023'; end if;
 insert into public.lifecycle_cases(organisation_id,employee_id,kind,target_date,created_by) values(p_org,p_employee,p_kind,p_target,auth.uid()) returning id into v_id;
 v_keys:=case when p_kind='onboarding' then array['profile','contract','reges','benefits','payroll','documents','account'] else array['termination','reges','benefits','payroll','documents','equipment','revoke_access'] end;
 insert into public.lifecycle_tasks(organisation_id,case_id,task_key,position) select p_org,v_id,k,n from unnest(v_keys) with ordinality as t(k,n);
 insert into public.audit_log(organisation_id,user_id,action,entity,entity_id) values(p_org,auth.uid(),'lifecycle.created','lifecycle_cases',v_id);
 return v_id;
end $$;
create function public.add_lifecycle_task(p_org uuid,p_case uuid,p_version integer,p_title text)
returns void language plpgsql security definer set search_path='' as $$
declare v_case public.lifecycle_cases;
begin
 perform private.require_documents_hr(p_org);
 select * into v_case from public.lifecycle_cases where organisation_id=p_org and id=p_case for update;
 if not found then raise exception 'Not found' using errcode='42501'; end if;
 if v_case.version is distinct from p_version then raise exception 'Stale' using errcode='P0006'; end if;
 if v_case.status<>'active' then raise exception 'Closed' using errcode='D0001'; end if;
 if length(btrim(p_title)) not between 1 and 160 or p_title is null then raise exception 'Invalid title' using errcode='22023'; end if;
 if (select count(*) from public.lifecycle_tasks where case_id=p_case)>=100 then raise exception 'Task limit' using errcode='22023'; end if;
 insert into public.lifecycle_tasks(organisation_id,case_id,task_key,title,position)
 select p_org,p_case,'custom',btrim(p_title),coalesce(max(position),0)+1 from public.lifecycle_tasks where case_id=p_case;
 update public.lifecycle_cases set version=version+1 where id=p_case;
 insert into public.audit_log(organisation_id,user_id,action,entity,entity_id) values(p_org,auth.uid(),'lifecycle.task_added','lifecycle_cases',p_case);
end $$;
create function public.update_lifecycle_task(p_org uuid,p_id uuid,p_version integer,p_status text,p_note text)
returns void language plpgsql security definer set search_path='' as $$
declare v_task public.lifecycle_tasks; v_case public.lifecycle_cases;
begin
 perform private.require_documents_hr(p_org);
 select * into v_task from public.lifecycle_tasks where organisation_id=p_org and id=p_id for update;
 if not found then raise exception 'Not found' using errcode='42501'; end if;
 select * into v_case from public.lifecycle_cases where id=v_task.case_id for update;
 if v_task.version is distinct from p_version then raise exception 'Stale' using errcode='P0006'; end if;
 if v_case.status<>'active' then raise exception 'Closed' using errcode='D0001'; end if;
 if v_task.task_key='revoke_access' then raise exception 'Use owner access action' using errcode='42501'; end if;
 if p_status is null or p_status not in ('todo','done','skipped') or p_note is null or length(p_note)>1000 or (p_status='skipped' and length(btrim(p_note))<5) then raise exception 'Invalid task' using errcode='22023'; end if;
 update public.lifecycle_tasks set status=p_status,note=btrim(p_note),completed_by=case when p_status='todo' then null else auth.uid() end,
 completed_at=case when p_status='todo' then null else now() end,version=version+1 where id=p_id;
 update public.lifecycle_cases set version=version+1 where id=v_task.case_id;
 insert into public.audit_log(organisation_id,user_id,action,entity,entity_id) values(p_org,auth.uid(),'lifecycle.task_updated','lifecycle_cases',v_task.case_id);
end $$;

create function public.revoke_lifecycle_access(p_org uuid,p_id uuid,p_version integer,p_user uuid,p_note text)
returns void language plpgsql security definer set search_path='' as $$
declare v_task public.lifecycle_tasks; v_case public.lifecycle_cases; v_employee public.employees;
begin
 perform private.require_documents_hr(p_org);
 if private.role_in(p_org)<>'organisation_owner' then raise exception 'Owner required' using errcode='42501'; end if;
 select * into v_task from public.lifecycle_tasks where organisation_id=p_org and id=p_id for update;
 if not found then raise exception 'Not found' using errcode='42501'; end if;
 select * into v_case from public.lifecycle_cases where id=v_task.case_id for update;
 select * into v_employee from public.employees where id=v_case.employee_id for update;
 if v_task.version is distinct from p_version or v_employee.user_id is distinct from p_user then raise exception 'Stale' using errcode='P0006'; end if;
 if v_case.kind<>'offboarding' or v_case.status<>'active' or v_task.task_key<>'revoke_access' then raise exception 'Invalid state' using errcode='D0001'; end if;
 if p_note is null or length(btrim(p_note)) not between 5 and 1000 then raise exception 'Reason required' using errcode='22023'; end if;
 if p_user=auth.uid() then raise exception 'Cannot revoke own access' using errcode='D0003'; end if;
 if p_user is null then
   if exists(select 1 from public.organisation_users where organisation_id=p_org and (lower(email)=lower(v_employee.email) or user_id=v_task.revoked_user_id)) then
     raise exception 'Link the employee account first' using errcode='D0004';
   end if;
 else
   if exists(select 1 from public.organisation_users where organisation_id=p_org and user_id=p_user and role='organisation_owner')
     and (select count(*) from public.organisation_users where organisation_id=p_org and role='organisation_owner')<=1 then
     raise exception 'Last owner' using errcode='P0002';
   end if;
   update public.employees set manager_user_id=null where organisation_id=p_org and manager_user_id=p_user;
   update public.employees set user_id=null where organisation_id=p_org and user_id=p_user;
   delete from public.organisation_users where organisation_id=p_org and user_id=p_user;
   insert into public.audit_log(organisation_id,user_id,action,entity,entity_id) values(p_org,auth.uid(),'membership.revoked','organisation_users',p_user);
 end if;
 update public.lifecycle_tasks set status='done',note=btrim(p_note),completed_at=now(),completed_by=auth.uid(),revoked_user_id=coalesce(p_user,revoked_user_id),version=version+1 where id=p_id;
 update public.lifecycle_cases set version=version+1 where id=v_case.id;
 insert into public.audit_log(organisation_id,user_id,action,entity,entity_id) values(p_org,auth.uid(),'lifecycle.access_checked','lifecycle_cases',v_case.id);
end $$;

create function public.close_lifecycle_case(p_org uuid,p_id uuid,p_version integer,p_status text,p_note text)
returns void language plpgsql security definer set search_path='' as $$
declare v_case public.lifecycle_cases;
begin
 perform private.require_documents_hr(p_org);
 select * into v_case from public.lifecycle_cases where organisation_id=p_org and id=p_id for update;
 if not found then raise exception 'Not found' using errcode='42501'; end if;
 if v_case.version is distinct from p_version then raise exception 'Stale' using errcode='P0006'; end if;
 if v_case.status<>'active' or p_status is null or p_status not in ('completed','cancelled') then raise exception 'Invalid state' using errcode='D0001'; end if;
 if p_note is null or length(p_note)>1000 or (p_status='cancelled' and length(btrim(p_note))<5) then raise exception 'Invalid note' using errcode='22023'; end if;
 if p_status='completed' then
   if exists(select 1 from public.lifecycle_tasks where case_id=p_id and status='todo') then raise exception 'Unfinished tasks' using errcode='D0005'; end if;
   if v_case.kind='offboarding' and exists(select 1 from public.employees e where e.id=v_case.employee_id and
     (e.user_id is not null or exists(select 1 from public.organisation_users m where m.organisation_id=p_org and
      (lower(m.email)=lower(e.email) or m.user_id in (select revoked_user_id from public.lifecycle_tasks where case_id=p_id))))) then
     raise exception 'Access still present' using errcode='D0004';
   end if;
 end if;
 update public.lifecycle_cases set status=p_status,close_note=btrim(p_note),closed_at=now(),version=version+1 where id=p_id;
 insert into public.audit_log(organisation_id,user_id,action,entity,entity_id,metadata) values(p_org,auth.uid(),'lifecycle.closed','lifecycle_cases',p_id,jsonb_build_object('status',p_status));
end $$;

revoke all on function private.require_documents_hr(uuid) from public,anon,authenticated;
revoke all on function private.document_object_read(text),private.document_object_insert(text) from public,anon,authenticated;
grant execute on function private.document_object_read(text),private.document_object_insert(text) to authenticated,anon;
revoke all on function public.prepare_employee_document(uuid,uuid,text,text,text,text,text,integer),public.complete_employee_document(uuid,uuid,integer),public.update_employee_document(uuid,uuid,integer,text,text),public.create_lifecycle_case(uuid,uuid,text,date),public.add_lifecycle_task(uuid,uuid,integer,text),public.update_lifecycle_task(uuid,uuid,integer,text,text),public.revoke_lifecycle_access(uuid,uuid,integer,uuid,text),public.close_lifecycle_case(uuid,uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.prepare_employee_document(uuid,uuid,text,text,text,text,text,integer),public.complete_employee_document(uuid,uuid,integer),public.update_employee_document(uuid,uuid,integer,text,text),public.create_lifecycle_case(uuid,uuid,text,date),public.add_lifecycle_task(uuid,uuid,integer,text),public.update_lifecycle_task(uuid,uuid,integer,text,text),public.revoke_lifecycle_access(uuid,uuid,integer,uuid,text),public.close_lifecycle_case(uuid,uuid,integer,text,text) to authenticated;

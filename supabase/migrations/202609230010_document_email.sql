create table public.document_deliveries (
 id uuid primary key default gen_random_uuid(),
 organisation_id uuid not null references public.organisations(id),
 document_id uuid not null references public.employee_documents(id),
 recipient text not null,
 status text not null default 'pending' check(status in ('pending','accepted','failed','uncertain')),
 requested_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 completed_at timestamptz
);
create unique index document_delivery_once on public.document_deliveries(document_id) where status in ('pending','accepted','uncertain');
create index document_delivery_tenant on public.document_deliveries(organisation_id,document_id);
alter table public.document_deliveries enable row level security;
create policy document_delivery_read on public.document_deliveries for select to authenticated using(private.is_hr(organisation_id));
revoke all on public.document_deliveries from public,anon,authenticated;
grant select on public.document_deliveries to authenticated;
create function public.prepare_document_email(p_org uuid,p_document uuid,p_version integer,p_recipient text) returns uuid language plpgsql security definer set search_path='' as $$
declare v_doc public.employee_documents;v_email text;v_id uuid;
begin
 perform private.require_documents_hr(p_org);
 select * into v_doc from public.employee_documents where organisation_id=p_org and id=p_document for update;
 if not found then raise exception 'Not found' using errcode='42501'; end if;
 if v_doc.version is distinct from p_version then raise exception 'Stale' using errcode='P0006'; end if;
 if v_doc.status in ('pending','archived') or v_doc.ready_at is null or v_doc.visibility<>'employee' then raise exception 'Document not shareable' using errcode='D0001'; end if;
 select email into v_email from public.employees where organisation_id=p_org and id=v_doc.employee_id;
 if lower(v_email) is distinct from lower(p_recipient) then raise exception 'Recipient changed' using errcode='P0006'; end if;
 insert into public.document_deliveries(organisation_id,document_id,recipient,requested_by) values(p_org,p_document,v_email,auth.uid()) returning id into v_id;
 insert into public.audit_log(organisation_id,user_id,action,entity,entity_id) values(p_org,auth.uid(),'document.email_requested','employee_documents',p_document);
 return v_id;
end $$;
create function public.finish_document_email(p_org uuid,p_id uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
declare v_doc uuid;
begin
 -- Recording an already-started attempt is permitted after suspension, but only
 -- for its original requester with a current HR role and an MFA-valid session.
 if not private.is_hr(p_org) then raise exception 'HR required' using errcode='42501'; end if;
 if p_status is null or p_status not in ('accepted','failed','uncertain') then raise exception 'Invalid result' using errcode='22023'; end if;
 update public.document_deliveries set status=p_status,completed_at=now()
 where organisation_id=p_org and id=p_id and status='pending' and requested_by=auth.uid() returning document_id into v_doc;
 if not found then raise exception 'Attempt unavailable' using errcode='42501'; end if;
 insert into public.audit_log(organisation_id,user_id,action,entity,entity_id,metadata) values(p_org,auth.uid(),'document.email_recorded','employee_documents',v_doc,jsonb_build_object('status',p_status));
end $$;
revoke all on function public.prepare_document_email(uuid,uuid,integer,text),public.finish_document_email(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.prepare_document_email(uuid,uuid,integer,text),public.finish_document_email(uuid,uuid,text) to authenticated;

-- Invitations confer employee access only after a verified matching account accepts.
-- The UUID is a reference, not an authentication token. No service-role key required.
create table public.employee_invitations (
 id uuid primary key default gen_random_uuid(),
 organisation_id uuid not null,
 employee_id uuid not null,
 email text not null,
 status text not null default 'pending' check(status in ('pending','accepted','revoked')),
 expires_at timestamptz not null default now()+interval '7 days',
 delivery_status text not null default 'unsent' check(delivery_status in ('unsent','sending','accepted','failed','uncertain')),
 attempt integer not null default 0,
 requested_by uuid references auth.users(id),
 sent_at timestamptz,
 accepted_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 foreign key(organisation_id,employee_id) references public.employees(organisation_id,id)
);
create unique index employee_invitation_pending on public.employee_invitations(organisation_id,employee_id) where status='pending';
alter table public.employee_invitations enable row level security;
create policy invitation_hr_read on public.employee_invitations for select to authenticated using(private.is_hr(organisation_id));
revoke all on public.employee_invitations from public,anon,authenticated;
grant select on public.employee_invitations to authenticated;

create function private.queue_employee_invitation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  if new.user_id is null and new.status in ('active','onboarding') then
   insert into public.employee_invitations(organisation_id,employee_id,email,requested_by) values(new.organisation_id,new.id,lower(new.email),auth.uid());
  end if;
 elsif lower(new.email) is distinct from lower(old.email) or new.user_id is distinct from old.user_id or new.status not in ('active','onboarding') then
  update public.employee_invitations set status='revoked' where organisation_id=new.organisation_id and employee_id=new.id and status='pending';
 end if;
 return new;
end $$;
create trigger employee_invitation_queue after insert or update on public.employees for each row execute function private.queue_employee_invitation();

create function public.prepare_employee_invitation(p_org uuid,p_employee uuid,p_renew boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_employee public.employees; v_invite public.employee_invitations;
begin
 perform private.require_documents_hr(p_org);
 select * into v_employee from public.employees where organisation_id=p_org and id=p_employee for update;
 if not found or v_employee.user_id is not null or v_employee.status not in ('active','onboarding') then raise exception 'Employee cannot be invited' using errcode='22023'; end if;
 select * into v_invite from public.employee_invitations where organisation_id=p_org and employee_id=p_employee and status='pending' for update;
 if v_invite.sent_at > now()-interval '1 minute' then raise exception 'Please wait before resending' using errcode='I0001'; end if;
 if v_invite.id is not null and not coalesce(p_renew,false) and (v_invite.delivery_status<>'unsent' or v_invite.expires_at<=now()) then raise exception 'Invitation already attempted' using errcode='I0001'; end if;
 if coalesce(p_renew,false) or v_invite.id is null then
  update public.employee_invitations set status='revoked' where id=v_invite.id;
  insert into public.employee_invitations(organisation_id,employee_id,email) values(p_org,p_employee,lower(v_employee.email)) returning * into v_invite;
 end if;
 update public.employee_invitations set delivery_status='sending',attempt=attempt+1,requested_by=auth.uid(),sent_at=now() where id=v_invite.id returning * into v_invite;
 insert into public.audit_log(organisation_id,user_id,action,entity,entity_id) values(p_org,auth.uid(),'invitation.requested','employees',p_employee);
 return to_jsonb(v_invite);
end $$;
create function public.finish_employee_invitation(p_org uuid,p_id uuid,p_attempt integer,p_status text)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_documents_hr(p_org);
 if p_status is null or p_status not in ('accepted','failed','uncertain') then raise exception 'Invalid delivery result' using errcode='22023'; end if;
 update public.employee_invitations set delivery_status=p_status where organisation_id=p_org and id=p_id and attempt=p_attempt and requested_by=auth.uid() and delivery_status='sending';
 if not found then raise exception 'Delivery changed' using errcode='P0006'; end if;
end $$;
create function public.revoke_employee_invitation(p_org uuid,p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare v_employee uuid;
begin
 perform private.require_documents_hr(p_org);
 update public.employee_invitations set status='revoked' where organisation_id=p_org and id=p_id and status='pending' returning employee_id into v_employee;
 if not found then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 insert into public.audit_log(organisation_id,user_id,action,entity,entity_id) values(p_org,auth.uid(),'invitation.revoked','employees',v_employee);
end $$;

create function public.my_employee_invitations()
returns table(id uuid,organisation_name text,expires_at timestamptz) language sql stable security definer set search_path='' as $$
 select i.id,o.name,i.expires_at from public.employee_invitations i
 join public.organisations o on o.id=i.organisation_id
 join public.employees e on e.organisation_id=i.organisation_id and e.id=i.employee_id
 join auth.users u on u.id=auth.uid() and u.email_confirmed_at is not null and lower(u.email)=i.email
 where private.session_meets_mfa() and i.status='pending' and i.expires_at>now() and o.status='active'
 and e.user_id is null and e.status in ('active','onboarding') and lower(e.email)=i.email order by i.created_at;
$$;
create function public.accept_employee_invitation(p_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare v_invite public.employee_invitations; v_employee public.employees; v_email text; v_role public.organisation_role;
begin
 if auth.uid() is null or not private.session_meets_mfa() then raise exception 'Verified session required' using errcode='42501'; end if;
 select * into v_invite from public.employee_invitations where id=p_id;
 if not found then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 -- Same lock order as HR changes; acceptance is atomic and single-use.
 perform 1 from public.organisations where id=v_invite.organisation_id and status='active' for update;
 if not found then raise exception 'Organisation unavailable' using errcode='42501'; end if;
 select * into v_employee from public.employees where organisation_id=v_invite.organisation_id and id=v_invite.employee_id for update;
 select * into v_invite from public.employee_invitations where id=p_id for update;
 select lower(email) into v_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if v_invite.status<>'pending' or v_invite.expires_at<=now() or v_email is distinct from v_invite.email
 or lower(v_employee.email) is distinct from v_email or v_employee.user_id is not null or v_employee.status not in ('active','onboarding') then
  raise exception 'Invitation unavailable for this account' using errcode='42501';
 end if;
 select role into v_role from public.organisation_users where organisation_id=v_invite.organisation_id and user_id=auth.uid();
 if v_role is not null and v_role<>'employee' then raise exception 'Existing role requires owner review' using errcode='I0002'; end if;
 if exists(select 1 from public.employees where organisation_id=v_invite.organisation_id and user_id=auth.uid()) then raise exception 'Account already linked' using errcode='I0002'; end if;
 if exists(select 1 from public.lifecycle_cases where organisation_id=v_invite.organisation_id and employee_id=v_invite.employee_id and kind='offboarding' and status='active') then raise exception 'Offboarding requires owner review' using errcode='I0002'; end if;
 insert into public.organisation_users(organisation_id,user_id,role,display_name,email)
 values(v_invite.organisation_id,auth.uid(),'employee',v_employee.first_name||' '||v_employee.last_name,v_email)
 on conflict(organisation_id,user_id) do nothing;
 update public.employee_invitations set status='accepted',accepted_by=auth.uid() where id=p_id;
 update public.employees set user_id=auth.uid() where organisation_id=v_invite.organisation_id and id=v_invite.employee_id;
 insert into public.audit_log(organisation_id,user_id,action,entity,entity_id) values(v_invite.organisation_id,auth.uid(),'invitation.accepted','employees',v_invite.employee_id);
 return v_invite.organisation_id;
end $$;
revoke all on function private.queue_employee_invitation() from public,anon,authenticated;
revoke all on function public.prepare_employee_invitation(uuid,uuid,boolean),public.finish_employee_invitation(uuid,uuid,integer,text),public.revoke_employee_invitation(uuid,uuid),public.my_employee_invitations(),public.accept_employee_invitation(uuid) from public,anon,authenticated;
grant execute on function public.prepare_employee_invitation(uuid,uuid,boolean),public.finish_employee_invitation(uuid,uuid,integer,text),public.revoke_employee_invitation(uuid,uuid),public.my_employee_invitations(),public.accept_employee_invitation(uuid) to authenticated;

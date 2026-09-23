-- Opt-in MFA: after enrollment, password-only sessions cannot access HR data.
create function private.session_meets_mfa() returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and (
    coalesce(auth.jwt()->>'aal','aal1')='aal2'
    or not exists(select 1 from auth.mfa_factors where user_id=auth.uid() and status='verified')
  );
$$;
revoke all on function private.session_meets_mfa() from public,anon,authenticated;
grant execute on function private.session_meets_mfa() to authenticated,anon;
create or replace function private.role_in(p_organisation_id uuid)
returns public.organisation_role language sql stable security definer set search_path='' as $$
 select role from public.organisation_users where organisation_id=p_organisation_id and user_id=auth.uid() and private.session_meets_mfa();
$$;
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path='' as $$
 select private.session_meets_mfa() and exists(select 1 from private.platform_admins where user_id=auth.uid());
$$;
-- Own membership reads otherwise bypass role_in; guard them too.
create policy memberships_mfa on public.organisation_users as restrictive for all to authenticated
using ((select private.session_meets_mfa())) with check ((select private.session_meets_mfa()));
create or replace function public.create_organisation(p_name text,p_cui text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_email text;v_name text;
begin
 if not private.session_meets_mfa() then raise exception 'Authentication or MFA required' using errcode='42501'; end if;
 select email,coalesce(nullif(raw_user_meta_data->>'full_name',''),email) into v_email,v_name from auth.users where id=auth.uid();
 insert into public.organisations(name,cui) values(trim(p_name),upper(trim(p_cui))) returning id into v_id;
 insert into public.organisation_users(organisation_id,user_id,role,display_name,email) values(v_id,auth.uid(),'organisation_owner',v_name,v_email);
 insert into public.audit_log(organisation_id,user_id,action,entity,entity_id) values(v_id,auth.uid(),'organisation.created','organisations',v_id);
 return v_id;
end $$;

create table public.reges_connections (
 organisation_id uuid primary key references public.organisations(id),
 employer_id uuid,
 author_id uuid,
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id),
 version integer not null default 1,
 check ((employer_id is null)=(author_id is null))
);
alter table public.reges_connections enable row level security;
create policy reges_read on public.reges_connections for select to authenticated using(private.is_hr(organisation_id));
revoke all on public.reges_connections from public,anon,authenticated;
grant select on public.reges_connections to authenticated;
create function public.save_reges_identifiers(p_org uuid,p_version integer,p_employer uuid,p_author uuid) returns void language plpgsql security definer set search_path='' as $$
declare v_version integer;
begin
 perform private.require_documents_hr(p_org);
 if private.role_in(p_org)<>'organisation_owner' then raise exception 'Owner required' using errcode='42501'; end if;
 select version into v_version from public.reges_connections where organisation_id=p_org for update;
 if v_version is distinct from p_version then raise exception 'Stale' using errcode='P0006'; end if;
 insert into public.reges_connections(organisation_id,employer_id,author_id,updated_by) values(p_org,p_employer,p_author,auth.uid())
 on conflict (organisation_id) do update set employer_id=excluded.employer_id,author_id=excluded.author_id,updated_by=auth.uid(),updated_at=now(),version=public.reges_connections.version+1;
 insert into public.audit_log(organisation_id,user_id,action,entity,entity_id) values(p_org,auth.uid(),'reges.prepared','reges_connections',p_org);
end $$;
revoke all on function public.save_reges_identifiers(uuid,integer,uuid,uuid) from public,anon,authenticated;
grant execute on function public.save_reges_identifiers(uuid,integer,uuid,uuid) to authenticated;

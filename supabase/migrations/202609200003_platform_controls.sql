-- Platform operations are explicit RPCs, never a tenant HR permission bypass.
create type public.organisation_status as enum ('active', 'suspended', 'blocked');
-- The optional VAT prefix does not identify a different legal company.
create unique index organisations_cui_unique on public.organisations (regexp_replace(cui, '^RO', ''));
create index organisations_created_idx on public.organisations (created_at desc, id);
alter table public.organisations
  add column status public.organisation_status not null default 'active',
  add column status_reason text check (length(status_reason) between 5 and 500),
  add column status_changed_at timestamptz,
  add column status_changed_by uuid references auth.users(id) on delete set null,
  add column registration_number text check (length(registration_number) <= 80),
  add column registered_address text check (length(registered_address) <= 300),
  add column city text check (length(city) <= 100),
  add column county text check (length(county) <= 100),
  add column contact_name text check (length(contact_name) <= 160),
  add column contact_email text check (length(contact_email) <= 254 and contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  add column contact_phone text check (length(contact_phone) <= 30),
  add column version bigint not null default 1;

create function private.organisation_status(p_id uuid)
returns public.organisation_status language sql stable security definer set search_path = '' as $$
  select status from public.organisations where id = p_id;
$$;
revoke all on function private.organisation_status(uuid) from public, anon;
grant execute on function private.organisation_status(uuid) to authenticated;

-- Keep a member's own membership and organisation metadata readable for switching
-- workspaces and explaining restrictions, but deny blocked HR data and RPCs.
create or replace function private.is_hr(p_organisation_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.role_in(p_organisation_id) in ('organisation_owner', 'hr_manager')
    and private.organisation_status(p_organisation_id) <> 'blocked', false);
$$;
create or replace function private.can_read_employee(p_organisation_id uuid, p_employee_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.organisation_status(p_organisation_id) <> 'blocked' and (
    private.is_hr(p_organisation_id) or exists (
      select 1 from public.employees e where e.organisation_id = p_organisation_id and e.id = p_employee_id
      and private.role_in(p_organisation_id) is not null
      and (e.user_id = (select auth.uid()) or
        (private.role_in(p_organisation_id) = 'manager' and e.manager_user_id = (select auth.uid())))
    )
  );
$$;
create or replace function private.owns_employee(p_organisation_id uuid, p_employee_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.organisation_status(p_organisation_id) <> 'blocked' and exists (
    select 1 from public.employees where organisation_id = p_organisation_id and id = p_employee_id
    and user_id = (select auth.uid()) and private.role_in(p_organisation_id) is not null);
$$;

create policy organisations_active_update on public.organisations as restrictive for update to authenticated
  using (status = 'active') with check (status = 'active');
create policy employees_active_insert on public.employees as restrictive for insert to authenticated
  with check (private.organisation_status(organisation_id) = 'active');
create policy employees_active_update on public.employees as restrictive for update to authenticated
  using (private.organisation_status(organisation_id) = 'active') with check (private.organisation_status(organisation_id) = 'active');
create policy contracts_active_insert on public.employment_contracts as restrictive for insert to authenticated
  with check (private.organisation_status(organisation_id) = 'active');
create policy contracts_active_update on public.employment_contracts as restrictive for update to authenticated
  using (private.organisation_status(organisation_id) = 'active') with check (private.organisation_status(organisation_id) = 'active');

-- Also covers SECURITY DEFINER membership/account-link writes. Row locks make a
-- concurrent suspension wait for an already-started write to finish.
create function private.guard_organisation_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_status public.organisation_status;
begin
  select status into v_status from public.organisations where id = new.organisation_id for share;
  if v_status is distinct from 'active' then
    raise exception 'Organisation is not active' using errcode = 'P0004';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_organisation_write() from public, anon, authenticated;
create trigger employees_access_guard before insert or update on public.employees for each row execute function private.guard_organisation_write();
create trigger contracts_access_guard before insert or update on public.employment_contracts for each row execute function private.guard_organisation_write();
create trigger memberships_access_guard before insert or update on public.organisation_users for each row execute function private.guard_organisation_write();

create function private.organisation_version()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$;
revoke all on function private.organisation_version() from public, anon, authenticated;
create trigger organisation_version before update on public.organisations for each row execute function private.organisation_version();

create or replace function private.audit_organisation_update()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_fields jsonb; v_metadata jsonb; v_action text;
begin
  select coalesce(jsonb_agg(n.key order by n.key), '[]'::jsonb) into v_fields
    from jsonb_each(to_jsonb(new)) n
    where n.key not in ('version','status_changed_at','status_changed_by') and n.value is distinct from to_jsonb(old)->n.key;
  if v_fields = '[]'::jsonb then return new; end if;
  v_action := 'organisation.updated';
  v_metadata := jsonb_build_object('changed_fields', v_fields);
  if new.status is distinct from old.status then
    v_action := 'organisation.status_changed';
    v_metadata := v_metadata || jsonb_build_object('from_status', old.status, 'to_status', new.status, 'reason', new.status_reason);
  end if;
  insert into public.audit_log(organisation_id, user_id, action, entity, entity_id, metadata)
    values(new.id, auth.uid(), v_action, 'organisations', new.id, v_metadata);
  return new;
end;
$$;

create function public.platform_save_organisation(p_id uuid, p_version bigint, p_details jsonb, p_owner_email text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_owner uuid; v_email text; v_name text; v_version bigint;
begin
  if not public.is_platform_admin() then raise exception 'Platform access required' using errcode = '42501'; end if;
  if p_details is null or jsonb_typeof(p_details) <> 'object' or exists (
    select 1 from jsonb_object_keys(p_details) k where k not in
      ('name','cui','registration_number','registered_address','city','county','contact_name','contact_email','contact_phone')
  ) then raise exception 'Invalid organisation details' using errcode = '22023'; end if;
  if p_id is null then
    select id, email, coalesce(nullif(raw_user_meta_data->>'full_name',''), email) into v_owner, v_email, v_name
      from auth.users where lower(email) = lower(trim(p_owner_email)) and email_confirmed_at is not null;
    if v_owner is null then raise exception 'A confirmed account is required' using errcode = 'P0001'; end if;
    insert into public.organisations(name, cui) values (trim(p_details->>'name'), upper(trim(p_details->>'cui'))) returning id into v_id;
    insert into public.organisation_users(organisation_id, user_id, role, display_name, email)
      values (v_id, v_owner, 'organisation_owner', v_name, v_email);
    insert into public.audit_log(organisation_id, user_id, action, entity, entity_id, metadata)
      values (v_id, auth.uid(), 'organisation.created', 'organisations', v_id, jsonb_build_object('owner_user_id', v_owner));
  else
    select version into v_version from public.organisations where id = p_id for update;
    if not found then raise exception 'Organisation not found' using errcode = 'P0005'; end if;
    if p_version is distinct from v_version then raise exception 'Organisation changed; refresh before saving' using errcode = 'P0006'; end if;
    v_id := p_id;
  end if;
  update public.organisations set
    name = trim(p_details->>'name'), cui = upper(trim(p_details->>'cui')),
    registration_number = nullif(trim(p_details->>'registration_number'), ''),
    registered_address = nullif(trim(p_details->>'registered_address'), ''),
    city = nullif(trim(p_details->>'city'), ''), county = nullif(trim(p_details->>'county'), ''),
    contact_name = nullif(trim(p_details->>'contact_name'), ''),
    contact_email = nullif(lower(trim(p_details->>'contact_email')), ''),
    contact_phone = nullif(trim(p_details->>'contact_phone'), '')
    where id = v_id;
  return v_id;
end;
$$;

create function public.platform_set_organisation_status(p_id uuid, p_version bigint, p_status public.organisation_status, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org public.organisations;
begin
  if not public.is_platform_admin() then raise exception 'Platform access required' using errcode = '42501'; end if;
  if p_status is null or p_reason is null or length(trim(p_reason)) not between 5 and 500 then
    raise exception 'A reason of 5 to 500 characters is required' using errcode = '22023';
  end if;
  select * into v_org from public.organisations where id = p_id for update;
  if not found then raise exception 'Organisation not found' using errcode = 'P0005'; end if;
  if p_version is distinct from v_org.version then raise exception 'Organisation changed; refresh before saving' using errcode = 'P0006'; end if;
  if p_status = v_org.status then raise exception 'Status is unchanged' using errcode = '22023'; end if;
  update public.organisations set status = p_status, status_reason = trim(p_reason), status_changed_at = now(), status_changed_by = auth.uid() where id = p_id;
end;
$$;

create function public.platform_organisation_list(p_search text default '', p_status text default '', p_page integer default 1)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not public.is_platform_admin() then raise exception 'Platform access required' using errcode = '42501'; end if;
  if p_page is null or p_page < 1 or p_page > 100000 or p_status is null or p_status not in ('','active','suspended','blocked')
    or p_search is null or length(p_search) > 100 then raise exception 'Invalid filters' using errcode = '22023'; end if;
  with filtered as (
    select o.* from public.organisations o
    where (p_status = '' or o.status::text = p_status)
      and (p_search = '' or position(lower(p_search) in lower(o.name || ' ' || o.cui)) > 0)
  ), page as (
    select * from filtered order by created_at desc, id limit 25 offset (p_page - 1) * 25
  )
  select jsonb_build_object('total', (select count(*) from filtered), 'organisations', coalesce((
    select jsonb_agg(to_jsonb(o) || jsonb_build_object(
      'employee_count', (select count(*) from public.employees e where e.organisation_id = o.id),
      'member_count', (select count(*) from public.organisation_users m where m.organisation_id = o.id),
      'owners', (select coalesce(jsonb_agg(m.email order by m.email), '[]'::jsonb) from public.organisation_users m where m.organisation_id = o.id and m.role = 'organisation_owner'),
      'history', (select coalesce(jsonb_agg(h order by h.created_at desc, h.id), '[]'::jsonb) from (
        select a.id, a.action, a.user_id, a.metadata, a.created_at from public.audit_log a
          where a.organisation_id = o.id and a.entity = 'organisations' order by a.created_at desc, a.id limit 10
      ) h)
    ) order by o.created_at desc, o.id) from page o
  ), '[]'::jsonb)) into v_result;
  return v_result;
end;
$$;

revoke all on function public.platform_save_organisation(uuid, bigint, jsonb, text), public.platform_set_organisation_status(uuid, bigint, public.organisation_status, text), public.platform_organisation_list(text, text, integer) from public, anon;
grant execute on function public.platform_save_organisation(uuid, bigint, jsonb, text), public.platform_set_organisation_status(uuid, bigint, public.organisation_status, text), public.platform_organisation_list(text, text, integer) to authenticated;

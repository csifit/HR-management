-- Echipă HR: tenant boundaries are enforced by PostgreSQL, including direct API access.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create type public.organisation_role as enum ('organisation_owner', 'hr_manager', 'manager', 'employee');
create type public.employee_status as enum ('active', 'onboarding', 'suspended', 'terminated');
create type public.contract_status as enum ('draft', 'active', 'suspended', 'terminated');
create type public.contract_type as enum ('indefinite', 'fixed_term');

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 160),
  cui text not null check (cui ~ '^(RO)?[0-9]{2,10}$'),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.organisation_users (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  role public.organisation_role not null default 'employee',
  display_name text not null,
  email text not null,
  created_at timestamptz not null default now(),
  primary key (organisation_id, user_id)
);
create index organisation_users_user_idx on public.organisation_users(user_id);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  user_id uuid,
  first_name text not null check (length(trim(first_name)) between 1 and 80),
  last_name text not null check (length(trim(last_name)) between 1 and 80),
  email text not null check (length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
  phone text check (length(phone) <= 30),
  job_title text not null check (length(trim(job_title)) between 2 and 120),
  department text not null check (length(trim(department)) between 1 and 100),
  workplace text not null default 'București' check (length(trim(workplace)) between 1 and 160),
  start_date date not null,
  status public.employee_status not null default 'onboarding',
  manager_user_id uuid,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, id),
  unique (organisation_id, user_id),
  foreign key (organisation_id, user_id) references public.organisation_users(organisation_id, user_id),
  foreign key (organisation_id, manager_user_id) references public.organisation_users(organisation_id, user_id),
  check (user_id is null or manager_user_id is null or user_id <> manager_user_id)
);
create unique index employees_email_idx on public.employees(organisation_id, lower(email));
create index employees_manager_idx on public.employees(organisation_id, manager_user_id);
create index employees_status_idx on public.employees(organisation_id, status);

create table public.employment_contracts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  employee_id uuid not null,
  contract_number text not null check (length(trim(contract_number)) between 1 and 80),
  start_date date not null,
  end_date date,
  job_title text not null check (length(trim(job_title)) between 2 and 120),
  cor_code text not null check (cor_code ~ '^[0-9]{6}$'),
  contract_type public.contract_type not null default 'indefinite',
  working_hours numeric(4,2) not null default 8 check (working_hours > 0 and working_hours <= 24),
  workplace text not null check (length(trim(workplace)) between 1 and 160),
  gross_salary numeric(12,2) not null check (gross_salary > 0),
  currency text not null default 'RON' check (currency = 'RON'),
  probation_days integer not null default 0 check (probation_days between 0 and 365),
  status public.contract_status not null default 'draft',
  -- Future addenda can link to the original contract without changing the core identity.
  parent_contract_id uuid,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, id),
  unique (organisation_id, employee_id, id),
  unique (organisation_id, contract_number),
  foreign key (organisation_id, employee_id) references public.employees(organisation_id, id),
  foreign key (organisation_id, employee_id, parent_contract_id) references public.employment_contracts(organisation_id, employee_id, id),
  check (parent_contract_id is null or parent_contract_id <> id),
  check (end_date is null or end_date >= start_date),
  check ((contract_type = 'fixed_term' and end_date is not null) or (contract_type = 'indefinite' and end_date is null))
);
create index contracts_employee_idx on public.employment_contracts(organisation_id, employee_id);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_organisation_idx on public.audit_log(organisation_id, created_at desc);
create index audit_log_entity_idx on public.audit_log(organisation_id, entity_id);

-- Provision platform administrators only through a trusted SQL/operator session.
-- Platform administration does not bypass employee or contract tenant policies.
create table private.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
revoke all on private.platform_admins from public, anon, authenticated;

create function private.role_in(p_organisation_id uuid)
returns public.organisation_role language sql stable security definer set search_path = '' as $$
  select role from public.organisation_users where organisation_id = p_organisation_id and user_id = (select auth.uid());
$$;
create function private.is_hr(p_organisation_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.role_in(p_organisation_id) in ('organisation_owner', 'hr_manager'), false);
$$;
create function private.can_read_employee(p_organisation_id uuid, p_employee_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_hr(p_organisation_id) or exists (
    select 1 from public.employees e where e.organisation_id = p_organisation_id and e.id = p_employee_id
    and private.role_in(p_organisation_id) is not null
    and (e.user_id = (select auth.uid()) or
      (private.role_in(p_organisation_id) = 'manager' and e.manager_user_id = (select auth.uid())))
  );
$$;
create function private.owns_employee(p_organisation_id uuid, p_employee_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.employees where organisation_id = p_organisation_id and id = p_employee_id
    and user_id = (select auth.uid()) and private.role_in(p_organisation_id) is not null);
$$;

alter table public.organisations enable row level security;
alter table public.organisation_users enable row level security;
alter table public.employees enable row level security;
alter table public.employment_contracts enable row level security;
alter table public.audit_log enable row level security;
alter table private.platform_admins enable row level security;

create policy organisations_read on public.organisations for select to authenticated using (private.role_in(id) is not null);
create policy organisations_update on public.organisations for update to authenticated using (private.role_in(id) = 'organisation_owner') with check (private.role_in(id) = 'organisation_owner');
create policy memberships_read on public.organisation_users for select to authenticated using (user_id = (select auth.uid()) or private.is_hr(organisation_id));
create policy employees_read on public.employees for select to authenticated using (private.can_read_employee(organisation_id, id));
create policy employees_insert on public.employees for insert to authenticated with check (private.is_hr(organisation_id));
create policy employees_update on public.employees for update to authenticated using (private.is_hr(organisation_id)) with check (private.is_hr(organisation_id));
create policy contracts_read on public.employment_contracts for select to authenticated using (private.is_hr(organisation_id) or private.owns_employee(organisation_id, employee_id));
create policy contracts_insert on public.employment_contracts for insert to authenticated with check (private.is_hr(organisation_id));
create policy contracts_update on public.employment_contracts for update to authenticated using (private.is_hr(organisation_id)) with check (private.is_hr(organisation_id));
create policy audit_read on public.audit_log for select to authenticated using (private.is_hr(organisation_id));

-- Narrow column grants prevent moving rows between organisations or forging audit authors.
revoke all on public.organisations, public.organisation_users, public.employees, public.employment_contracts, public.audit_log from anon, authenticated;
grant select on public.organisations, public.organisation_users, public.employees, public.employment_contracts, public.audit_log to authenticated;
grant update (name, cui) on public.organisations to authenticated;
grant insert (organisation_id, first_name, last_name, email, phone, job_title, department, workplace, start_date, status, manager_user_id)
  on public.employees to authenticated;
grant update (first_name, last_name, email, phone, job_title, department, workplace, start_date, status, manager_user_id)
  on public.employees to authenticated;
grant insert (organisation_id, employee_id, contract_number, start_date, end_date, job_title, cor_code, contract_type, working_hours, workplace, gross_salary, probation_days, status, parent_contract_id)
  on public.employment_contracts to authenticated;
grant update (contract_number, start_date, end_date, job_title, cor_code, contract_type, working_hours, workplace, gross_salary, probation_days, status)
  on public.employment_contracts to authenticated;

create function private.audit_record()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_entity uuid; v_action text; v_fields jsonb;
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  v_org := new.organisation_id;
  v_entity := new.id;
  v_action := case when tg_table_name = 'employees' then 'employee' else 'contract' end
    || case when tg_op = 'INSERT' then '.created' else '.updated' end;
  if tg_op = 'UPDATE' then
    select coalesce(jsonb_agg(n.key), '[]'::jsonb) into v_fields from jsonb_each(to_jsonb(new)) n
      where n.key <> 'updated_at' and n.value is distinct from to_jsonb(old)->n.key;
    if tg_table_name = 'employment_contracts' and to_jsonb(new)->'gross_salary' is distinct from to_jsonb(old)->'gross_salary' then
      v_action := 'salary.changed';
    end if;
  else v_fields := '[]'::jsonb; end if;
  insert into public.audit_log(organisation_id, user_id, action, entity, entity_id, metadata)
    values (v_org, auth.uid(), v_action, tg_table_name, v_entity, jsonb_build_object('changed_fields', v_fields));
  return new;
end;
$$;
create trigger employees_audit before insert or update on public.employees for each row execute function private.audit_record();
create trigger contracts_audit before insert or update on public.employment_contracts for each row execute function private.audit_record();

create function public.create_organisation(p_name text, p_cui text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_email text; v_name text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select email, coalesce(nullif(raw_user_meta_data->>'full_name',''), email) into v_email, v_name from auth.users where id = auth.uid();
  insert into public.organisations(name, cui) values (trim(p_name), upper(trim(p_cui))) returning id into v_id;
  insert into public.organisation_users(organisation_id, user_id, role, display_name, email)
    values (v_id, auth.uid(), 'organisation_owner', v_name, v_email);
  insert into public.audit_log(organisation_id, user_id, action, entity, entity_id)
    values (v_id, auth.uid(), 'organisation.created', 'organisations', v_id);
  return v_id;
end;
$$;

create function public.set_organisation_member(p_organisation_id uuid, p_email text, p_role public.organisation_role, p_employee_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_name text; v_email text; v_old_role public.organisation_role;
begin
  -- Serialize role changes so two owners cannot simultaneously remove the last owner.
  perform 1 from public.organisations where id = p_organisation_id for update;
  if private.role_in(p_organisation_id) is distinct from 'organisation_owner' then
    raise exception 'Owner access required' using errcode = '42501';
  end if;
  select id, email, coalesce(nullif(raw_user_meta_data->>'full_name',''), email) into v_user, v_email, v_name
    from auth.users where lower(email) = lower(trim(p_email)) and email_confirmed_at is not null;
  if v_user is null then raise exception 'A confirmed account is required' using errcode = 'P0001'; end if;
  select role into v_old_role from public.organisation_users where organisation_id = p_organisation_id and user_id = v_user;
  if v_old_role = 'organisation_owner' and p_role <> 'organisation_owner' and
    (select count(*) from public.organisation_users where organisation_id = p_organisation_id and role = 'organisation_owner') <= 1 then
    raise exception 'The organisation needs an owner' using errcode = 'P0002';
  end if;
  insert into public.organisation_users(organisation_id, user_id, role, display_name, email)
    values (p_organisation_id, v_user, p_role, v_name, v_email)
    on conflict (organisation_id, user_id) do update set role = excluded.role, display_name = excluded.display_name, email = excluded.email;
  if p_employee_id is not null then
    update public.employees set user_id = v_user where organisation_id = p_organisation_id and id = p_employee_id
      and (user_id is null or user_id = v_user);
    if not found then raise exception 'Employee cannot be linked' using errcode = 'P0003'; end if;
  end if;
  insert into public.audit_log(organisation_id, user_id, action, entity, entity_id, metadata)
    values (p_organisation_id, auth.uid(), 'membership.updated', 'organisation_users', v_user, jsonb_build_object('role', p_role));
end;
$$;

create function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from private.platform_admins where user_id = (select auth.uid()));
$$;
create function public.platform_organisations()
returns table(id uuid, name text, cui text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'Platform access required' using errcode = '42501'; end if;
  return query select o.id, o.name, o.cui, o.created_at from public.organisations o order by o.created_at desc;
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.role_in(uuid), private.is_hr(uuid), private.can_read_employee(uuid, uuid), private.owns_employee(uuid, uuid) to authenticated;
revoke all on function public.create_organisation(text, text), public.set_organisation_member(uuid, text, public.organisation_role, uuid), public.is_platform_admin(), public.platform_organisations() from public, anon;
grant execute on function public.create_organisation(text, text), public.set_organisation_member(uuid, text, public.organisation_role, uuid), public.is_platform_admin(), public.platform_organisations() to authenticated;

create function private.audit_organisation_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log(organisation_id, user_id, action, entity, entity_id)
    values(new.id, auth.uid(), 'organisation.updated', 'organisations', new.id);
  return new;
end;
$$;
revoke all on function private.audit_organisation_update() from public, anon, authenticated;
create trigger organisations_audit after update on public.organisations for each row execute function private.audit_organisation_update();

-- These read-only aggregates execute as the caller and retain all underlying RLS.
create function public.dashboard_summary(p_organisation_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'total', (select count(*) from public.employees where organisation_id = p_organisation_id),
    'active', (select count(*) from public.employees where organisation_id = p_organisation_id and status = 'active'),
    'starting', (select count(*) from public.employees where organisation_id = p_organisation_id and status in ('active','onboarding') and start_date between (now() at time zone 'Europe/Bucharest')::date and (now() at time zone 'Europe/Bucharest')::date + 30),
    'ending', (select count(*) from public.employment_contracts where organisation_id = p_organisation_id and status = 'active' and end_date between (now() at time zone 'Europe/Bucharest')::date and (now() at time zone 'Europe/Bucharest')::date + 30),
    'drafts', (select count(*) from public.employment_contracts where organisation_id = p_organisation_id and status = 'draft'),
    'departments', (select coalesce(jsonb_agg(t order by t.count desc), '[]'::jsonb) from (select department, count(*) as count from public.employees where organisation_id = p_organisation_id and status <> 'terminated' group by department) t)
  );
$$;
create function public.employee_departments(p_organisation_id uuid)
returns table(department text) language sql stable security invoker set search_path = '' as $$
  select distinct e.department from public.employees e where organisation_id = p_organisation_id order by e.department;
$$;
revoke all on function public.dashboard_summary(uuid), public.employee_departments(uuid) from public, anon;
grant execute on function public.dashboard_summary(uuid), public.employee_departments(uuid) to authenticated;

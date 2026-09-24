-- Effective-dated weekday schedules. Earlier dates retain their previous rules.
create table public.work_schedules (
 id uuid primary key default gen_random_uuid(),
 organisation_id uuid not null references public.organisations(id) on delete cascade,
 employee_id uuid,
 effective_from date not null check(effective_from between '2000-01-01' and '2200-12-31'),
 weekdays integer[], -- ISO weekdays 1=Monday ... 7=Sunday; NULL means inherit.
 version bigint not null default 1,
 updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),
 foreign key(organisation_id,employee_id) references public.employees(organisation_id,id) on delete cascade,
 check(employee_id is not null or weekdays is not null),
 check(weekdays is null or (cardinality(weekdays) between 1 and 7 and array_ndims(weekdays)=1
   and weekdays <@ array[1,2,3,4,5,6,7] and array_position(weekdays,null) is null))
);
create unique index work_schedule_organisation_date on public.work_schedules(organisation_id,effective_from) where employee_id is null;
create unique index work_schedule_employee_date on public.work_schedules(organisation_id,employee_id,effective_from) where employee_id is not null;
alter table public.work_schedules enable row level security;
revoke all on public.work_schedules from public,anon,authenticated;
grant select on public.work_schedules to authenticated;
create policy work_schedule_read on public.work_schedules for select to authenticated using (
 private.organisation_status(organisation_id)<>'blocked' and
 ((employee_id is null and private.role_in(organisation_id) is not null) or private.can_read_employee(organisation_id,employee_id))
);

create function private.scheduled_weekdays(p_org uuid,p_employee uuid,p_day date)
returns integer[] language sql stable security definer set search_path='' as $$
 select coalesce(
   (select weekdays from public.work_schedules where organisation_id=p_org and employee_id=p_employee and effective_from<=p_day order by effective_from desc limit 1),
   (select weekdays from public.work_schedules where organisation_id=p_org and employee_id is null and effective_from<=p_day order by effective_from desc limit 1),
   array[1,2,3,4,5]);
$$;
create function private.is_working_day(p_org uuid,p_employee uuid,p_day date)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select is_working from public.work_calendar_days where organisation_id=p_org and day=p_day),
   extract(isodow from p_day)::integer=any(private.scheduled_weekdays(p_org,p_employee,p_day)));
$$;
create or replace function private.is_working_day(p_org uuid,p_day date)
returns boolean language sql stable security definer set search_path='' as $$
 select private.is_working_day(p_org,null,p_day);
$$;

create function public.save_work_schedule(p_org uuid,p_employee uuid,p_effective_from date,p_weekdays integer[],p_version bigint default null)
returns void language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_version bigint; v_weekdays integer[];
begin
 perform private.lock_time_organisation(p_org);
 if not private.is_hr(p_org) then raise exception 'HR access required' using errcode='42501'; end if;
 if p_employee is not null and not exists(select 1 from public.employees where organisation_id=p_org and id=p_employee) then
   raise exception 'Employee not found' using errcode='P0005'; end if;
 if p_effective_from is null or p_effective_from<(now() at time zone 'Europe/Bucharest')::date or p_effective_from>'2200-12-31' then
   raise exception 'Schedule must start today or later' using errcode='S0001'; end if;
 if p_weekdays is null then
   if p_employee is null then raise exception 'Organisation weekdays required' using errcode='22023'; end if;
 else
   if cardinality(p_weekdays) not between 1 and 7 or array_ndims(p_weekdays)<>1 or array_position(p_weekdays,null) is not null
     or not p_weekdays <@ array[1,2,3,4,5,6,7] then raise exception 'Invalid weekdays' using errcode='22023'; end if;
   select array_agg(distinct d order by d) into v_weekdays from unnest(p_weekdays) d;
   if cardinality(v_weekdays)<>cardinality(p_weekdays) then raise exception 'Duplicate weekdays' using errcode='22023'; end if;
 end if;
 select id,version into v_id,v_version from public.work_schedules where organisation_id=p_org
   and employee_id is not distinct from p_employee and effective_from=p_effective_from;
 if v_version is distinct from p_version then raise exception 'Schedule changed; refresh' using errcode='P0006'; end if;
 if v_id is null then
   insert into public.work_schedules(organisation_id,employee_id,effective_from,weekdays,updated_by)
     values(p_org,p_employee,p_effective_from,v_weekdays,auth.uid()) returning id into v_id;
 else
   update public.work_schedules set weekdays=v_weekdays,version=version+1,updated_by=auth.uid(),updated_at=now() where id=v_id;
 end if;
 -- Keep saved leave dates and balances consistent, including days previously off.
 if exists(select 1 from public.leave_requests r
   cross join lateral generate_series(0,r.end_date-r.start_date) n
   where r.organisation_id=p_org and r.status in ('pending','approved')
     and (p_employee is null or r.employee_id=p_employee) and r.end_date>=p_effective_from and r.start_date+n>=p_effective_from
     and private.is_working_day(p_org,r.employee_id,r.start_date+n) is distinct from (r.start_date+n=any(r.work_dates))) then
   raise exception 'Schedule conflicts with leave; cancel and resubmit first' using errcode='L0002'; end if;
 insert into public.audit_log(organisation_id,user_id,action,entity,entity_id,metadata)
   values(p_org,auth.uid(),'calendar.schedule_updated','work_schedules',v_id,
     jsonb_build_object('employee_id',p_employee,'effective_from',p_effective_from,'weekdays',v_weekdays));
end;
$$;

-- A company date exception takes precedence over every employee's schedule.
create or replace function public.save_calendar_day(p_org uuid,p_day date,p_working boolean,p_label text)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.lock_time_organisation(p_org);
 if not private.is_hr(p_org) then raise exception 'HR access required' using errcode='42501'; end if;
 if p_day is null or p_working is null then raise exception 'Date and work status required' using errcode='22023'; end if;
 if exists(select 1 from public.leave_requests where organisation_id=p_org and status in ('pending','approved')
   and p_day between start_date and end_date and p_working is distinct from (p_day=any(work_dates))) then
   raise exception 'Calendar date used by leave; cancel and resubmit first' using errcode='L0002'; end if;
 insert into public.work_calendar_days(organisation_id,day,is_working,label) values(p_org,p_day,p_working,trim(p_label))
   on conflict(organisation_id,day) do update set is_working=excluded.is_working,label=excluded.label;
end;
$$;

-- Payroll v2's daily-hours ratio assumes a five-day Monday-Friday contract.
create function public.payroll_standard_schedule(p_org uuid,p_employee uuid,p_month date)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_hr(p_org) or not coalesce(private.can_read_employee(p_org,p_employee),false) then
   raise exception 'HR access required' using errcode='42501'; end if;
 if p_month is null or p_month<'2000-01-01' or p_month>'2200-12-31' then raise exception 'Invalid month' using errcode='22023'; end if;
 return not exists(select 1 from generate_series(0,(date_trunc('month',p_month)+interval '1 month - 1 day')::date-date_trunc('month',p_month)::date) n
   where private.scheduled_weekdays(p_org,p_employee,date_trunc('month',p_month)::date+n)<>array[1,2,3,4,5]);
end;
$$;
revoke all on function private.scheduled_weekdays(uuid,uuid,date),private.is_working_day(uuid,uuid,date) from public,anon,authenticated;
revoke all on function public.save_work_schedule(uuid,uuid,date,integer[],bigint),public.payroll_standard_schedule(uuid,uuid,date) from public,anon,authenticated;
grant execute on function public.save_work_schedule(uuid,uuid,date,integer[],bigint),public.payroll_standard_schedule(uuid,uuid,date) to authenticated;
create or replace function public.request_leave(p_org uuid,p_employee uuid,p_type uuid,p_start date,p_end date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_dates date[]; v_type public.leave_types; v_employee public.employees; v_allowance integer; v_reserved integer; v_id uuid;
begin
  perform private.lock_time_organisation(p_org);
  if not (private.is_hr(p_org) or private.owns_employee(p_org,p_employee)) then raise exception 'Employee or HR access required' using errcode='42501'; end if;
  select * into v_employee from public.employees where organisation_id=p_org and id=p_employee;
  if not found then raise exception 'Record not found' using errcode='P0005'; end if;
  if v_employee.status not in ('active','onboarding') then raise exception 'Employee is inactive' using errcode='L0003'; end if;
  if p_start is null or p_end is null or p_start < '2000-01-01' or p_end > '2200-12-31' or p_end < p_start
    or extract(year from p_start) <> extract(year from p_end) or p_start < v_employee.start_date then
    raise exception 'Invalid leave dates; use one calendar year' using errcode='22023'; end if;
  select * into v_type from public.leave_types where organisation_id=p_org and id=p_type and active;
  if not found then raise exception 'Record not found' using errcode='P0005'; end if;
  select array_agg(p_start + n order by n) into v_dates from generate_series(0,p_end-p_start) n where private.is_working_day(p_org,p_employee,p_start+n);
  if v_dates is null then raise exception 'No working days selected' using errcode='L0004'; end if;
  if exists(select 1 from public.leave_requests where organisation_id=p_org and employee_id=p_employee and status in ('pending','approved') and work_dates && v_dates) then
    raise exception 'Overlapping leave' using errcode='L0005'; end if;
  if v_type.deducts_balance then
    select allowance into v_allowance from public.leave_balances where organisation_id=p_org and employee_id=p_employee and leave_type_id=p_type and year=extract(year from p_start);
    if v_allowance is null then raise exception 'Allowance not configured' using errcode='L0006'; end if;
    select coalesce(sum(days),0) into v_reserved from public.leave_requests where organisation_id=p_org and employee_id=p_employee and leave_type_id=p_type
      and extract(year from start_date)=extract(year from p_start) and status in ('pending','approved');
    if v_reserved + cardinality(v_dates) > v_allowance then raise exception 'Insufficient leave balance' using errcode='L0001'; end if;
  end if;
  insert into public.leave_requests(organisation_id,employee_id,leave_type_id,start_date,end_date,work_dates,submitted_by)
    values(p_org,p_employee,p_type,p_start,p_end,v_dates,auth.uid()) returning id into v_id;
  return v_id;
end;
$$;
create or replace function public.attendance_month(p_org uuid,p_employee uuid,p_month date)
returns table(day date,planned_hours numeric,worked_hours numeric,category text,recorded boolean,version bigint,leave_request_id uuid)
language plpgsql stable security definer set search_path='' as $$
declare v_employee public.employees; v_end date; v_today date:=(now() at time zone 'Europe/Bucharest')::date;
begin
 if not coalesce(private.can_read_employee(p_org,p_employee),false) then raise exception 'Employee access required' using errcode='42501'; end if;
 if p_month is null or p_month<'2000-01-01' or p_month>'2200-12-31' then raise exception 'Invalid month' using errcode='22023'; end if;
 select * into v_employee from public.employees where organisation_id=p_org and id=p_employee;
 if not found then raise exception 'Record not found' using errcode='P0005'; end if;
 v_end:=(date_trunc('month',p_month)+interval '1 month - 1 day')::date;
 return query select d.day,
  case when d.day<v_employee.start_date then 0 else coalesce(a.planned_hours,case when l.id is not null or private.is_working_day(p_org,p_employee,d.day) then coalesce(c.hours,8) else 0 end) end::numeric,
  case when l.id is not null then 0 when a.id is not null then a.worked_hours when auto.eligible then c.hours else null end::numeric,
  case when l.id is not null then t.category::text when a.id is not null then a.absence::text when auto.eligible then 'automatic' else 'unrecorded' end,
  a.id is not null or l.id is not null or auto.eligible,a.version,l.id
 from (select date_trunc('month',p_month)::date+n as day from generate_series(0,v_end-date_trunc('month',p_month)::date) n) d
 left join public.attendance a on a.organisation_id=p_org and a.employee_id=p_employee and a.day=d.day
 left join public.leave_requests l on l.organisation_id=p_org and l.employee_id=p_employee and l.status='approved' and d.day=any(l.work_dates)
 left join public.leave_types t on t.organisation_id=p_org and t.id=l.leave_type_id
 left join lateral (
  select case when count(*)=1 then max(x.working_hours) end as hours
  from public.employment_contracts x where x.organisation_id=p_org and x.employee_id=p_employee and x.start_date<=d.day and (x.end_date is null or x.end_date>=d.day)
  and (x.status='active' or (x.status='terminated' and x.end_date is not null))
 ) c on true
 cross join lateral (select d.day<v_today and d.day>=v_employee.start_date and c.hours is not null and private.is_working_day(p_org,p_employee,d.day)
  and (v_employee.status='active' or (v_employee.status='terminated' and exists(select 1 from public.employment_contracts x where x.organisation_id=p_org and x.employee_id=p_employee and x.status='terminated' and x.end_date is not null and d.day between x.start_date and x.end_date))) as eligible) auto
 order by d.day;
end $$;



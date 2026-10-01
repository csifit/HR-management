-- Actual last employed day is inclusive and distinct from planned fixed-term expiry.
-- Existing undated terminated contracts remain editable; dates are not inferred.
alter table public.employment_contracts add column termination_date date;
alter table public.employment_contracts add constraint contracts_termination_date_bounds
 check(termination_date is null or (termination_date between '1900-01-01' and '2200-12-31'
   and termination_date>=start_date and (end_date is null or termination_date<=end_date)));
comment on column public.employment_contracts.termination_date is
 'Actual last employed day, inclusive. Distinct from planned fixed-term end_date; does not change either employee or contract status.';
-- Existing RLS, organisation/MFA guards, audit and review-version triggers apply.
grant insert(termination_date),update(termination_date) on public.employment_contracts to authenticated;

-- Preserve manual facts and approved leave. Only unambiguous, dated qualifying
-- employment can generate historical hours for a terminated employee/contract.
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
  case when a.id is not null then a.planned_hours
   when d.day<v_employee.start_date then 0
   when l.id is not null then coalesce(c.hours,8)
   when c.matches=0 and exists(select 1 from public.employment_contracts x
     where x.organisation_id=p_org and x.employee_id=p_employee and x.status in ('active','terminated')
     and least(x.termination_date,x.end_date)<d.day) then 0
   when private.is_working_day(p_org,p_employee,d.day) then coalesce(c.hours,8) else 0 end::numeric,
  case when l.id is not null then 0 when a.id is not null then a.worked_hours when auto.eligible then c.hours else null end::numeric,
  case when l.id is not null then t.category::text when a.id is not null then a.absence::text when auto.eligible then 'automatic' else 'unrecorded' end,
  a.id is not null or l.id is not null or auto.eligible,a.version,l.id
 from (select date_trunc('month',p_month)::date+n as day from generate_series(0,v_end-date_trunc('month',p_month)::date) n) d
 left join public.attendance a on a.organisation_id=p_org and a.employee_id=p_employee and a.day=d.day
 left join public.leave_requests l on l.organisation_id=p_org and l.employee_id=p_employee and l.status='approved' and d.day=any(l.work_dates)
 left join public.leave_types t on t.organisation_id=l.organisation_id and t.id=l.leave_type_id
 left join lateral (
  select count(*) as matches,
   case when count(*)=1 and bool_and(x.status='active' or (x.status='terminated' and x.termination_date is not null)) then max(x.working_hours) end as hours,
   bool_and(x.termination_date is not null) as dated
  from public.employment_contracts x where x.organisation_id=p_org and x.employee_id=p_employee
   and x.start_date<=d.day and (x.end_date is null or x.end_date>=d.day)
   and (x.termination_date is null or x.termination_date>=d.day)
 ) c on true
 cross join lateral (select d.day<v_today and d.day>=v_employee.start_date and c.hours is not null
  and private.is_working_day(p_org,p_employee,d.day)
  and (v_employee.status='active' or (v_employee.status='terminated' and c.dated)) as eligible) auto
 order by d.day;
end $$;

-- Keep earlier privacy sections, including saved payroll, and extend only the
-- explicitly selected contracts belonging to the requested employee.
alter function private.privacy_employee_data(uuid,uuid,date,date) rename to privacy_employee_data_before_termination;
create function private.privacy_employee_data(p_org uuid,p_employee uuid,p_from date,p_to date)
returns jsonb language sql stable security definer set search_path='' as $$
 select private.privacy_employee_data_before_termination(p_org,p_employee,p_from,p_to)||jsonb_build_object(
  'contracts',coalesce((select jsonb_agg(to_jsonb(x) order by x.start_date,x.id) from (
   select id,contract_number,start_date,end_date,termination_date,job_title,cor_code,contract_type,working_hours,
    workplace,gross_salary,currency,probation_days,status,parent_contract_id,created_at,updated_at
   from public.employment_contracts where organisation_id=p_org and employee_id=p_employee
  ) x),'[]'::jsonb)
 );
$$;
revoke all on function private.privacy_employee_data_before_termination(uuid,uuid,date,date),private.privacy_employee_data(uuid,uuid,date,date) from public,anon,authenticated;

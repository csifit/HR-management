-- Make JSON initialization explicit for PostgreSQL schema lint.
create or replace function private.benefit_sources(p_org uuid,p_month date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r record; v_rows jsonb := '[]'::jsonb; v_end date := (p_month+interval '1 month - 1 day')::date;
  v_start date; v_stop date; v_time jsonb; v_contracts jsonb; v_flags text[];
  v_worked integer; v_missing integer; v_absent integer; v_planned integer;
  v_contract boolean; v_full_contract boolean; v_included boolean; v_amount numeric; v_used numeric;
begin
  for r in select e.id as employee_id,e.first_name,e.last_name,e.status,e.start_date,
    eb.id as enrolment_id,eb.starts_on,eb.ends_on,eb.active as enrolment_active,eb.version as enrolment_version,
    b.id as benefit_id,b.name as benefit_name,b.model,b.amount,b.active as benefit_active,b.version as benefit_version,
    p.name as provider_name,p.active as provider_active,p.version as provider_version
    from public.employee_benefits eb join public.employees e on e.organisation_id=eb.organisation_id and e.id=eb.employee_id
    join public.benefits b on b.organisation_id=eb.organisation_id and b.id=eb.benefit_id
    join public.benefit_providers p on p.organisation_id=b.organisation_id and p.id=b.provider_id
    where eb.organisation_id=p_org and eb.starts_on<=v_end and coalesce(eb.ends_on,v_end)>=p_month
    order by eb.id
  loop
    v_start := greatest(p_month,r.starts_on,r.start_date); v_stop := least(v_end,coalesce(r.ends_on,v_end));
    select coalesce(jsonb_agg(to_jsonb(a) order by a.day),'[]') into v_time
      from public.attendance_month(p_org,r.employee_id,p_month) a;
    select count(*) filter(where (a->>'worked_hours')::numeric>0),
      count(*) filter(where (a->>'planned_hours')::numeric>0 and not (a->>'recorded')::boolean),
      count(*) filter(where a->>'category' in ('annual','medical','unpaid','other')),
      count(*) filter(where (a->>'planned_hours')::numeric>0)
      into v_worked,v_missing,v_absent,v_planned from jsonb_array_elements(v_time) a where (a->>'day')::date between v_start and v_stop;
    select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'status',c.status,'start',c.start_date,'end',c.end_date) order by c.id),'[]'),
      coalesce(bool_or(c.status='active'),false),
      coalesce(bool_or(c.status='active' and c.start_date<=v_start and coalesce(c.end_date,v_stop)>=v_stop),false)
      into v_contracts,v_contract,v_full_contract from public.employment_contracts c
      where c.organisation_id=p_org and c.employee_id=r.employee_id and c.start_date<=v_stop and coalesce(c.end_date,v_stop)>=v_start;
    v_flags := '{}';
    if r.status<>'active' then v_flags:=array_append(v_flags,'employee_status'); end if;
    if not v_contract or exists(select 1 from jsonb_array_elements(v_contracts) c where c->>'status' in ('suspended','terminated')) then v_flags:=array_append(v_flags,'contract_status'); end if;
    if v_start>p_month or v_stop<v_end or (v_contract and not v_full_contract) then v_flags:=array_append(v_flags,'partial_month'); end if;
    if not r.enrolment_active or not r.benefit_active or not r.provider_active then v_flags:=array_append(v_flags,'disabled'); end if;
    if v_missing>0 then v_flags:=array_append(v_flags,'missing_attendance'); end if;
    if v_planned>0 and v_absent=v_planned then v_flags:=array_append(v_flags,'full_absence'); end if;
    if v_worked=0 then v_flags:=array_append(v_flags,'no_worked_days'); end if;
    if r.model in ('annual_allowance','flexible_budget') then v_flags:=array_append(v_flags,'manual_allocation'); end if;
    if v_end >= (now() at time zone 'Europe/Bucharest')::date then v_flags:=array_append(v_flags,'open_month'); end if;
    v_included := r.status='active' and v_contract and r.enrolment_active and r.benefit_active and r.provider_active;
    v_amount := case when not v_included then 0 when r.model='fixed_monthly' then r.amount when r.model='per_worked_day' then r.amount*v_worked else 0 end;
    select coalesce(sum(i.final_amount),0) into v_used from public.benefit_run_items i join public.benefit_runs br on br.organisation_id=i.organisation_id and br.id=i.run_id
      where i.organisation_id=p_org and i.employee_benefit_id=r.enrolment_id and br.status='approved' and extract(year from br.month)=extract(year from p_month);
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'employee_id',r.employee_id,'employee_benefit_id',r.enrolment_id,'employee_name',r.first_name||' '||r.last_name,
      'benefit_name',r.benefit_name,'provider_name',r.provider_name,'model',r.model,'unit_amount',r.amount,
      'worked_days',v_worked,'missing_days',v_missing,'annual_used',case when r.model='annual_allowance' then v_used else 0 end,
      'suggested_amount',v_amount,'included',v_included,'flags',to_jsonb(v_flags),
      'source',jsonb_build_object('employee_status',r.status,'start_date',r.start_date,'enrolment_version',r.enrolment_version,
        'benefit_version',r.benefit_version,'provider_version',r.provider_version,'attendance',v_time,'contracts',v_contracts)));
  end loop;
  return v_rows;
end;
$$;

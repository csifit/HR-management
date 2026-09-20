-- Expose only directory-safe contract/manager fields. Managers must never gain
-- salary access merely to display a contract type or manager name in a table.
create function public.employee_directory_details(p_organisation_id uuid, p_employee_ids uuid[])
returns table(employee_id uuid, manager_name text, contract_type public.contract_type)
language sql stable security definer set search_path = '' as $$
  select e.id, m.display_name, c.contract_type
  from public.employees e
  left join public.organisation_users m on m.organisation_id = e.organisation_id and m.user_id = e.manager_user_id
  left join lateral (
    select ec.contract_type from public.employment_contracts ec
    where ec.organisation_id = e.organisation_id and ec.employee_id = e.id
    order by (ec.status = 'active') desc, ec.start_date desc, ec.created_at desc, ec.id
    limit 1
  ) c on true
  where e.organisation_id = p_organisation_id and e.id = any(p_employee_ids)
    and private.can_read_employee(e.organisation_id, e.id);
$$;
revoke all on function public.employee_directory_details(uuid, uuid[]) from public, anon;
grant execute on function public.employee_directory_details(uuid, uuid[]) to authenticated;

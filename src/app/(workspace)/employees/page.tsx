import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { requireOrganisation } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { dictionary } from "@/lib/i18n";
import { canManage, type EmployeeStatus } from "@/lib/types";
import { pageNumber, searchTerm } from "@/lib/data";
import { PageHeader, EmptyState } from "@/components/ui";
import { EmployeeTable } from "@/components/employee-table";
type Filters = {
  q?: string;
  status?: string;
  department?: string;
  page?: string;
  starting?: string;
};
export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<Filters>;
}) {
  const filters = await searchParams;
  const { supabase, organisation, membership } = await requireOrganisation();
  const locale = await getLocale();
  const d = dictionary(locale);
  const term = searchTerm(filters.q);
  const page = pageNumber(filters.page);
  const pageSize = 12;
  const manage = canManage(membership.role);
  let query = supabase
    .from("employees")
    .select("*", { count: "exact" })
    .eq("organisation_id", organisation.id);
  if (term)
    query = query.or(
      `first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%`,
    );
  if (
    filters.status &&
    ["active", "onboarding", "suspended", "terminated"].includes(filters.status)
  )
    query = query.eq("status", filters.status as EmployeeStatus);
  if (filters.department)
    query = query.eq("department", filters.department.slice(0, 100));
  if (filters.starting === "1") {
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "Europe/Bucharest",
    });
    const end = new Date(`${today}T12:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 30);
    query = query
      .in("status", ["active", "onboarding"])
      .gte("start_date", today)
      .lte("start_date", end.toISOString().slice(0, 10));
  }
  const [result, departments] = await Promise.all([
    query
      .order("last_name")
      .order("first_name")
      .order("id")
      .range((page - 1) * pageSize, page * pageSize - 1),
    supabase.rpc("employee_departments", {
      p_organisation_id: organisation.id,
    }),
  ]);
  if (result.error || departments.error)
    throw new Error("Employees could not be loaded.");
  const employees = result.data;
  const count = result.count ?? 0;
  const details = employees.length
    ? await supabase.rpc("employee_directory_details", {
        p_organisation_id: organisation.id,
        p_employee_ids: employees.map((e) => e.id),
      })
    : { data: [], error: null };
  if (details.error) throw new Error("Directory details could not be loaded.");
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  function href(target: number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters))
      if (value && key !== "page") params.set(key, value);
    params.set("page", String(target));
    return `/employees?${params}`;
  }
  const filtered = Boolean(
    term || filters.status || filters.department || filters.starting,
  );
  return (
    <>
      <PageHeader title={d.employees} description={d.employeeIntro}>
        {manage && (
          <Link className="button primary" href="/employees/new">
            <Plus size={18} />
            {d.addEmployee}
          </Link>
        )}
      </PageHeader>
      <section className="card table-card">
        <div className="table-tabs">
          <h2>{d.allEmployees}</h2>
          <span className="count-badge">{count}</span>
        </div>
        <div className="table-toolbar">
          <form className="filter-form" action="/employees">
            <div className="search-input">
              <Search size={17} />
              <label className="sr-only" htmlFor="q">
                {d.search}
              </label>
              <input
                id="q"
                name="q"
                defaultValue={filters.q}
                placeholder={d.search}
                maxLength={80}
              />
            </div>
            <label className="sr-only" htmlFor="department">
              {d.department}
            </label>
            <select
              id="department"
              name="department"
              defaultValue={filters.department ?? ""}
            >
              <option value="">{d.allDepartments}</option>
              {departments.data?.map((row) => (
                <option key={row.department}>{row.department}</option>
              ))}
            </select>
            <label className="sr-only" htmlFor="status">
              {d.status}
            </label>
            <select
              id="status"
              name="status"
              defaultValue={filters.status ?? ""}
            >
              <option value="">{d.allStatuses}</option>
              {(
                ["active", "onboarding", "suspended", "terminated"] as const
              ).map((status) => (
                <option value={status} key={status}>
                  {d[status]}
                </option>
              ))}
            </select>
            {filters.starting === "1" && (
              <input type="hidden" name="starting" value="1" />
            )}
            <button className="button secondary">{d.filter}</button>
            {filtered && (
              <Link className="filter-reset" href="/employees">
                {d.resetFilters}
              </Link>
            )}
          </form>
        </div>
        {employees.length ? (
          <EmployeeTable
            employees={employees}
            locale={locale}
            details={details.data ?? []}
          />
        ) : (
          <EmptyState
            title={filtered || page > 1 ? d.noResults : d.noEmployees}
            description={
              filtered || page > 1 ? d.noResultsBody : d.noEmployeesBody
            }
            href={
              filtered || page > 1
                ? "/employees"
                : manage
                  ? "/employees/new"
                  : undefined
            }
            label={filtered || page > 1 ? d.resetFilters : d.addEmployee}
          />
        )}
        <div className="table-footer">
          <span>
            {count} {d.results}
          </span>
          <div className="pagination">
            {page > 1 && <Link href={href(page - 1)}>{d.previous}</Link>}
            <span>
              {d.page} {page} {d.of} {totalPages}
            </span>
            {page < totalPages && <Link href={href(page + 1)}>{d.next}</Link>}
          </div>
        </div>
      </section>
    </>
  );
}

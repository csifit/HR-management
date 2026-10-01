import Link from "next/link";
import { redirect } from "next/navigation";
import { Files, ArrowUpRight } from "lucide-react";
import { requireOrganisation } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { dictionary, dateLabel } from "@/lib/i18n";
import { getOwnEmployee, pageNumber } from "@/lib/data";
import { employeeDictionary } from "@/lib/employee-i18n";
import { contractDictionary } from "@/lib/contract-i18n";
import type { ContractStatus } from "@/lib/types";
import { PageHeader, EmptyState, StatusBadge } from "@/components/ui";
export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; ending?: string; page?: string }>;
}) {
  const { supabase, organisation, membership } = await requireOrganisation();
  if (membership.role === "manager") redirect("/employees");
  const locale = await getLocale();
  const d = dictionary(locale);
  const ed = employeeDictionary(locale);
  const cd = contractDictionary(locale);
  const self = membership.role === "employee";
  const ownEmployee = self ? await getOwnEmployee() : null;
  const filters = await searchParams;
  const page = pageNumber(filters.page);
  let query = supabase
    .from("employment_contracts")
    .select("*", { count: "exact" })
    .eq("organisation_id", organisation.id);
  if (self)
    query = query.eq(
      "employee_id",
      ownEmployee?.id ?? "00000000-0000-4000-8000-000000000000",
    );
  if (
    filters.status &&
    ["draft", "active", "suspended", "terminated"].includes(filters.status)
  )
    query = query.eq("status", filters.status as ContractStatus);
  if (filters.ending === "1") {
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "Europe/Bucharest",
    });
    const end = new Date(`${today}T12:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 30);
    query = query
      .eq("status", "active")
      .gte("end_date", today)
      .lte("end_date", end.toISOString().slice(0, 10));
  }
  const {
    data: contracts,
    error,
    count,
  } = await query
    .order("created_at", { ascending: false })
    .order("id")
    .range((page - 1) * 20, page * 20 - 1);
  if (error) throw new Error("Contracts could not be loaded.");
  const employees =
    !self && contracts.length
      ? await supabase
          .from("employees")
          .select("id,first_name,last_name")
          .eq("organisation_id", organisation.id)
          .in(
            "id",
            contracts.map((c) => c.employee_id),
          )
      : { data: [], error: null };
  if (employees.error) throw new Error("Employees could not be loaded.");
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / 20));
  const href = (target: number) =>
    `/contracts?${new URLSearchParams({ ...(filters.status ? { status: filters.status } : {}), ...(filters.ending ? { ending: filters.ending } : {}), page: String(target) })}`;
  return (
    <>
      <PageHeader
        title={self ? ed.contracts : d.contracts}
        description={self ? ed.contractIntro : d.contractIntro}
      />
      <section className="card table-card">
        <div className="table-toolbar">
          <form className="filter-form" action="/contracts">
            <label htmlFor="status" className="sr-only">
              {d.status}
            </label>
            <select
              id="status"
              name="status"
              defaultValue={filters.status ?? ""}
            >
              <option value="">{d.allStatuses}</option>
              {(["draft", "active", "suspended", "terminated"] as const).map(
                (status) => (
                  <option key={status} value={status}>
                    {d[status]}
                  </option>
                ),
              )}
            </select>
            {filters.ending && <input type="hidden" name="ending" value="1" />}
            <button className="button secondary">{d.filter}</button>
            {(filters.status || filters.ending) && (
              <Link href="/contracts" className="filter-reset">
                {d.resetFilters}
              </Link>
            )}
          </form>
        </div>
        {contracts.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{d.contractNumber}</th>
                  {!self && <th>{d.employee}</th>}
                  <th>{d.contractType}</th>
                  <th>{d.startDate}</th>
                  <th>{cd.expiry}</th>
                  <th>{cd.lastDay}</th>
                  <th>{d.status}</th>
                  <th>
                    <span className="sr-only">{d.view}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => {
                  const e = employees.data?.find(
                    (row) => row.id === c.employee_id,
                  );
                  return (
                    <tr key={c.id}>
                      <td>
                        <Link
                          className="text-link"
                          href={`/employees/${c.employee_id}?tab=contract`}
                        >
                          {c.contract_number}
                        </Link>
                      </td>
                      {!self && (
                        <td>
                          {e?.first_name} {e?.last_name}
                        </td>
                      )}
                      <td>{d[c.contract_type]}</td>
                      <td>{dateLabel(c.start_date, locale)}</td>
                      <td>{dateLabel(c.end_date, locale)}</td>
                      <td>{dateLabel(c.termination_date, locale)}</td>
                      <td>
                        <StatusBadge value={c.status} d={d} />
                      </td>
                      <td>
                        <Link
                          className="icon-button"
                          aria-label={`${d.contract} ${c.contract_number}`}
                          href={`/employees/${c.employee_id}?tab=contract`}
                        >
                          <ArrowUpRight size={17} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title={d.noContracts}
            description={
              self
                ? ownEmployee
                  ? ed.noContracts
                  : ed.noAccount
                : d.noContractsBody
            }
            icon={Files}
            href={self ? undefined : "/employees"}
            label={self ? undefined : d.employees}
          />
        )}
        <div className="table-footer">
          <span>
            {count ?? 0} {d.contracts.toLowerCase()}
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

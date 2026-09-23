import Link from "next/link";
import { requireHR } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { payrollDictionary } from "@/lib/payroll-i18n";
import { documentDictionary } from "@/lib/document-i18n";
import { timeEmployees } from "@/lib/time-data";
import { singleParam } from "@/lib/time";
import { PageHeader } from "@/components/ui";
import { EmployeeFilter } from "@/components/time-ui";
import { PayrollForm } from "@/components/payroll-form";
export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase, organisation } = await requireHR(),
    locale = await getLocale(),
    d = payrollDictionary(locale),
    dd = documentDictionary(locale),
    q = await searchParams;
  const { employee, options, hasMore } = await timeEmployees(
    singleParam(q.employee),
    singleParam(q.q),
  );
  const contract = employee
    ? await supabase
        .from("employment_contracts")
        .select("gross_salary")
        .eq("organisation_id", organisation.id)
        .eq("employee_id", employee.id)
        .eq("status", "active")
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null, error: null };
  if (contract.error) throw new Error("Contract could not be loaded.");
  return (
    <>
      <PageHeader title={d.title} description={d.intro} />
      <form action="/payroll" className="time-filters">
        <label className="field time-field">
          <span>{dd.search}</span>
          <input name="q" type="search" defaultValue={singleParam(q.q)} />
        </label>
        <EmployeeFilter
          employees={options}
          selected={employee?.id}
          locale={locale}
          empty={false}
        />
        <button className="button secondary">{dd.filter}</button>
      </form>
      {hasMore && <p className="time-help">{dd.more}</p>}
      {employee ? (
        <>
          <div className="time-actions">
            <h2>
              {employee.first_name} {employee.last_name}
            </h2>
            <Link
              className="button secondary"
              href={`/documents?employee=${employee.id}`}
            >
              {dd.title}
            </Link>
          </div>
          {organisation.status === "active" ? (
            <section className="card time-form-card">
              <PayrollForm
                employeeId={employee.id}
                basic={contract.data?.gross_salary}
                locale={locale}
              />
            </section>
          ) : (
            <p className="notice">{dd.inactive}</p>
          )}
        </>
      ) : (
        <p className="notice">{dd.choose}</p>
      )}
    </>
  );
}

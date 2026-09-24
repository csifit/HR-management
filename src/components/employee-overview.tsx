import Link from "next/link";
import { ArrowRight, CalendarDays, Users } from "lucide-react";
import { requireOrganisation } from "@/lib/auth";
import { getOwnEmployee } from "@/lib/data";
import { dictionary, type Locale } from "@/lib/i18n";
import { employeeDictionary } from "@/lib/employee-i18n";
import { timeDictionary } from "@/lib/time-i18n";
import { Detail, PageHeader } from "./ui";

export async function EmployeeOverview({ locale }: { locale: Locale }) {
  const { supabase, organisation } = await requireOrganisation();
  const employee = await getOwnEmployee();
  const d = dictionary(locale);
  const ed = employeeDictionary(locale);
  const td = timeDictionary(locale);
  const pending = employee
    ? await supabase
        .from("leave_requests")
        .select("id", { count: "exact", head: true })
        .eq("organisation_id", organisation.id)
        .eq("employee_id", employee.id)
        .eq("status", "pending")
    : { count: 0, error: null };
  if (pending.error)
    throw new Error("Your leave requests could not be loaded.");
  return (
    <>
      <PageHeader title={d.overview} description={ed.overviewIntro} />
      {!employee && <p className="notice">{ed.noAccount}</p>}
      <Link className="card pending-leave-card" href="/leave?status=pending">
        <CalendarDays size={22} />
        <div>
          <strong>{td.pendingTitle}</strong>
          <small>{ed.pendingCaption}</small>
        </div>
        <span className="count-badge">{pending.count ?? 0}</span>
        <ArrowRight size={18} />
      </Link>
      <section className="card">
        <div className="card-heading">
          <h2>{ed.department}</h2>
          <Users size={20} className="muted" />
        </div>
        <div className="card-content">
          {employee ? (
            <dl className="details-grid">
              <Detail label={d.department}>
                {employee.department || ed.noDepartment}
              </Detail>
              <Detail label={d.jobTitle}>{employee.job_title}</Detail>
              <Detail label={d.workplace}>{employee.workplace}</Detail>
            </dl>
          ) : (
            <p className="muted">{d.noData}</p>
          )}
        </div>
      </section>
    </>
  );
}

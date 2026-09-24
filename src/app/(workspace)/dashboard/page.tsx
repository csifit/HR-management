import Link from "next/link";
import {
  Users,
  UserPlus,
  FileClock,
  Files,
  Plus,
  ArrowRight,
  History,
  CalendarDays,
} from "lucide-react";
import { requireOrganisation } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { dictionary, dateLabel, actionLabel } from "@/lib/i18n";
import { canManage } from "@/lib/types";
import { PageHeader, Metric, EmptyState } from "@/components/ui";
import { EmployeeTable } from "@/components/employee-table";
import { timeDictionary } from "@/lib/time-i18n";
import { EmployeeOverview } from "@/components/employee-overview";
export default async function DashboardPage() {
  const { supabase, organisation, membership } = await requireOrganisation();
  const locale = await getLocale();
  const d = dictionary(locale);
  const td = timeDictionary(locale);
  if (membership.role === "employee")
    return <EmployeeOverview locale={locale} />;
  const manage = canManage(membership.role);
  const writable = manage && organisation.status === "active";
  const [summary, recent, activity, pendingLeave] = await Promise.all([
    supabase.rpc("dashboard_summary", { p_organisation_id: organisation.id }),
    supabase
      .from("employees")
      .select("*")
      .eq("organisation_id", organisation.id)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("audit_log")
      .select("*")
      .eq("organisation_id", organisation.id)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("leave_requests")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", organisation.id)
      .eq("status", "pending"),
  ]);
  if (
    summary.error ||
    !summary.data ||
    recent.error ||
    activity.error ||
    pendingLeave.error
  )
    throw new Error("Dashboard could not be loaded.");
  const stats = summary.data;
  const departmentTotal = stats.departments.reduce(
    (total, row) => total + row.count,
    0,
  );
  return (
    <>
      <PageHeader
        eyebrow={new Intl.DateTimeFormat(locale === "ro" ? "ro-RO" : "en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
          timeZone: "Europe/Bucharest",
        }).format(new Date())}
        title={d.overview}
        description={d.overviewIntro}
      >
        {writable && (
          <Link className="button primary" href="/employees/new">
            <Plus size={18} />
            {d.addEmployee}
          </Link>
        )}
      </PageHeader>
      <div className="metrics-grid">
        <Metric
          title={d.activeEmployees}
          value={stats.active}
          caption={d.inOrganisation}
          icon={Users}
          href="/employees?status=active"
        />
        <Metric
          title={d.startingSoon}
          value={stats.starting}
          caption={d.next30Days}
          icon={UserPlus}
          href="/employees?starting=1"
        />
        {membership.role !== "manager" && (
          <>
            <Metric
              title={d.endingSoon}
              value={stats.ending}
              caption={d.next30Days}
              icon={FileClock}
              href="/contracts?ending=1"
            />
            <Metric
              title={d.draftContracts}
              value={stats.drafts}
              caption={d.awaitingReview}
              icon={Files}
              href="/contracts?status=draft"
            />
          </>
        )}
      </div>
      <Link className="card pending-leave-card" href="/leave?status=pending">
        <CalendarDays size={22} />
        <div>
          <strong>{td.pendingTitle}</strong>
          <small>{td.pendingCaption}</small>
        </div>
        <span className="count-badge">{pendingLeave.count ?? 0}</span>
        <ArrowRight size={18} />
      </Link>
      <div className="dashboard-grid">
        <section className="card table-card">
          <div className="card-heading">
            <div>
              <h2>{d.recentEmployees}</h2>
              <p>{d.teamOverview}</p>
            </div>
            <Link href="/employees">
              {d.viewAll}
              <ArrowRight size={15} />
            </Link>
          </div>
          {recent.data.length ? (
            <EmployeeTable employees={recent.data} locale={locale} compact />
          ) : (
            <EmptyState
              title={d.noEmployees}
              description={writable ? d.noEmployeesBody : d.noData}
              href={writable ? "/employees/new" : undefined}
              label={d.addEmployee}
            />
          )}
        </section>
        <section className="card">
          <div className="card-heading">
            <h2>{d.employeesByDepartment}</h2>
          </div>
          <div className="card-content">
            {stats.departments.length ? (
              <>
                <div className="department-bars">
                  {stats.departments.slice(0, 6).map((row) => (
                    <div className="department-row" key={row.department}>
                      <div className="department-label">
                        {row.department}
                        <span>{row.count}</span>
                      </div>
                      <div className="bar-track">
                        <div
                          className="bar-fill"
                          style={{
                            width: `${(row.count / departmentTotal) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="total-label">
                  {departmentTotal} {d.results}
                </div>
              </>
            ) : (
              <div className="empty-state">
                <Users size={28} />
                <p>{d.noData}</p>
              </div>
            )}
          </div>
        </section>
      </div>
      {manage && (
        <section className="card" style={{ marginBottom: 24 }}>
          <div className="card-heading">
            <h2>{d.recentActivity}</h2>
            <History size={18} className="muted" />
          </div>
          <div className="card-content">
            {activity.data.length ? (
              <ul className="timeline">
                {activity.data.map((item) => (
                  <li key={item.id}>
                    <span className="timeline-icon">
                      <History size={14} />
                    </span>
                    <div>
                      <strong>{actionLabel(item.action, locale)}</strong>
                      <small>{dateLabel(item.created_at, locale)}</small>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">{d.noActivity}</p>
            )}
          </div>
        </section>
      )}
    </>
  );
}

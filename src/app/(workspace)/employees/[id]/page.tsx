import Link from "next/link";
import {
  ArrowLeft,
  Pencil,
  Plus,
  Files,
  History,
  Mail,
  MapPin,
} from "lucide-react";
import { getEmployee } from "@/lib/data";
import { getLocale } from "@/lib/locale";
import { dictionary, dateLabel, moneyLabel, actionLabel } from "@/lib/i18n";
import { canManage } from "@/lib/types";
import { Avatar, StatusBadge, Detail, EmptyState } from "@/components/ui";
export default async function EmployeePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { employee, supabase, organisation, membership, user } =
    await getEmployee((await params).id);
  const locale = await getLocale();
  const d = dictionary(locale);
  const manage = canManage(membership.role);
  const writable = manage && organisation.status === "active";
  const own = employee.user_id === user.id;
  const canSeeContracts = manage || own;
  const selected = (await searchParams).tab ?? "personal";
  const tab = [
    "personal",
    "employment",
    "contract",
    "salary",
    "activity",
  ].includes(selected)
    ? selected
    : "personal";
  const [contracts, manager] = await Promise.all([
    supabase
      .from("employment_contracts")
      .select("*")
      .eq("organisation_id", organisation.id)
      .eq("employee_id", employee.id)
      .order("start_date", { ascending: false }),
    supabase.rpc("employee_directory_details", {
      p_organisation_id: organisation.id,
      p_employee_ids: [employee.id],
    }),
  ]);
  if (contracts.error || manager.error)
    throw new Error("Profile could not be loaded.");
  const managerName = manager.data?.[0]?.manager_name;
  const activity =
    manage && tab === "activity"
      ? await supabase
          .from("audit_log")
          .select("*")
          .eq("organisation_id", organisation.id)
          .in("entity_id", [employee.id, ...contracts.data.map((c) => c.id)])
          .order("created_at", { ascending: false })
          .limit(50)
      : { data: [], error: null };
  if (activity.error) throw new Error("Activity could not be loaded.");
  const currentContract =
    contracts.data.find((c) => c.status === "active") ?? contracts.data[0];
  return (
    <>
      <Link className="back-link" href="/employees">
        <ArrowLeft size={16} />
        {d.employees}
      </Link>
      <section className="card profile-header">
        <div className="profile-summary">
          <Avatar
            size="large"
            name={`${employee.first_name} ${employee.last_name}`}
          />
          <div>
            <h1>
              {employee.first_name} {employee.last_name}
              <StatusBadge value={employee.status} d={d} />
            </h1>
            <p>
              {employee.job_title} · {employee.department}
            </p>
          </div>
          {writable && (
            <Link
              className="button secondary"
              href={`/employees/${employee.id}/edit`}
            >
              <Pencil size={15} />
              {d.edit}
            </Link>
          )}
        </div>
        <nav className="profile-tabs" aria-label={d.personal}>
          {(
            [
              "personal",
              "employment",
              "contract",
              "salary",
              "activity",
            ] as const
          )
            .filter((key) => key !== "activity" || manage)
            .map((key) => (
              <Link
                key={key}
                href={`/employees/${employee.id}?tab=${key}`}
                className={tab === key ? "tab-active" : ""}
                aria-current={tab === key ? "page" : undefined}
              >
                {d[key]}
              </Link>
            ))}
          <Link href={`/leave?employee=${employee.id}`}>{d.leave}</Link>
          <Link href={`/attendance?employee=${employee.id}`}>
            {d.attendance}
          </Link>
        </nav>
      </section>
      {tab === "personal" && (
        <div className="profile-grid">
          <section className="card">
            <div className="card-heading">
              <h2>{d.contactDetails}</h2>
              <Mail size={18} className="muted" />
            </div>
            <div className="card-content">
              <dl className="details-grid">
                <Detail label={d.firstName}>{employee.first_name}</Detail>
                <Detail label={d.lastName}>{employee.last_name}</Detail>
                <Detail label={d.email}>
                  <a href={`mailto:${employee.email}`}>{employee.email}</a>
                </Detail>
                <Detail label={d.phone}>{employee.phone}</Detail>
              </dl>
            </div>
          </section>
          <section className="card">
            <div className="card-heading">
              <h2>{d.employmentDetails}</h2>
              <MapPin size={18} className="muted" />
            </div>
            <div className="card-content">
              <dl className="details-grid">
                <Detail label={d.department}>{employee.department}</Detail>
                <Detail label={d.workplace}>{employee.workplace}</Detail>
                <Detail label={d.joined}>
                  {dateLabel(employee.start_date, locale)}
                </Detail>
                <Detail label={d.manager}>
                  {managerName ??
                    (employee.manager_user_id === user.id
                      ? d.currentUser
                      : "—")}
                </Detail>
              </dl>
            </div>
          </section>
        </div>
      )}
      {tab === "employment" && (
        <section className="card">
          <div className="card-heading">
            <h2>{d.employmentDetails}</h2>
          </div>
          <div className="card-content">
            <dl className="details-grid">
              <Detail label={d.jobTitle}>{employee.job_title}</Detail>
              <Detail label={d.department}>{employee.department}</Detail>
              <Detail label={d.startDate}>
                {dateLabel(employee.start_date, locale)}
              </Detail>
              <Detail label={d.status}>
                <StatusBadge value={employee.status} d={d} />
              </Detail>
              <Detail label={d.workplace}>{employee.workplace}</Detail>
              <Detail label={d.manager}>{managerName ?? "—"}</Detail>
            </dl>
          </div>
        </section>
      )}
      {(tab === "contract" || tab === "salary") && !canSeeContracts && (
        <div className="notice">{d.noSalaryAccess}</div>
      )}
      {tab === "contract" && canSeeContracts && (
        <>
          <div className="page-heading">
            <div>
              <h2>{d.contracts}</h2>
              <p>{d.contractIntro}</p>
            </div>
            {writable && (
              <Link
                className="button primary"
                href={`/employees/${employee.id}/contracts/new`}
              >
                <Plus size={17} />
                {d.addContract}
              </Link>
            )}
          </div>
          {contracts.data.length ? (
            contracts.data.map((contract) => (
              <section className="card contract-card" key={contract.id}>
                <div className="card-heading">
                  <div>
                    <h2>
                      {d.contract} {contract.contract_number}
                    </h2>
                    <StatusBadge value={contract.status} d={d} />
                  </div>
                  {writable && (
                    <Link
                      href={`/employees/${employee.id}/contracts/${contract.id}/edit`}
                    >
                      <Pencil size={14} />
                      {d.edit}
                    </Link>
                  )}
                </div>
                <div className="card-content">
                  <dl className="details-grid">
                    <Detail label={d.contractType}>
                      {d[contract.contract_type]}
                    </Detail>
                    <Detail label={d.corCode}>{contract.cor_code}</Detail>
                    <Detail label={d.startDate}>
                      {dateLabel(contract.start_date, locale)}
                    </Detail>
                    <Detail label={d.endDate}>
                      {dateLabel(contract.end_date, locale)}
                    </Detail>
                    <Detail label={d.jobTitle}>{contract.job_title}</Detail>
                    <Detail label={d.workingHours}>
                      {contract.working_hours}
                    </Detail>
                    <Detail label={d.workplace}>{contract.workplace}</Detail>
                    <Detail label={d.probationDays}>
                      {contract.probation_days}
                    </Detail>
                    <Detail label={d.grossSalary}>
                      {moneyLabel(contract.gross_salary, locale)}
                    </Detail>
                  </dl>
                </div>
              </section>
            ))
          ) : (
            <section className="card">
              <EmptyState
                title={d.noContracts}
                description={d.noContractsBody}
                icon={Files}
              />
            </section>
          )}
        </>
      )}
      {tab === "salary" && canSeeContracts && (
        <section className="card">
          <div className="card-heading">
            <h2>{d.salary}</h2>
            {currentContract && (
              <StatusBadge value={currentContract.status} d={d} />
            )}
          </div>
          {currentContract ? (
            <div className="card-content">
              <span className="salary-value">
                {moneyLabel(currentContract.gross_salary, locale)}
              </span>
              <p className="muted form-help">
                {d.grossSalary} · {d.contract} {currentContract.contract_number}
              </p>
              <p className="notice profile-aside-note">{d.salaryNote}</p>
            </div>
          ) : (
            <EmptyState
              title={d.noContracts}
              description={d.noContractsBody}
              icon={Files}
              href={
                writable ? `/employees/${employee.id}/contracts/new` : undefined
              }
              label={d.addContract}
            />
          )}
        </section>
      )}
      {tab === "activity" && manage && (
        <section className="card">
          <div className="card-heading">
            <h2>{d.activity}</h2>
          </div>
          <div className="card-content">
            {activity.data?.length ? (
              <ul className="timeline">
                {activity.data.map((item) => (
                  <li key={item.id}>
                    <span className="timeline-icon">
                      <History size={15} />
                    </span>
                    <div>
                      <strong>{actionLabel(item.action, locale)}</strong>
                      <small>
                        {dateLabel(item.created_at, locale)} ·{" "}
                        {new Intl.DateTimeFormat(locale, {
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: "Europe/Bucharest",
                        }).format(new Date(item.created_at))}
                      </small>
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

import Link from "next/link";
import { requireHR } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { dateLabel } from "@/lib/i18n";
import { privacyDictionary } from "@/lib/privacy-i18n";
import { privacyClosed } from "@/lib/privacy-types";
import { PrivacyCreateForm } from "@/components/privacy-forms";
import { PageHeader } from "@/components/ui";
export default async function PrivacyRequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const c = await requireHR(),
    locale = await getLocale(),
    d = privacyDictionary(locale),
    params = await searchParams;
  const page = Math.min(
    10000,
    Math.max(1, Math.floor(Number(params.page)) || 1),
  );
  const q =
    typeof params.q === "string"
      ? params.q.replace(/[^\p{L}\p{N} -]/gu, "").slice(0, 80)
      : "";
  const filter =
    params.filter === "all" || params.filter === "overdue"
      ? params.filter
      : "open";
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bucharest",
  }).format(new Date());
  let employeeQuery = c.supabase
    .from("employees")
    .select("id,first_name,last_name")
    .eq("organisation_id", c.organisation.id)
    .order("last_name")
    .order("id")
    .limit(40);
  if (q)
    employeeQuery = employeeQuery.or(
      `first_name.ilike.%${q}%,last_name.ilike.%${q}%`,
    );
  let requestQuery = c.supabase
    .from("privacy_requests")
    .select("*", { count: "exact" })
    .eq("organisation_id", c.organisation.id)
    .order("due_on")
    .order("id")
    .range((page - 1) * 30, page * 30 - 1);
  if (filter !== "all")
    requestQuery = requestQuery.in("status", ["received", "in_review"]);
  if (filter === "overdue") requestQuery = requestQuery.lt("due_on", today);
  const [employees, members, requests] = await Promise.all([
    employeeQuery,
    c.supabase
      .from("organisation_users")
      .select("*")
      .eq("organisation_id", c.organisation.id)
      .in("role", ["organisation_owner", "hr_manager"])
      .order("display_name"),
    requestQuery,
  ]);
  if (employees.error || members.error || requests.error)
    throw new Error(
      "Privacy register could not be loaded. Check migration 014.",
    );
  const ids = [...new Set(requests.data.map((r) => r.employee_id))];
  const people = ids.length
    ? await c.supabase
        .from("employees")
        .select("id,first_name,last_name")
        .eq("organisation_id", c.organisation.id)
        .in("id", ids)
    : { data: [], error: null };
  if (people.error) throw new Error("Employees could not be loaded.");
  const names = new Map(
    people.data.map((e) => [e.id, `${e.last_name} ${e.first_name}`]),
  );
  const href = (n: number) =>
    `?${new URLSearchParams({ q, filter, page: String(n) })}`;
  return (
    <>
      <PageHeader title={d.title} description={d.intro} />
      <Link href="/settings/data-protection" className="button secondary">
        {locale === "ro" ? "Protecția datelor" : "Data protection"}
      </Link>
      <form className="time-filters" method="get">
        <label className="field">
          <span>{d.state}</span>
          <select name="filter" defaultValue={filter}>
            {(["open", "overdue", "all"] as const).map((v) => (
              <option key={v} value={v}>
                {d[v]}
              </option>
            ))}
          </select>
        </label>
        <button className="button secondary">{d.applyFilter}</button>
      </form>
      <section className="card table-card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{d.employee}</th>
                <th>{d.kind}</th>
                <th>{d.state}</th>
                <th>{d.due}</th>
                <th>{d.assignee}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {requests.data.map((r) => (
                <tr key={r.id}>
                  <td>{names.get(r.employee_id)}</td>
                  <td>{d[r.kind]}</td>
                  <td>{d[r.status]}</td>
                  <td>
                    {dateLabel(r.due_on, locale)}
                    {!privacyClosed(r.status) && r.due_on < today && (
                      <strong className="notice error"> · {d.overdue}</strong>
                    )}
                  </td>
                  <td>
                    {members.data.find((m) => m.user_id === r.assigned_to)
                      ?.display_name ?? d.noAssignee}
                  </td>
                  <td>
                    <Link href={`/settings/data-protection/requests/${r.id}`}>
                      {d.details}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!requests.data.length && <p className="time-padding">{d.empty}</p>}
      </section>
      <nav className="heading-actions" aria-label={d.title}>
        {page > 1 && <Link href={href(page - 1)}>{d.previous}</Link>}
        {page * 30 < (requests.count ?? 0) && (
          <Link href={href(page + 1)}>{d.next}</Link>
        )}
      </nav>
      {c.organisation.status === "active" ? (
        <section className="card time-form-card">
          <h2>{d.newRequest}</h2>
          <form method="get" className="time-filters">
            <input type="hidden" name="filter" value={filter} />
            <label className="field">
              <span>{d.search}</span>
              <input name="q" maxLength={80} defaultValue={q} />
            </label>
            <button className="button secondary">{d.search}</button>
          </form>
          <p className="time-help">{d.searchHelp}</p>
          {!employees.data.length && <p>{d.noEmployees}</p>}
          <PrivacyCreateForm
            locale={locale}
            employees={employees.data}
            members={members.data}
            userId={c.user.id}
            today={today}
          />
        </section>
      ) : (
        <p className="notice">{d.inactive}</p>
      )}
    </>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireHR } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { dateLabel } from "@/lib/i18n";
import { privacyDictionary } from "@/lib/privacy-i18n";
import { privacyClosed } from "@/lib/privacy-types";
import {
  PrivacyUpdateForm,
  PrivacyExportForm,
} from "@/components/privacy-forms";
import { PageHeader } from "@/components/ui";
export default async function PrivacyRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ history?: string }>;
}) {
  const c = await requireHR(),
    { id } = await params,
    query = await searchParams,
    locale = await getLocale(),
    d = privacyDictionary(locale);
  if (!z.uuid().safeParse(id).success) notFound();
  const page = Math.min(
    10000,
    Math.max(1, Math.floor(Number(query.history)) || 1),
  );
  const { data: r, error } = await c.supabase
    .from("privacy_requests")
    .select("*")
    .eq("organisation_id", c.organisation.id)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Privacy request could not be loaded.");
  if (!r) notFound();
  const [employee, members, events, exports, docs] = await Promise.all([
    c.supabase
      .from("employees")
      .select("first_name,last_name")
      .eq("organisation_id", c.organisation.id)
      .eq("id", r.employee_id)
      .single(),
    c.supabase
      .from("organisation_users")
      .select("*")
      .eq("organisation_id", c.organisation.id)
      .in("role", ["organisation_owner", "hr_manager"]),
    c.supabase
      .from("privacy_request_events")
      .select("*", { count: "exact" })
      .eq("organisation_id", c.organisation.id)
      .eq("request_id", id)
      .order("request_version", { ascending: false })
      .range((page - 1) * 20, page * 20 - 1),
    c.supabase
      .from("privacy_exports")
      .select("*")
      .eq("organisation_id", c.organisation.id)
      .eq("request_id", id)
      .order("prepared_at", { ascending: false })
      .limit(20),
    c.supabase
      .from("employee_documents")
      .select("*")
      .eq("organisation_id", c.organisation.id)
      .eq("employee_id", r.employee_id)
      .not("ready_at", "is", null)
      .order("created_at")
      .limit(201),
  ]);
  if (
    employee.error ||
    members.error ||
    events.error ||
    exports.error ||
    docs.error
  )
    throw new Error("Privacy request details could not be loaded.");
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bucharest",
  }).format(new Date());
  const writable = c.organisation.status === "active",
    closed = privacyClosed(r.status);
  const memberName = (user: string) =>
    members.data.find((m) => m.user_id === user)?.display_name ?? d.noAssignee;
  return (
    <>
      <PageHeader
        title={`${employee.data.first_name} ${employee.data.last_name} · ${d[r.kind]}`}
        description={`${id} · ${d[r.status]}`}
      />
      <Link
        className="button secondary"
        href="/settings/data-protection/requests"
      >
        {d.back}
      </Link>
      <section className="card time-form-card">
        <p>
          <strong>{d.receivedOn}:</strong> {dateLabel(r.received_on, locale)} ·{" "}
          {d[r.channel]}
        </p>
        <p>
          <strong>{d.initialDue}:</strong> {dateLabel(r.initial_due_on, locale)}{" "}
          · <strong>{d.due}:</strong> {dateLabel(r.due_on, locale)}
        </p>
        <p>
          <strong>{d.assignee}:</strong> {memberName(r.assigned_to)}
        </p>
        <p className="privacy-text">{r.summary}</p>
        {!closed && r.due_on < today && (
          <p className="notice error">{d.overdue}</p>
        )}
        {r.extension_notified_on &&
          r.extension_notified_on > r.initial_due_on && (
            <p className="notice error">{d.lateNotice}</p>
          )}
        {writable && !closed ? (
          <PrivacyUpdateForm
            key={r.version}
            locale={locale}
            request={r}
            members={members.data}
            today={today}
          />
        ) : (
          <>
            <p className="notice">{closed ? d.closed : d.inactive}</p>
            <p className="privacy-text">{r.resolution}</p>
            <p>
              {r.response_reference} · {dateLabel(r.responded_on, locale)}
            </p>
          </>
        )}
      </section>
      {writable && !closed && (
        <section className="card time-form-card">
          <h2>{d.exportTitle}</h2>
          {r.status === "in_review" &&
          r.identity_verified_at &&
          ["access", "portability"].includes(r.kind) ? (
            docs.data.length > 200 ? (
              <p className="notice">{d.tooManyDocuments}</p>
            ) : (
              <PrivacyExportForm
                key={`export-${r.version}`}
                locale={locale}
                request={r}
                documents={docs.data}
                today={today}
              />
            )
          ) : (
            <p className="notice">{d.locked}</p>
          )}
        </section>
      )}
      <section className="card time-form-card">
        <h2>{d.history}</h2>
        <p className="time-help">{d.historyHelp}</p>
        {events.data.map((e) => (
          <details key={e.id} className="time-setting-row">
            <summary>
              {d.version} {e.request_version} ·{" "}
              {dateLabel(e.created_at, locale)} · {memberName(e.actor_id)}
            </summary>
            <dl>
              <dt>{d.state}</dt>
              <dd>{e.snapshot.status ? d[e.snapshot.status] : "—"}</dd>
              <dt>{d.assignee}</dt>
              <dd>{memberName(e.snapshot.assigned_to ?? "")}</dd>
              <dt>{d.due}</dt>
              <dd>{dateLabel(e.snapshot.due_on ?? null, locale)}</dd>
              <dt>{d.identity}</dt>
              <dd className="privacy-text">
                {e.snapshot.identity_reference || "—"}
              </dd>
              <dt>{d.extension}</dt>
              <dd className="privacy-text">
                {e.snapshot.extension_reason || "—"} ·{" "}
                {dateLabel(e.snapshot.extension_notified_on ?? null, locale)}
              </dd>
              <dt>{d.response}</dt>
              <dd className="privacy-text">
                {e.snapshot.response_reference || "—"} ·{" "}
                {dateLabel(e.snapshot.responded_on ?? null, locale)}
              </dd>
              <dt>{d.resolution}</dt>
              <dd className="privacy-text">{e.snapshot.resolution || "—"}</dd>
            </dl>
          </details>
        ))}
        <nav className="heading-actions" aria-label={d.history}>
          {page > 1 && <Link href={`?history=${page - 1}`}>{d.previous}</Link>}
          {page * 20 < (events.count ?? 0) && (
            <Link href={`?history=${page + 1}`}>{d.next}</Link>
          )}
        </nav>
      </section>
      <section className="card time-form-card">
        <h2>{d.exports}</h2>
        {!exports.data.length && <p>{d.noHistory}</p>}
        {exports.data.map((e) => (
          <p key={e.id}>
            {dateLabel(e.prepared_at, locale)} · {memberName(e.prepared_by)} ·{" "}
            {e.documents.length} PDF · {e.attendance_from} – {e.attendance_to}
            <br />
            <small>{e.id}</small>
          </p>
        ))}
      </section>
    </>
  );
}

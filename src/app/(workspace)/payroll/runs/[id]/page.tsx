import Link from "next/link";
import { notFound } from "next/navigation";
import { requireHR } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { dateLabel, moneyLabel, type Locale } from "@/lib/i18n";
import {
  payrollDictionary,
  payrollRows,
  floorExceptionLabels,
} from "@/lib/payroll-i18n";
import {
  payrollRunDictionary,
  payrollEventLabel,
} from "@/lib/payroll-run-i18n";
import type { PayrollRunItem } from "@/lib/payroll-run-types";
import {
  payrollPeriodDictionary,
  payrollPeriodLines,
} from "@/lib/payroll-period-i18n";
import { payrollHandoverDictionary } from "@/lib/payroll-handover-i18n";
import { idSchema } from "@/lib/validation";
import { timeEmployees } from "@/lib/time-data";
import { singleParam } from "@/lib/time";
import { documentDictionary } from "@/lib/document-i18n";
import { PageHeader } from "@/components/ui";
import { EmployeeFilter } from "@/components/time-ui";
import { PayrollForm } from "@/components/payroll-form";
import { PayrollHandoverForm } from "@/components/payroll-handover-form";
import {
  PayrollRunCreateForm,
  PayrollRunApproveForm,
  PayrollRunDiscardForm,
  PayrollEntryRemoveForm,
  PayrollApprovedPdfForm,
} from "@/components/payroll-run-forms";

function SavedCalculation({
  item,
  locale,
}: {
  item: Pick<PayrollRunItem, "source" | "input" | "result" | "updated_at">;
  locale: Locale;
}) {
  const d = payrollDictionary(locale),
    rd = payrollRunDictionary(locale),
    input = item.input;
  const inputRows = [
    "month",
    "basic",
    "bonus",
    "hours",
    "meals",
    "advance",
    "floorException",
    "evidence",
    "mealsReference",
    "advanceReference",
    "primary",
    "dependants",
    "young",
    "children",
    "reduced",
  ] as const;
  return (
    <section className="card table-card">
      <div className="card-heading">
        <h2>
          {rd.snapshot} · {item.source.employee.name}
        </h2>
      </div>
      <p className="time-padding time-help">
        {rd.savedOn}: {dateLabel(item.updated_at, locale)} · {d.rules}:{" "}
        {item.result.rules}
      </p>
      {item.input.period && (
        <div className="time-padding">
          {payrollPeriodLines(item.input, locale, item.result).map(
            (line, i) => (
              <p key={i}>{line}</p>
            ),
          )}
        </div>
      )}
      <details className="time-padding">
        <summary>{rd.inputs}</summary>
        <div className="table-scroll">
          <table>
            <tbody>
              {inputRows.map((k) => {
                const value =
                  k === "floorException"
                    ? floorExceptionLabels(locale)[input.floorException]
                    : k === "primary" || k === "young" || k === "reduced"
                      ? input[k] === "yes"
                        ? d.yes
                        : d.no
                      : k === "basic" ||
                          k === "bonus" ||
                          k === "meals" ||
                          k === "advance"
                        ? moneyLabel(input[k], locale)
                        : String(input[k] ?? "");
                return (
                  <tr key={k}>
                    <th>{d[k]}</th>
                    <td>{value || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
      <div className="table-scroll">
        <table>
          <tbody>
            {payrollRows.map((k) => (
              <tr key={k}>
                <th>{d[k]}</th>
                <td>
                  <strong>{moneyLabel(item.result[k], locale)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function PayrollRunPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase, organisation } = await requireHR(),
    locale = await getLocale(),
    d = payrollRunDictionary(locale),
    hd = payrollHandoverDictionary(locale),
    pd = payrollDictionary(locale),
    dd = documentDictionary(locale),
    { id } = await params,
    q = await searchParams;
  if (!idSchema.safeParse(id).success) notFound();
  const response = await supabase
    .from("payroll_runs")
    .select("*")
    .eq("organisation_id", organisation.id)
    .eq("id", id)
    .maybeSingle();
  if (response.error) throw new Error("Payroll run could not be loaded.");
  if (!response.data) notFound();
  const run = response.data,
    month = run.month.slice(0, 7),
    writable = organisation.status === "active",
    editable = writable && run.status === "draft",
    historyPage = Math.min(
      10000,
      Math.max(1, Math.floor(Number(singleParam(q.history))) || 1),
    ),
    exportPage = Math.min(
      10000,
      Math.max(1, Math.floor(Number(singleParam(q.exports))) || 1),
    );
  const [entries, events, latest, members, handovers, correction] =
    await Promise.all([
      supabase
        .from("payroll_run_items")
        .select("*")
        .eq("organisation_id", organisation.id)
        .eq("run_id", id)
        .order("updated_at")
        .order("id")
        .limit(201),
      supabase
        .from("payroll_run_events")
        .select("*", { count: "exact" })
        .eq("organisation_id", organisation.id)
        .eq("run_id", id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range((historyPage - 1) * 20, historyPage * 20 - 1),
      supabase
        .from("payroll_runs")
        .select("id,revision")
        .eq("organisation_id", organisation.id)
        .eq("month", run.month)
        .eq("status", "approved")
        .order("revision", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("organisation_users")
        .select("user_id,display_name,email")
        .eq("organisation_id", organisation.id),
      run.status === "approved"
        ? supabase
            .from("payroll_handover_exports")
            .select("*", { count: "exact" })
            .eq("organisation_id", organisation.id)
            .eq("run_id", id)
            .order("prepared_at", { ascending: false })
            .order("id", { ascending: false })
            .range((exportPage - 1) * 20, exportPage * 20 - 1)
        : { data: [], error: null, count: 0 },
      run.status === "approved"
        ? supabase
            .from("payroll_runs")
            .select("id")
            .eq("organisation_id", organisation.id)
            .eq("month", run.month)
            .eq("status", "draft")
            .limit(1)
            .maybeSingle()
        : { data: null, error: null },
    ]);
  if (
    entries.error ||
    events.error ||
    latest.error ||
    members.error ||
    handovers.error ||
    correction.error
  )
    throw new Error("Payroll calculations and history could not be loaded.");
  if (entries.data.length > 200)
    throw new Error("Payroll item limit exceeded.");
  const items = entries.data,
    selected = singleParam(q.employee) || items[0]?.employee_id || "",
    savedItem = items.find((item) => item.employee_id === selected);
  const documentPage = Math.min(
    10000,
    Math.max(1, Math.floor(Number(singleParam(q.documents))) || 1),
  );
  const documents = savedItem
    ? await supabase
        .from("payroll_run_documents")
        .select("*", { count: "exact" })
        .eq("organisation_id", organisation.id)
        .eq("run_id", id)
        .eq("item_id", savedItem.id)
        .order("created_at", { ascending: false })
        .order("document_id", { ascending: false })
        .range((documentPage - 1) * 20, documentPage * 20 - 1)
    : { data: [], error: null, count: 0 };
  if (documents.error)
    throw new Error("Payroll document records could not be loaded.");
  const files = documents.data.length
    ? await supabase
        .from("employee_documents")
        .select("id,title,ready_at,status")
        .eq("organisation_id", organisation.id)
        .in(
          "id",
          documents.data.map((doc) => doc.document_id),
        )
    : { data: [], error: null };
  if (files.error) throw new Error("Payroll documents could not be loaded.");
  const people =
    run.status === "draft"
      ? await timeEmployees(selected, singleParam(q.q))
      : null;
  if (run.status !== "draft" && selected && !savedItem) notFound();
  const employee = people?.employee;
  const nextMonth = new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1),
  )
    .toISOString()
    .slice(0, 10);
  const periodContext =
    editable && employee
      ? await supabase.rpc("payroll_period_context", {
          p_org: organisation.id,
          p_employee: employee.id,
          p_month: run.month,
        })
      : { data: null, error: null };
  const totalRows = [
    "cashGross",
    "meals",
    "cas",
    "cass",
    "incomeTax",
    "net",
    "advance",
    "payable",
    "employerCas",
    "employerCass",
    "cam",
    "employerCost",
  ] as const;
  const total = (key: (typeof totalRows)[number]) =>
    items.reduce((sum, item) => sum + Math.round(item.result[key] * 100), 0) /
    100;
  const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Bucharest",
    }).format(new Date()),
    closedMonth = nextMonth <= today,
    newer =
      latest.data && latest.data.revision > run.revision ? latest.data : null;
  const href = (employeeId: string, page = historyPage) =>
    `?${new URLSearchParams({ employee: employeeId, history: String(page) })}`;
  const exportHref = (page: number) =>
    `?${new URLSearchParams({
      employee: selected,
      history: String(historyPage),
      documents: String(documentPage),
      exports: String(page),
    })}#handover-history`;
  const timestamp = (value: string) =>
    new Intl.DateTimeFormat(locale === "ro" ? "ro-RO" : "en-GB", {
      timeZone: "Europe/Bucharest",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  return (
    <>
      <PageHeader
        title={`${d.title} · ${month} · ${d.revision} ${run.revision}`}
        description={d[run.status]}
      />
      <Link href="/payroll" className="button secondary">
        {d.back}
      </Link>
      <p className="time-help">{d.scope}</p>
      {!writable && <p className="notice">{d.inactive}</p>}
      {run.reason && (
        <p className="notice privacy-text">
          <strong>{d.reason}: </strong>
          {run.reason}
        </p>
      )}
      {run.previous_run_id && (
        <Link href={`/payroll/runs/${run.previous_run_id}`}>
          {d.previousRevision}
        </Link>
      )}
      {newer && (
        <p className="notice">
          <Link href={`/payroll/runs/${newer.id}`}>
            {d.newerRevision} · {d.revision} {newer.revision}
          </Link>
        </p>
      )}
      {run.status === "approved" && (
        <p className="notice">
          {d.approvedHelp} {d.approvedOn}: {dateLabel(run.approved_at, locale)}
        </p>
      )}
      <section className="card table-card">
        <div className="card-heading">
          <h2>
            {d.included} ({items.length})
          </h2>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{d.employee}</th>
                <th>{pd.cashGross}</th>
                <th>{pd.payable}</th>
                <th>{pd.employerCost}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.source.employee.name}</td>
                  <td>{moneyLabel(item.result.cashGross, locale)}</td>
                  <td>{moneyLabel(item.result.payable, locale)}</td>
                  <td>{moneyLabel(item.result.employerCost, locale)}</td>
                  <td>
                    <Link href={href(item.employee_id)}>{d.edit}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!items.length && <p className="time-padding">{d.emptyItems}</p>}
      </section>
      {!!items.length && (
        <details className="card time-form-card" open>
          <summary>{d.totals}</summary>
          <div className="table-scroll">
            <table>
              <tbody>
                <tr>
                  <th>{d.count}</th>
                  <td>{items.length}</td>
                </tr>
                {totalRows.map((key) => (
                  <tr key={key}>
                    <th>{pd[key]}</th>
                    <td>{moneyLabel(total(key), locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      {run.status === "approved" && (
        <section className="card time-form-card">
          <h2>{hd.title}</h2>
          <PayrollHandoverForm
            key={`${id}:${run.version}:${latest.data?.revision ?? run.revision}`}
            runId={id}
            runVersion={run.version}
            month={month}
            revision={run.revision}
            locale={locale}
            isHistorical={!!newer}
            latestRevision={latest.data?.revision ?? run.revision}
            hasOpenCorrection={!!correction.data}
            active={writable}
          />
        </section>
      )}
      {run.status === "draft" && people && (
        <>
          <form method="get" className="time-filters">
            <label className="field time-field">
              <span>{dd.search}</span>
              <input name="q" type="search" defaultValue={singleParam(q.q)} />
            </label>
            <EmployeeFilter
              employees={people.options}
              selected={employee?.id}
              locale={locale}
              empty={false}
            />
            <button className="button secondary">{dd.filter}</button>
          </form>
          {people.hasMore && <p className="time-help">{dd.more}</p>}
          {editable && employee && periodContext.data ? (
            <section className="card time-form-card">
              <h2>
                {employee.first_name} {employee.last_name}
              </h2>
              <PayrollForm
                key={`${employee.id}:${run.version}:${JSON.stringify(periodContext.data)}`}
                employeeId={employee.id}
                runId={id}
                runVersion={run.version}
                month={month}
                basic={periodContext.data.basic}
                hours={periodContext.data.hours}
                periodContext={periodContext.data}
                savedInput={savedItem?.input}
                locale={locale}
              />
            </section>
          ) : (
            <p className="notice">
              {!employee
                ? dd.choose
                : editable
                  ? payrollPeriodDictionary(locale).unavailable
                  : d.inactive}
            </p>
          )}
        </>
      )}
      {savedItem && (
        <>
          <SavedCalculation item={savedItem} locale={locale} />
          <section className="card time-form-card">
            <Link
              className="button secondary"
              href={`/documents?employee=${savedItem.employee_id}`}
            >
              {d.documents}
            </Link>
            {editable && (
              <>
                <p className="time-help">{d.removeHelp}</p>
                <PayrollEntryRemoveForm
                  key={`${savedItem.id}:${run.version}`}
                  locale={locale}
                  run={run}
                  itemId={savedItem.id}
                />
              </>
            )}
            {run.status === "approved" && (
              <>
                <p className="time-help">{d.pdfHelp}</p>
                {writable && (
                  <PayrollApprovedPdfForm
                    key={savedItem.id}
                    locale={locale}
                    runId={id}
                    itemId={savedItem.id}
                  />
                )}
                {!!documents.data.length && (
                  <>
                    <h3>{d.linkedPdfs}</h3>
                    <ul>
                      {documents.data.map((document) => {
                        const file = files.data.find(
                          (file) => file.id === document.document_id,
                        );
                        return (
                          <li key={document.document_id}>
                            {timestamp(document.created_at)} ·{" "}
                            {document.locale.toUpperCase()} · {file?.title} ·{" "}
                            {file?.ready_at ? d.readyPdf : d.pendingPdf}
                            {file?.status === "archived"
                              ? ` · ${locale === "ro" ? "Arhivat" : "Archived"}`
                              : ""}
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
                <nav className="heading-actions" aria-label={d.linkedPdfs}>
                  {documentPage > 1 && (
                    <Link
                      href={`?employee=${savedItem.employee_id}&documents=${documentPage - 1}`}
                    >
                      {d.previous}
                    </Link>
                  )}
                  {documentPage * 20 < (documents.count ?? 0) && (
                    <Link
                      href={`?employee=${savedItem.employee_id}&documents=${documentPage + 1}`}
                    >
                      {d.next}
                    </Link>
                  )}
                </nav>
              </>
            )}
          </section>
        </>
      )}
      {editable && (
        <>
          <section className="card time-form-card">
            <h2>{d.approve}</h2>
            <p className="time-help">{d.scope}</p>
            {!closedMonth && <p className="notice">{d.closedMonthOnly}</p>}
            <PayrollRunApproveForm
              key={run.version}
              locale={locale}
              run={run}
              eligible={closedMonth && items.length > 0}
            />
          </section>
          <details className="card time-form-card">
            <summary>{d.discard}</summary>
            <PayrollRunDiscardForm
              key={run.version}
              locale={locale}
              run={run}
            />
          </details>
        </>
      )}
      {writable && run.status === "approved" && !newer && (
        <section className="card time-form-card">
          <h2>{d.correction}</h2>
          <PayrollRunCreateForm locale={locale} month={month} previous={id} />
        </section>
      )}
      {run.status === "approved" && (
        <section className="card table-card" id="handover-history">
          <div className="card-heading">
            <h2>{hd.history}</h2>
          </div>
          <p className="time-padding time-help">{hd.historyHelp}</p>
          {!handovers.data.length ? (
            <p className="time-padding">{hd.noHistory}</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{hd.preparedAt}</th>
                    <th>{hd.preparedBy}</th>
                    <th>{hd.revision}</th>
                    <th>{hd.employees}</th>
                    <th>{hd.language}</th>
                    <th>{hd.context}</th>
                  </tr>
                </thead>
                <tbody>
                  {handovers.data.map((record) => (
                    <tr key={record.id}>
                      <td>
                        {timestamp(record.prepared_at)}
                        <details>
                          <summary>{hd.reference}</summary>
                          <small>{record.id}</small>
                        </details>
                      </td>
                      <td>
                        {members.data.find(
                          (member) => member.user_id === record.prepared_by,
                        )?.display_name ?? d.unavailableActor}
                      </td>
                      <td>{record.revision}</td>
                      <td>{record.employee_count}</td>
                      <td>{record.locale.toUpperCase()}</td>
                      <td>
                        {record.is_historical
                          ? hd.historicalLabel
                          : hd.currentLabel}
                        {record.is_historical && (
                          <>
                            <br />
                            {hd.latestRevision}:{" "}
                            {record.latest_approved_revision}
                          </>
                        )}
                        {record.has_open_correction && (
                          <>
                            <br />
                            {hd.correctionLabel}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <nav className="heading-actions time-padding" aria-label={hd.history}>
            {exportPage > 1 && (
              <Link href={exportHref(exportPage - 1)}>{d.previous}</Link>
            )}
            {exportPage * 20 < (handovers.count ?? 0) && (
              <Link href={exportHref(exportPage + 1)}>{d.next}</Link>
            )}
          </nav>
        </section>
      )}
      <section className="card time-form-card">
        <h2>{d.history}</h2>
        <p className="time-help">{d.historyHelp}</p>
        {!events.data.length && <p>{d.noHistory}</p>}
        {events.data.map((event) => (
          <details key={event.id} className="time-padding">
            <summary>
              {timestamp(event.created_at)} ·{" "}
              {payrollEventLabel(event.action, locale)}
            </summary>
            <p>
              {d.actor}:{" "}
              {members.data.find((member) => member.user_id === event.actor_id)
                ?.display_name ?? d.unavailableActor}
            </p>
            {typeof event.snapshot.reason === "string" && (
              <p className="privacy-text">
                {d.reason}: {event.snapshot.reason}
              </p>
            )}
            {typeof event.snapshot.month === "string" && (
              <p>
                {d.month}: {event.snapshot.month}
              </p>
            )}
            {typeof event.snapshot.revision === "number" && (
              <p>
                {d.revision}: {event.snapshot.revision}
              </p>
            )}
            {event.snapshot.input &&
            event.snapshot.result &&
            event.snapshot.source ? (
              <SavedCalculation
                locale={locale}
                item={{
                  input: event.snapshot.input as PayrollRunItem["input"],
                  result: event.snapshot.result as PayrollRunItem["result"],
                  source: event.snapshot.source as PayrollRunItem["source"],
                  updated_at: event.created_at,
                }}
              />
            ) : null}
          </details>
        ))}
        <nav className="heading-actions" aria-label={d.history}>
          {historyPage > 1 && (
            <Link href={href(selected, historyPage - 1)}>{d.previous}</Link>
          )}
          {historyPage * 20 < (events.count ?? 0) && (
            <Link href={href(selected, historyPage + 1)}>{d.next}</Link>
          )}
        </nav>
      </section>
    </>
  );
}

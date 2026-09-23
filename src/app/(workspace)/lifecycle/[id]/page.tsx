import Link from "next/link";
import { notFound } from "next/navigation";
import { requireHR } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { documentDictionary, lifecycleTaskLabel } from "@/lib/document-i18n";
import { idSchema } from "@/lib/validation";
import { dateLabel } from "@/lib/i18n";
import { PageHeader } from "@/components/ui";
import {
  TaskForm,
  RevokeForm,
  CaseManagement,
} from "@/components/document-forms";
export default async function LifecycleDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const { supabase, organisation, membership } = await requireHR(),
    locale = await getLocale(),
    d = documentDictionary(locale);
  const { data: c, error } = await supabase
    .from("lifecycle_cases")
    .select("*")
    .eq("organisation_id", organisation.id)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Checklist could not be loaded.");
  if (!c) notFound();
  const [employeeResult, taskResult] = await Promise.all([
    supabase
      .from("employees")
      .select("id,first_name,last_name,user_id")
      .eq("organisation_id", organisation.id)
      .eq("id", c.employee_id)
      .single(),
    supabase
      .from("lifecycle_tasks")
      .select("*")
      .eq("organisation_id", organisation.id)
      .eq("case_id", id)
      .order("position")
      .limit(100),
  ]);
  if (employeeResult.error || taskResult.error)
    throw new Error("Checklist details could not be loaded.");
  const employee = employeeResult.data,
    tasks = taskResult.data,
    writable = organisation.status === "active" && c.status === "active";
  const progress = tasks.filter((t) => t.status !== "todo").length;
  return (
    <>
      <Link className="back-link" href={`/lifecycle?employee=${employee.id}`}>
        {d.back}
      </Link>
      <PageHeader
        title={`${d[c.kind]} · ${employee.first_name} ${employee.last_name}`}
        description={`${d[c.status]} · ${d.target}: ${dateLabel(c.target_date, locale)} · ${progress}/${tasks.length} ${d.tasks.toLowerCase()}`}
      />
      <div className="time-actions">
        <Link className="button secondary" href={`/employees/${employee.id}`}>
          {d.employee}
        </Link>
        <Link
          className="button secondary"
          href={`/documents?employee=${employee.id}`}
        >
          {d.title}
        </Link>
        <Link
          className="button secondary"
          href={`/benefits?employee=${employee.id}`}
        >
          {lifecycleTaskLabel("benefits", locale)}
        </Link>
        <Link className="button secondary" href="/settings/team">
          {lifecycleTaskLabel("account", locale)}
        </Link>
      </div>
      <p className="notice">{d.manualHelp}</p>
      <section className="card time-padding">
        <h2>{d.tasks}</h2>
        {tasks.map((t) => (
          <details className="time-setting-row" key={t.id}>
            <summary>
              <span>
                {t.task_key === "custom"
                  ? t.title
                  : lifecycleTaskLabel(t.task_key, locale)}
              </span>
              <span className="document-task-state">{d[t.status]}</span>
            </summary>
            {t.note && <p className="document-note">{t.note}</p>}
            {t.completed_at && (
              <p className="time-help">
                {d.completedAt}: {dateLabel(t.completed_at, locale)}
              </p>
            )}
            {writable &&
              (t.task_key === "revoke_access" ? (
                membership.role === "organisation_owner" ? (
                  <RevokeForm
                    task={t}
                    userId={employee.user_id}
                    locale={locale}
                  />
                ) : (
                  <p className="notice">{d.ownerOnly}</p>
                )
              ) : (
                <TaskForm task={t} locale={locale} />
              ))}
          </details>
        ))}
      </section>
      {c.close_note && <p className="notice document-note">{c.close_note}</p>}
      {writable && <CaseManagement record={c} locale={locale} />}
    </>
  );
}

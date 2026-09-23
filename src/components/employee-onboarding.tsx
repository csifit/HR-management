import Link from "next/link";
import { requireHR } from "@/lib/auth";
import { lifecycleTaskLabel } from "@/lib/document-i18n";
import type { Locale } from "@/lib/i18n";
import { InvitationForm } from "./invitation-forms";
import { CompactTask } from "./onboarding-task";
export async function EmployeeOnboarding({
  employeeId,
  linked,
  locale,
}: {
  employeeId: string;
  linked: boolean;
  locale: Locale;
}) {
  const { supabase, organisation } = await requireHR(),
    ro = locale === "ro",
    writable = organisation.status === "active";
  const [cases, invites] = await Promise.all([
    supabase
      .from("lifecycle_cases")
      .select("*")
      .eq("organisation_id", organisation.id)
      .eq("employee_id", employeeId)
      .eq("kind", "onboarding")
      .eq("status", "active")
      .limit(1),
    supabase
      .from("employee_invitations")
      .select("*")
      .eq("organisation_id", organisation.id)
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  if (cases.error || invites.error)
    throw new Error("Onboarding could not be loaded.");
  const current = cases.data[0],
    invite = invites.data[0];
  const tasks = current
    ? await supabase
        .from("lifecycle_tasks")
        .select("*")
        .eq("organisation_id", organisation.id)
        .eq("case_id", current.id)
        .order("position")
    : { data: [], error: null };
  if (tasks.error) throw new Error("Checklist could not be loaded.");
  const done = tasks.data.filter((t) => t.status !== "todo").length;
  const labels = ro
    ? {
        unsent: "Netrimisă",
        sending: "Trimitere în curs / rezultat neconfirmat",
        accepted: "Acceptată de serverul de email",
        failed: "Trimitere eșuată",
        uncertain: "Rezultat necunoscut — verifică jurnalul email",
      }
    : {
        unsent: "Not sent",
        sending: "Sending / result unconfirmed",
        accepted: "Accepted by mail server",
        failed: "Sending failed",
        uncertain: "Unknown result — check email logs",
      };
  return (
    <section className="card onboarding-compact">
      <div className="onboarding-top">
        <h2>
          {ro ? "Primii pași" : "Getting started"}{" "}
          {current && (
            <small>
              {done}/{tasks.data.length}
            </small>
          )}
        </h2>
        <Link
          href={
            current
              ? `/lifecycle/${current.id}`
              : `/lifecycle?employee=${employeeId}`
          }
        >
          {ro ? "Lista completă" : "Full checklist"} →
        </Link>
      </div>
      <div className="onboarding-body">
        <div className="onboarding-invite">
          <strong>{ro ? "Acces angajat" : "Employee access"}</strong>
          <p>
            {linked
              ? ro
                ? "Cont conectat."
                : "Account connected."
              : invite?.status === "pending"
                ? labels[invite.delivery_status]
                : ro
                  ? "Nu există o invitație activă."
                  : "No active invitation."}
          </p>
          {!linked && invite?.status === "pending" && (
            <p className="time-help">
              {ro ? "Valabilă până la" : "Valid until"}{" "}
              {new Intl.DateTimeFormat(ro ? "ro-RO" : "en-GB", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Europe/Bucharest",
              }).format(new Date(invite.expires_at))}
            </p>
          )}
          {!linked && writable && (
            <>
              <p className="time-help">
                {ro
                  ? "O invitație nouă o înlocuiește pe cea anterioară. Angajatul trebuie să confirme aceeași adresă de email."
                  : "A new invitation replaces the previous one. The employee must verify the matching email address."}
              </p>
              <div className="time-actions">
                <InvitationForm
                  employeeId={employeeId}
                  operation="send"
                  locale={locale}
                />
                {invite?.status === "pending" && (
                  <InvitationForm
                    id={invite.id}
                    employeeId={employeeId}
                    operation="revoke"
                    locale={locale}
                  />
                )}
              </div>
            </>
          )}
        </div>
        {current ? (
          <ul className="onboarding-checks">
            {tasks.data.map((task) => (
              <li key={`${task.id}-${task.version}`}>
                <CompactTask
                  task={task}
                  label={
                    task.title || lifecycleTaskLabel(task.task_key, locale)
                  }
                  locale={locale}
                  writable={writable}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="time-help">
            {ro
              ? "Deschide lista completă pentru a porni pașii de angajare."
              : "Open the full checklist to start onboarding."}
          </p>
        )}
      </div>
    </section>
  );
}

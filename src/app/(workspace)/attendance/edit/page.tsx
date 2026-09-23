import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireOrganisation } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { canManage } from "@/lib/types";
import { timeDictionary } from "@/lib/time-i18n";
import { timeEmployees } from "@/lib/time-data";
import { singleParam } from "@/lib/time";
import { timeDate } from "@/lib/time-validation";
import { PageHeader } from "@/components/ui";
import { AttendanceForm } from "@/components/time-forms";
export default async function AttendanceEdit({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase, organisation, membership, user } =
    await requireOrganisation();
  const q = await searchParams;
  const parsed = timeDate.safeParse(singleParam(q.day));
  if (!parsed.success) notFound();
  const { employee } = await timeEmployees(singleParam(q.employee));
  if (!employee) notFound();
  const locale = await getLocale();
  const d = timeDictionary(locale);
  const month = parsed.data.slice(0, 7);
  const back = `/attendance?employee=${employee.id}&month=${month}`;
  if (
    organisation.status !== "active" ||
    (!canManage(membership.role) &&
      !(membership.role === "manager" && employee.manager_user_id === user.id))
  )
    redirect(back);
  const { data, error } = await supabase.rpc("attendance_month", {
    p_org: organisation.id,
    p_employee: employee.id,
    p_month: `${month}-01`,
  });
  if (error) throw new Error("Attendance could not be loaded.");
  const day = data.find((row) => row.day === parsed.data);
  if (!day || day.day < employee.start_date) notFound();
  return (
    <>
      <Link className="back-link" href={back}>
        ← {d.back}
      </Link>
      <PageHeader
        title={`${d.edit} · ${day.day}`}
        description={`${employee.first_name} ${employee.last_name}`}
      />
      <section className="card time-form-card">
        {day.leave_request_id ? (
          <p>{d.fromLeave}</p>
        ) : (
          <AttendanceForm
            key={`${employee.id}-${day.day}-${day.version ?? "new"}`}
            employeeId={employee.id}
            day={day}
            locale={locale}
          />
        )}
      </section>
    </>
  );
}

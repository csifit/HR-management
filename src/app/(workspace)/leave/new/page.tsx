import Link from "next/link";
import { requireOrganisation } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { canManage } from "@/lib/types";
import { timeDictionary } from "@/lib/time-i18n";
import { singleParam } from "@/lib/time";
import { timeEmployees } from "@/lib/time-data";
import { PageHeader } from "@/components/ui";
import { LeaveRequestForm } from "@/components/time-forms";
import { redirect } from "next/navigation";
export default async function NewLeavePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase, organisation, membership } = await requireOrganisation();
  if (organisation.status !== "active") redirect("/leave");
  const locale = await getLocale();
  const d = timeDictionary(locale);
  const query = await searchParams;
  const hr = canManage(membership.role);
  const [{ options, employee, hasMore }, types] = await Promise.all([
    timeEmployees(singleParam(query.employee), singleParam(query.q), !hr),
    supabase
      .from("leave_types")
      .select("*")
      .eq("organisation_id", organisation.id)
      .eq("active", true)
      .order("name"),
  ]);
  if (types.error) throw new Error("Leave types could not be loaded.");
  return (
    <>
      <Link className="back-link" href="/leave">
        ← {d.back}
      </Link>
      <PageHeader title={d.request} description={d.leaveIntro} />
      {hr && (
        <form className="time-filters" action="/leave/new">
          <label className="field time-field">
            <span>{d.search}</span>
            <input
              name="q"
              type="search"
              maxLength={80}
              defaultValue={singleParam(query.q)}
            />
          </label>
          <button className="button secondary">{d.filter}</button>
        </form>
      )}
      {hasMore && <p className="notice">{d.searchHint}</p>}
      {options.length ? (
        <section className="card time-form-card">
          <LeaveRequestForm
            employees={options}
            selected={employee?.id}
            types={types.data}
            locale={locale}
          />
        </section>
      ) : (
        <p className="notice">{hr ? d.noEmployees : d.noAccount}</p>
      )}
    </>
  );
}

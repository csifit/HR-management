import { requireHR } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { dictionary, roleLabel } from "@/lib/i18n";
import { PageHeader, Avatar } from "@/components/ui";
import { MemberForm } from "@/components/forms";
export default async function TeamPage() {
  const { supabase, organisation, membership, user } = await requireHR();
  const locale = await getLocale();
  const d = dictionary(locale);
  const [members, employees] = await Promise.all([
    supabase
      .from("organisation_users")
      .select("*")
      .eq("organisation_id", organisation.id)
      .order("created_at"),
    supabase
      .from("employees")
      .select("*")
      .eq("organisation_id", organisation.id)
      .is("user_id", null)
      .order("last_name"),
  ]);
  if (members.error || employees.error)
    throw new Error("Team access could not be loaded.");
  return (
    <>
      <PageHeader title={d.team} description={d.teamIntro} />
      <div className="settings-grid">
        <section className="card table-card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{d.fullName}</th>
                  <th>{d.role}</th>
                </tr>
              </thead>
              <tbody>
                {members.data.map((m) => (
                  <tr key={m.user_id}>
                    <td>
                      <div className="employee-cell">
                        <Avatar name={m.display_name} />
                        <div>
                          <strong>
                            {m.display_name}
                            {m.user_id === user.id ? ` (${d.currentUser})` : ""}
                          </strong>
                          <small>{m.email}</small>
                        </div>
                      </div>
                    </td>
                    <td>{roleLabel(m.role, d)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        {membership.role === "organisation_owner" &&
        organisation.status === "active" ? (
          <section className="card member-form-card">
            <h2>{d.addMember}</h2>
            <MemberForm locale={locale} employees={employees.data} />
          </section>
        ) : organisation.status === "active" ? (
          <p className="notice">{d.teamOwnerOnly}</p>
        ) : null}
      </div>
    </>
  );
}

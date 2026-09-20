import Link from "next/link";
import { redirect } from "next/navigation";
import { getOrganisationContext } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { platformDictionary } from "@/lib/platform-i18n";
import { Brand } from "@/components/ui";
import { LanguageSwitch } from "@/components/shell";
import { signOut, switchOrganisation } from "@/app/actions";
export default async function OrganisationAccessPage() {
  const { supabase, organisation, memberships } =
    await getOrganisationContext();
  if (organisation.status !== "blocked") redirect("/dashboard");
  const locale = await getLocale();
  const d = platformDictionary(locale);
  const [admin, orgs] = await Promise.all([
    supabase.rpc("is_platform_admin"),
    supabase
      .from("organisations")
      .select("id,name")
      .in(
        "id",
        memberships.map((m) => m.organisation_id),
      ),
  ]);
  if (admin.error || orgs.error)
    throw new Error("Organisation access could not be loaded.");
  return (
    <div className="standalone-page">
      <header>
        <Brand />
        <LanguageSwitch locale={locale} />
      </header>
      <main className="setup-card card">
        <h1>{organisation.name}</h1>
        <p className="notice error">{d.blockedBanner}</p>
        {organisation.status_reason && (
          <p className="platform-section-intro">
            <strong>{d.reason}: </strong>
            {organisation.status_reason}
          </p>
        )}
        {orgs.data.length > 1 && (
          <form action={switchOrganisation} className="form-stack">
            <div className="field">
              <label htmlFor="organisation_id">{d.switchOrg}</label>
              <select
                id="organisation_id"
                name="organisation_id"
                defaultValue={organisation.id}
              >
                {orgs.data.map((o) => (
                  <option value={o.id} key={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
            <button className="button secondary">{d.workspace}</button>
          </form>
        )}
        <div className="onboarding-footer">
          {admin.data && (
            <Link className="button primary" href="/platform">
              {d.title}
            </Link>
          )}
          <form action={signOut}>
            <button className="text-button">{d.signOut}</button>
          </form>
        </div>
      </main>
    </div>
  );
}

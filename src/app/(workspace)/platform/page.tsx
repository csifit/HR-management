import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { dictionary, dateLabel } from "@/lib/i18n";
import { PageHeader } from "@/components/ui";
export default async function PlatformPage() {
  const { supabase } = await requireUser();
  const admin = await supabase.rpc("is_platform_admin");
  if (admin.error || !admin.data) notFound();
  const { data, error } = await supabase.rpc("platform_organisations");
  if (error) throw new Error("Organisations could not be loaded.");
  const locale = await getLocale();
  const d = dictionary(locale);
  return (
    <>
      <PageHeader title={d.platform} description={d.platformIntro} />
      <div className="card table-scroll">
        <table>
          <thead>
            <tr>
              <th>{d.orgName}</th>
              <th>{d.cui}</th>
              <th>{d.created}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((org) => (
              <tr key={org.id}>
                <td>{org.name}</td>
                <td>{org.cui}</td>
                <td>{dateLabel(org.created_at, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

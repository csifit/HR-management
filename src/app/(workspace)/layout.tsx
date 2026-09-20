import { AppShell } from "@/components/shell";
import { requireOrganisation } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { supabase, organisation, membership, memberships } =
    await requireOrganisation();
  const [locale, orgs, admin] = await Promise.all([
    getLocale(),
    supabase
      .from("organisations")
      .select("id,name")
      .in(
        "id",
        memberships.map((m) => m.organisation_id),
      ),
    supabase.rpc("is_platform_admin"),
  ]);
  if (orgs.error || admin.error)
    throw new Error("Workspace could not be loaded.");
  return (
    <AppShell
      locale={locale}
      organisation={organisation}
      membership={membership}
      organisations={orgs.data ?? []}
      platformAdmin={admin.data === true}
    >
      {children}
    </AppShell>
  );
}

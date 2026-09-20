import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { platformDictionary } from "@/lib/platform-i18n";
import { PageHeader } from "@/components/ui";
import { PlatformOrganisationForm } from "@/components/platform-forms";
export default async function NewPlatformOrganisation() {
  await requirePlatformAdmin();
  const locale = await getLocale();
  const d = platformDictionary(locale);
  return (
    <>
      <Link className="back-link" href="/platform">
        <ArrowLeft size={16} />
        {d.back}
      </Link>
      <PageHeader title={d.add} description={d.profileHint} />
      <section className="card platform-create">
        <PlatformOrganisationForm locale={locale} />
      </section>
    </>
  );
}

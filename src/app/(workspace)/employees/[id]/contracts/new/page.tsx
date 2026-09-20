import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireHR } from "@/lib/auth";
import { getEmployee } from "@/lib/data";
import { getLocale } from "@/lib/locale";
import { dictionary } from "@/lib/i18n";
import { PageHeader } from "@/components/ui";
import { ContractForm } from "@/components/forms";
export default async function NewContractPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireHR(true);
  const { employee } = await getEmployee((await params).id);
  const locale = await getLocale();
  const d = dictionary(locale);
  return (
    <div className="form-container">
      <Link
        className="back-link"
        href={`/employees/${employee.id}?tab=contract`}
      >
        <ArrowLeft size={16} />
        {employee.first_name} {employee.last_name}
      </Link>
      <PageHeader title={d.addContract} description={d.contractIntro} />
      <ContractForm locale={locale} employee={employee} />
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireHR } from "@/lib/auth";
import { getEmployee } from "@/lib/data";
import { getLocale } from "@/lib/locale";
import { dictionary } from "@/lib/i18n";
import { idSchema } from "@/lib/validation";
import { PageHeader } from "@/components/ui";
import { ContractForm } from "@/components/forms";
export default async function EditContractPage({
  params,
}: {
  params: Promise<{ id: string; contractId: string }>;
}) {
  await requireHR(true);
  const { id, contractId } = await params;
  if (!idSchema.safeParse(contractId).success) notFound();
  const { employee, supabase, organisation } = await getEmployee(id);
  const { data: contract, error } = await supabase
    .from("employment_contracts")
    .select("*")
    .eq("id", contractId)
    .eq("employee_id", id)
    .eq("organisation_id", organisation.id)
    .maybeSingle();
  if (error) throw new Error("Contract could not be loaded.");
  if (!contract) notFound();
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
      <PageHeader title={d.editContract} description={d.contractIntro} />
      <ContractForm locale={locale} employee={employee} contract={contract} />
    </div>
  );
}

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireHR } from "@/lib/auth";
import { getEmployee, getManagers } from "@/lib/data";
import { getLocale } from "@/lib/locale";
import { dictionary } from "@/lib/i18n";
import { PageHeader } from "@/components/ui";
import { EmployeeForm } from "@/components/forms";
export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireHR();
  const { employee } = await getEmployee((await params).id);
  const locale = await getLocale();
  const d = dictionary(locale);
  return (
    <div className="form-container">
      <Link className="back-link" href={`/employees/${employee.id}`}>
        <ArrowLeft size={16} />
        {d.back}
      </Link>
      <PageHeader
        title={`${d.edit}: ${employee.first_name} ${employee.last_name}`}
      />
      <EmployeeForm
        locale={locale}
        employee={employee}
        managers={await getManagers()}
      />
    </div>
  );
}

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireHR } from "@/lib/auth";
import { getManagers } from "@/lib/data";
import { getLocale } from "@/lib/locale";
import { dictionary } from "@/lib/i18n";
import { PageHeader } from "@/components/ui";
import { EmployeeForm } from "@/components/forms";
export default async function NewEmployeePage() {
  await requireHR(true);
  const locale = await getLocale();
  const d = dictionary(locale);
  const managers = await getManagers();
  return (
    <div className="form-container">
      <Link className="back-link" href="/employees">
        <ArrowLeft size={16} />
        {d.employees}
      </Link>
      <PageHeader title={d.addEmployee} description={d.newEmployeeIntro} />
      <EmployeeForm locale={locale} managers={managers} />
    </div>
  );
}

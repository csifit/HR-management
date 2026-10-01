import type { Locale } from "./i18n";
import { moneyLabel } from "./i18n.ts";
import type { PayrollInput, PayrollResult } from "./payroll";
const en = {
  title: "Termination settlement",
  include: "Include a termination settlement",
  days: "Confirmed unused annual-leave days",
  dailyGross: "Accountant-approved daily gross rate (RON)",
  balanceReference: "Unused-day balance review reference",
  rateReference: "Accountant rate approval reference",
  otherGross: "Other fully taxable termination pay (RON)",
  otherReference: "Other payment approval reference",
  unusedGross: "Unused annual-leave compensation (gross RON)",
  help: "Available only in the actual termination month. HR confirms the accrued unused days, including carryover and leave taken. The accountant approves the daily rate, including permanent pay components, historical bases and applicable minimum. These facts are not inferred from the configured allowance. Enter actual gross amounts; do not include them again in bonus.",
  confirm:
    "I reviewed the final leave balance and accountant-approved rate. These amounts are due at actual termination, have not been settled elsewhere and are ordinary fully taxable private-sector salary income. No exempt awards, damages, special public-sector restrictions, recoveries or later-month payments. No pending leave remains.",
  unavailable:
    "Settlement requires a terminated contract with an actual end date in this month and no pending leave requests.",
  standard:
    "I confirm Romanian tax residence, normal conditions and one unchanged contract for the shown period. Earnings consist only of regular basic pay, the cash bonus, legally issued meal vouchers and the reviewed fully taxable termination amounts shown above. No other benefits, exemptions, deductions or garnishments. The advance was already paid for this month.",
  calendarConfirm:
    "I checked the employed dates, public holidays and company calendar for this month. The included working days were worked normally; there are no unpaid days, leave, overtime or salary changes to add. Termination amounts are entered separately above.",
};
const ro: typeof en = {
  title: "Lichidare la încetare",
  include: "Include sume de lichidare la încetare",
  days: "Zile confirmate de concediu de odihnă neefectuat",
  dailyGross: "Tarif zilnic brut aprobat de contabil (RON)",
  balanceReference: "Referința verificării soldului de zile",
  rateReference: "Referința aprobării tarifului de către contabil",
  otherGross: "Alte sume integral impozabile la încetare (RON)",
  otherReference: "Referința aprobării altor sume",
  unusedGross: "Compensarea concediului neefectuat (brut RON)",
  help: "Disponibilă numai în luna încetării efective. HR confirmă zilele neefectuate cuvenite, inclusiv reportul și concediul efectuat. Contabilul aprobă tariful zilnic, cu componentele permanente, bazele istorice și minimul aplicabil. Aceste date nu se deduc din alocația configurată. Introdu sume brute efective; nu le include din nou în primă.",
  confirm:
    "Am verificat soldul final de concediu și tariful aprobat de contabil. Sumele sunt datorate la încetarea efectivă, nu au fost compensate în altă parte și reprezintă venituri salariale obișnuite integral impozabile din sectorul privat. Fără sume scutite, despăgubiri, restricții speciale din sectorul public, recuperări sau plăți în luni ulterioare. Nu mai există cereri de concediu în așteptare.",
  unavailable:
    "Lichidarea necesită un contract încetat, cu data efectivă în această lună, și fără cereri de concediu în așteptare.",
  standard:
    "Confirm rezidența fiscală română, condiții normale și un singur contract nemodificat pentru perioada afișată. Veniturile includ doar salariul de bază obișnuit, prima, tichetele acordate legal și sumele integral impozabile de lichidare verificate mai sus. Fără alte beneficii, scutiri, deduceri sau popriri. Avansul a fost deja plătit pentru această lună.",
  calendarConfirm:
    "Am verificat perioada de angajare, sărbătorile legale și calendarul organizației pentru această lună. Zilele incluse au fost lucrate normal; nu există zile neplătite, concedii, ore suplimentare sau schimbări de salariu de adăugat. Sumele de lichidare sunt introduse separat mai sus.",
};
export const payrollSettlementDictionary = (locale: Locale) =>
  locale === "ro" ? ro : en;
export function payrollSettlementLines(
  input: PayrollInput,
  result: PayrollResult,
  locale: Locale,
  compact = false,
): string[] {
  const s = input.settlement,
    r = result.settlement;
  if (!s || !r) return [];
  const d = payrollSettlementDictionary(locale);
  if (compact) {
    const ro = locale === "ro",
      days = new Intl.NumberFormat(ro ? "ro-RO" : "en-GB", {
        maximumFractionDigits: 2,
      }).format(s.days);
    return [
      ...(s.days > 0
        ? [
            `${ro ? "Concediu neefectuat / tarif zilnic aprobat / brut" : "Unused days / approved daily rate / gross"}: ${days} | ${moneyLabel(s.dailyGross, locale)} | ${moneyLabel(r.unusedLeaveGross, locale)}`,
            `${ro ? "Sold / aprobare tarif" : "Balance / rate approval"}: ${s.balanceReference} | ${s.rateReference}`,
          ]
        : []),
      ...(s.otherGross > 0
        ? [
            `${ro ? "Alte sume brute / aprobare" : "Other gross pay / approval"}: ${moneyLabel(r.otherGross, locale)} | ${s.otherReference}`,
          ]
        : []),
    ];
  }
  return [
    ...(s.days > 0
      ? [
          `${d.days}: ${new Intl.NumberFormat(locale === "ro" ? "ro-RO" : "en-GB", { maximumFractionDigits: 2 }).format(s.days)} | ${d.dailyGross}: ${moneyLabel(s.dailyGross, locale)}`,
          `${d.unusedGross}: ${moneyLabel(r.unusedLeaveGross, locale)}`,
          `${d.balanceReference}: ${s.balanceReference}`,
          `${d.rateReference}: ${s.rateReference}`,
        ]
      : []),
    ...(s.otherGross > 0
      ? [
          `${d.otherGross}: ${moneyLabel(r.otherGross, locale)}`,
          `${d.otherReference}: ${s.otherReference}`,
        ]
      : []),
  ];
}

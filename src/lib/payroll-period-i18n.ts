import type { Locale } from "./i18n";
import type { PayrollInput, PayrollResult } from "./payroll";
import { earnedBasicPay } from "./payroll-period.ts";

const en = {
  title: "Employment period and proration",
  start: "First included day",
  end: "Last included day (inclusive)",
  monthDays: "Working days in the month",
  paidDays: "Working days employed",
  earned: "Earned basic gross (RON)",
  help: "Dates and working days come from the contract and work calendar. Monthly basic pay is multiplied by employed working days / month working days and rounded to bani. Bonuses, issued vouchers and already-paid advances are actual amounts for this period and are not prorated.",
  calendarConfirm:
    "I checked the employed dates, public holidays and company calendar for this month. The included working days were worked normally; there are no unpaid days, leave, overtime, salary changes, unused-leave payouts or other termination payments to add.",
  deductionEmployer: "Personal deductions for this month",
  thisEmployer: "This employer grants the eligible monthly deductions",
  otherEmployer: "No personal deductions at this employer this month",
  deductionReference: "Reference confirming the month's deduction entitlement",
  deductionHelp:
    "Primary employment and monthly deductions are separate. When an employee changes employers within a month, personal deductions belong to the first employer. Confirm the employee's declaration; deductions cannot also be claimed at the next employer. A reference is required for partial-month primary employment.",
  unavailable:
    "This employment period is outside the supported cases. Check actual contract dates and status, a single unchanged RON contract, the Monday–Friday calendar and any leave or manual attendance adjustments.",
  reliefReview:
    "This partial-month case qualifies for minimum-wage relief. Its proration rounding still requires accountant confirmation, so automatic calculation is unavailable for this case. Do not change eligibility answers to bypass this check.",
  standard:
    "I confirm Romanian tax residence, normal conditions and one unchanged contract for the shown period. Earnings consist only of regular basic pay, the entered cash bonus and legally issued meal vouchers. No other benefits, exemptions, deductions, garnishments or final-settlement amounts. The advance was already paid for this month.",
  scope:
    "Supports full months and dated starters/leavers in 2026 on a uniform Monday–Friday schedule, with amounts in bani. Leave pay and other final-settlement amounts need separate handling. Partial-month minimum-wage relief cases are awaiting confirmed rounding rules.",
};
const ro: typeof en = {
  title: "Perioada de angajare și calculul proporțional",
  start: "Prima zi inclusă",
  end: "Ultima zi inclusă (inclusiv)",
  monthDays: "Zile lucrătoare în lună",
  paidDays: "Zile lucrătoare de angajare",
  earned: "Salariu de bază brut realizat (RON)",
  help: "Datele și zilele lucrătoare provin din contract și calendar. Salariul de bază lunar se înmulțește cu zilele lucrătoare de angajare / zilele lucrătoare ale lunii și se rotunjește la bani. Primele, tichetele acordate și avansurile deja plătite sunt sume efective pentru perioadă și nu se proratează.",
  calendarConfirm:
    "Am verificat perioada de angajare, sărbătorile legale și calendarul organizației pentru această lună. Zilele lucrătoare incluse au fost lucrate normal; nu există zile neplătite, concedii, ore suplimentare, schimbări de salariu, compensări de concediu neefectuat sau alte plăți la încetare de adăugat.",
  deductionEmployer: "Deduceri personale pentru această lună",
  thisEmployer: "Acest angajator acordă deducerile lunare eligibile",
  otherEmployer: "Fără deduceri personale la acest angajator în această lună",
  deductionReference: "Referința confirmării dreptului la deduceri pentru lună",
  deductionHelp:
    "Funcția de bază și deducerile lunare sunt distincte. La schimbarea angajatorului în aceeași lună, deducerile personale se acordă de primul angajator. Verifică declarația angajatului; deducerile nu se acordă și la următorul angajator. Referința este obligatorie pentru funcția de bază într-o lună parțială.",
  unavailable:
    "Perioada nu se încadrează în cazurile acceptate. Verifică datele efective și starea contractului, existența unui singur contract nemodificat în RON, calendarul luni–vineri și eventualele concedii sau ajustări manuale de pontaj.",
  reliefReview:
    "Acest caz de lună parțială este eligibil pentru suma neimpozabilă la salariul minim. Rotunjirea prorată necesită încă o confirmare contabilă, deci calculul automat nu este disponibil pentru acest caz. Nu modifica răspunsurile de eligibilitate pentru a ocoli verificarea.",
  standard:
    "Confirm rezidența fiscală română, condiții normale și un singur contract nemodificat pentru perioada afișată. Veniturile includ doar salariul de bază obișnuit, prima introdusă și tichetele de masă acordate legal. Fără alte beneficii, scutiri, deduceri, popriri sau sume de lichidare. Avansul a fost deja plătit pentru această lună.",
  scope:
    "Acceptă luni complete și angajări/încetări cu date efective din 2026, cu program uniform luni–vineri și sume în bani. Concediile și alte sume de lichidare se tratează separat. Cazurile de lună parțială cu sumă neimpozabilă la salariul minim așteaptă confirmarea regulii de rotunjire.",
};
export const payrollPeriodDictionary = (locale: Locale) =>
  locale === "ro" ? ro : en;
export function payrollPeriodLines(
  input: PayrollInput,
  locale: Locale,
  result?: PayrollResult,
): string[] {
  if (!input.period) return [];
  const d = payrollPeriodDictionary(locale),
    p = input.period;
  const money = new Intl.NumberFormat(locale === "ro" ? "ro-RO" : "en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return [
    `${d.start}: ${p.start} | ${d.end}: ${p.end}`,
    `${d.paidDays}: ${p.employedWorkingDays} / ${p.monthWorkingDays}${input.annualLeave ? "" : ` | ${d.earned}: ${money.format(result ? (Math.round(result.cashGross * 100) - Math.round(input.bonus * 100) - Math.round((result.settlement?.unusedLeaveGross ?? 0) * 100) - Math.round((result.settlement?.otherGross ?? 0) * 100)) / 100 : earnedBasicPay(input))}`}`,
    `${d.deductionEmployer}: ${input.deductionEmployer === "this" ? d.thisEmployer : d.otherEmployer}`,
    ...(input.deductionReference
      ? [`${d.deductionReference}: ${input.deductionReference}`]
      : []),
  ];
}

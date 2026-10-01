import type { Locale } from "./i18n";
import { moneyLabel } from "./i18n.ts";
import type { PayrollInput, PayrollResult } from "./payroll";
const en = {
  title: "Unpaid leave and absences",
  leave: "Approved unpaid leave",
  absences: "Recorded zero-work days for HR review",
  suspended: "Formally suspended working dates",
  unpaidDays: "Unpaid working days",
  suspendedDays: "Formally suspended working days",
  reviewReference: "Unpaid classification / accountant review reference",
  suspensionReference: "Formal suspension evidence reference",
  workedBasic: "Worked basic gross (RON)",
  unpaidBasic: "Basic pay excluded (RON)",
  activeDays: "Working days with active contract",
  help: "Approved unpaid dates and full zero-work attendance days come from the saved records. Confirm that every listed absence is lawfully unpaid; a generic attendance label alone does not establish this. Mark only dates covered by a formal contract suspension and provide its evidence reference. Unmarked days remain active for the contribution floor. This does not suspend the contract or submit REGES. Vouchers must exclude ineligible days; remaining hours must be normal.",
  confirm:
    "I reviewed every listed date as lawfully unpaid and checked any formal suspension against employment records, with references. No paid special absence, medical leave, partial-day absence, overtime, salary change or other suspension is missing. Bonuses and settlement contain no duplicate basic pay; vouchers exclude ineligible dates and the advance was already paid for this month.",
  calendarConfirm:
    "I checked the employed dates, work calendar, approved annual/unpaid leave and listed zero-work dates. All remaining working days were worked normally; all suspensions affecting this month's floor are represented in the reviewed dates.",
  standard:
    "I confirm Romanian tax residence, normal conditions and one unchanged contract. Earnings include only shown worked basic, separately reviewed annual leave, bonus, legally issued vouchers and any reviewed taxable settlement. No other benefits, exemptions, deductions or garnishments.",
  annualConfirm:
    "I reviewed the approved annual-leave dates and each accountant-approved rate, historic basis, permanent components and applicable minimum. Annual leave replaces basic pay for those dates and is not duplicated in bonus. The unpaid dates are reviewed separately; no other-month prepayment needs reconciliation.",
  needsReview:
    "This unpaid-payroll case requires separate accountant handling: prorated minimum-wage relief, or zero cash with active contract days. Do not change eligibility or suspension declarations to bypass it.",
};
const ro: typeof en = {
  title: "Concediu fără plată și absențe",
  leave: "Concediu fără plată aprobat",
  absences: "Zile pontate fără lucru, de verificat de HR",
  suspended: "Date lucrătoare cu suspendare formală",
  unpaidDays: "Zile lucrătoare neplătite",
  suspendedDays: "Zile lucrătoare cu suspendare formală",
  reviewReference: "Referință clasificare neplătită / verificare contabilă",
  suspensionReference: "Referința dovezii suspendării formale",
  workedBasic: "Salariu de bază brut lucrat (RON)",
  unpaidBasic: "Salariu de bază exclus (RON)",
  activeDays: "Zile lucrătoare cu contract activ",
  help: "Datele aprobate fără plată și zilele pontate integral cu zero ore provin din înregistrări. Confirmă că fiecare absență afișată este legal neplătită; eticheta generică din pontaj nu dovedește acest lucru. Bifează numai datele acoperite de o suspendare formală și indică dovada. Datele nebifate rămân active pentru plafonul contribuțiilor. Acest pas nu suspendă contractul și nu transmite în REGES. Tichetele trebuie să excludă zilele neeligibile; restul orelor trebuie să fie normale.",
  confirm:
    "Am verificat fiecare dată afișată ca legal neplătită și eventualele suspendări formale față de evidențele de muncă, cu referințe. Nu lipsesc absențe speciale plătite, concediu medical, absențe parțiale, ore suplimentare, schimbări salariale sau alte suspendări. Primele și lichidarea nu dublează salariul de bază; tichetele exclud zilele neeligibile, iar avansul a fost deja plătit pentru această lună.",
  calendarConfirm:
    "Am verificat perioada de angajare, calendarul, concediile aprobate de odihnă/fără plată și datele pontate cu zero ore. Restul zilelor lucrătoare au fost lucrate normal; toate suspendările care afectează plafonul lunii sunt reprezentate de datele verificate.",
  standard:
    "Confirm rezidența fiscală română, condiții normale și un contract nemodificat. Veniturile includ doar baza lucrată afișată, concediul de odihnă verificat separat, prima, tichetele acordate legal și eventuala lichidare impozabilă verificată. Fără alte beneficii, scutiri, deduceri sau popriri.",
  annualConfirm:
    "Am verificat datele aprobate de concediu de odihnă și fiecare tarif aprobat de contabil, baza istorică, componentele permanente și minimul aplicabil. Concediul înlocuiește baza pentru acele date și nu se dublează în primă. Datele neplătite sunt verificate separat; nu există plăți anticipate din alte luni de reconciliat.",
  needsReview:
    "Acest caz necesită tratare separată de contabil: sumă neimpozabilă prorată la salariul minim sau zero venit în numerar cu zile de contract activ. Nu modifica eligibilitatea ori declarația de suspendare pentru a ocoli verificarea.",
};
export const payrollUnpaidDictionary = (locale: Locale) =>
  locale === "ro" ? ro : en;
export function payrollUnpaidLines(
  input: PayrollInput,
  result: PayrollResult,
  locale: Locale,
  compact = false,
) {
  const u = input.unpaid,
    r = result.unpaid;
  if (!u || !r) return [];
  const d = payrollUnpaidDictionary(locale),
    dates = [...u.requests.flatMap((q) => q.dates), ...u.absences].sort();
  return [
    `${compact ? (locale === "ro" ? "Bază lucrată / exclusă" : "Worked / excluded basic") : `${d.workedBasic} / ${d.unpaidBasic}`}: ${moneyLabel(r.workedBasic, locale)} / ${moneyLabel(r.unpaidBasic, locale)}`,
    `${compact ? (locale === "ro" ? "Neplătite" : "Unpaid") : d.title}: ${dates.length} (${dates.join(", ")}) | ${compact ? "Active" : d.activeDays}: ${r.activeWorkingDays}`,
    `${compact ? (locale === "ro" ? "Verificare" : "Review") : d.reviewReference}: ${u.reviewReference}`,
    ...(u.suspendedDates.length
      ? [
          `${compact ? (locale === "ro" ? "Suspendare" : "Suspension") : d.suspended}: ${u.suspendedDates.join(", ")} | ${u.suspensionReference}`,
        ]
      : []),
  ];
}

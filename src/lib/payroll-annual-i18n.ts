import type { Locale } from "./i18n";
import { moneyLabel } from "./i18n.ts";
import type { PayrollInput, PayrollResult } from "./payroll";
const en = {
  title: "Annual leave pay",
  days: "Approved leave days",
  dailyGross: "Accountant-approved daily gross rate (RON)",
  rateReference: "Rate approval reference",
  workedBasic: "Basic gross for days worked (RON)",
  leaveGross: "Annual leave gross pay (RON)",
  help: "Dates come from approved annual leave. Enter the accountant-approved rate for each request and this month's included dates. The accountant checks the preceding three-month pay bases, permanent components and applicable minimum. The app also checks the known current basic-pay minimum. Leave replaces basic pay for these dates; do not add it again in bonus. Vouchers must exclude ineligible leave days. Record any leave pay already paid for this month in the advance field.",
  confirm:
    "I checked all approved annual-leave dates and each accountant-approved rate, including the historic basis and all applicable permanent components/minimums. Ordinary taxable leave pay is due for this month, with no duplicate bonus or other-month prepayment to reconcile. Other working days were worked normally. No medical/unpaid leave, overtime or salary changes. Any already-paid amount for this month is included once in advance.",
  standard:
    "I confirm Romanian tax residence, normal conditions and one unchanged contract. Earnings include only the shown basic pay for worked days, reviewed annual leave pay, bonus, legally issued meal vouchers and any separately reviewed taxable termination amounts. No other benefits, exemptions, deductions or garnishments.",
  calendarConfirm:
    "I checked the employed dates and company calendar. Approved annual-leave working dates above replace worked days. Remaining working days were worked normally, without no-shows, medical/unpaid leave, overtime or salary changes.",
};
const ro: typeof en = {
  title: "Indemnizație de concediu de odihnă",
  days: "Zile aprobate de concediu",
  dailyGross: "Tarif zilnic brut aprobat de contabil (RON)",
  rateReference: "Referința aprobării tarifului",
  workedBasic: "Salariu de bază brut pentru zile lucrate (RON)",
  leaveGross: "Indemnizație brută de concediu (RON)",
  help: "Datele provin din concediile de odihnă aprobate. Introdu tariful aprobat de contabil pentru fiecare cerere și datele incluse în această lună. Contabilul verifică bazele ultimelor trei luni, componentele permanente și minimul aplicabil. Aplicația verifică și minimul cunoscut din salariul de bază actual. Concediul înlocuiește salariul de bază pentru aceste date; nu îl adăuga din nou în primă. Tichetele trebuie să excludă zilele neeligibile de concediu. Înregistrează în avans indemnizația deja plătită pentru această lună.",
  confirm:
    "Am verificat toate datele aprobate de concediu de odihnă și fiecare tarif aprobat de contabil, cu baza istorică, componentele permanente și minimele aplicabile. Indemnizația salarială obișnuită este aferentă acestei luni, fără duplicare în primă sau plăți anticipate din alte luni de reconciliat. Celelalte zile lucrătoare au fost lucrate normal. Fără concediu medical/neplătit, ore suplimentare sau schimbări de salariu. Sumele deja plătite pentru această lună sunt incluse o singură dată în avans.",
  standard:
    "Confirm rezidența fiscală română, condiții normale și un contract nemodificat. Veniturile includ doar salariul de bază afișat pentru zilele lucrate, indemnizația de concediu verificată, prima, tichetele acordate legal și eventualele sume impozabile de lichidare verificate separat. Fără alte beneficii, scutiri, deduceri sau popriri.",
  calendarConfirm:
    "Am verificat perioada de angajare și calendarul organizației. Datele lucrătoare de concediu aprobate mai sus înlocuiesc zilele lucrate. Restul zilelor au fost lucrate normal, fără absențe neanunțate, concediu medical/neplătit, ore suplimentare sau schimbări de salariu.",
};
export const payrollAnnualDictionary = (locale: Locale) =>
  locale === "ro" ? ro : en;
export function payrollAnnualLines(
  input: PayrollInput,
  result: PayrollResult,
  locale: Locale,
  compact = false,
) {
  if (!input.annualLeave || !result.annualLeave) return [];
  const d = payrollAnnualDictionary(locale),
    ro = locale === "ro";
  return [
    `${compact ? (ro ? "Bază lucrată" : "Worked basic") : d.workedBasic}: ${moneyLabel(result.annualLeave.workedBasic, locale)} | ${compact ? (ro ? "Indemnizație CO" : "Leave gross") : d.leaveGross}: ${moneyLabel(result.annualLeave.leaveGross, locale)}`,
    ...input.annualLeave.requests.map(
      (r) =>
        `${compact ? (ro ? "CO" : "Leave") : d.days}: ${r.dates.length} (${r.dates[0]} - ${r.dates.at(-1)}) | ${compact ? (ro ? "tarif" : "rate") : d.dailyGross}: ${moneyLabel(r.dailyGross, locale)} | ${r.rateReference}${compact ? "" : ` | ${r.id}`}`,
    ),
  ];
}

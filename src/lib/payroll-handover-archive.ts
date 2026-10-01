import { createHash } from "node:crypto";
import { strToU8, zipSync } from "fflate";
import { generatePayrollHandoverPdf } from "./payroll-handover-pdf.ts";
import {
  payrollHandoverCsvs,
  validatePayrollHandover,
} from "./payroll-handover.ts";
import type { PayrollHandoverPayload } from "./payroll-handover-types";

export class HandoverSizeError extends Error {}
const MAX_BYTES = 20 * 1024 * 1024;
// Keep the response below the hosting function's payload ceiling, with headroom.
const MAX_ZIP_BYTES = 4 * 1024 * 1024;

function reviewInstructions(p: PayrollHandoverPayload, brandName: string) {
  const revision = `${p.run.month.slice(0, 7)} / r${p.run.revision}`;
  const reference = `Run: ${p.run.id}\nExport: ${p.export_id}\n`;
  const periodNote =
    p.format_version === "HRConnector-accountant-v2"
      ? p.locale === "ro"
        ? "Format v2: payroll.csv include perioada de angajare, zilele lucrătoare, salariul de bază realizat și confirmarea deducerilor. remaining-pay.csv include perioada și zilele. Pentru rândurile v3 păstrate, câmpurile de perioadă sunt goale: acele calcule acoperă luna completă. Salariul de bază lunar contractual nu se confundă cu salariul realizat."
        : "Format v2: payroll.csv includes employed dates, working days, earned basic pay and monthly deduction evidence. remaining-pay.csv includes employed dates and days. Retained v3 rows have empty period fields: their calculations cover the full month. Contractual monthly basic pay differs from earned basic pay."
      : "";
  return p.locale === "ro"
    ? `${brandName} — Pachet pentru contabil\n${revision}\n${reference}
CONFIDENȚIAL. Arhiva nu este criptată. Verificați conținutul și transmiteți-l numai prin metoda securizată aprobată de organizație.

Sunt incluși exclusiv cei ${p.items.length} angajați din revizia selectată. Folosiți identificatorii angajaților și contractele pentru asociere; numele pot coincide. Calculele sunt cele salvate la aprobare (${p.run.approved_at}); exportul nu recalculează taxele. Verificarea contabilului rămâne necesară.

Situație la pregătire (${p.prepared_at}): ${p.is_historical ? `REVIZIE ISTORICĂ. Ultima revizie aprobată este r${p.latest_approved_revision}.` : "Ultima revizie aprobată la momentul pregătirii."}
${p.has_open_correction ? "Există o ciornă de corecție deschisă. Verificați corecția înainte de utilizarea sumelor." : "Nu exista o ciornă de corecție deschisă la pregătire."}
Revizii noi pot fi aprobate ulterior. Verificați situația actuală în aplicație înainte de utilizare. O revizie corectată conține valorile complete pentru angajații incluși, nu diferențele de adunat la reviziile precedente. Comparați și lista de angajați; nu cumulați reviziile aceleiași luni.

Fișiere:
- payroll-summary.pdf: situație pentru tipărire, totaluri și tabele individuale.
- payroll.csv: date de calcul și rezultate salvate, inclusiv deduceri și contribuții.
- remaining-pay.csv: netul în numerar, avansurile deja plătite și restul de plată.
- totals.csv: suma exactă a valorilor salvate pentru angajații incluși.
- manifest.json: domeniul exportului, revizia și amprentele SHA-256 ale fișierelor. Amprentele verifică integritatea, nu sunt o semnătură digitală.

${periodNote}

CSV: UTF-8 cu BOM, separator punct și virgulă, virgulă zecimală, fără separatori de mii. Importați identificatorii și numerele contractelor ca text. Textele care ar putea fi interpretate drept formule sau numere cu zero inițial au prefix apostrof de protecție. Nu eliminați prefixul prin executarea unei formule. Toate sumele sunt în RON; orele contractuale au două zecimale. Valorile Da/Nu și excepțiile sunt traduse.

Tichetele de masă sunt incluse în cost, dar nu în numerarul de plătit. Avansurile se scad o singură dată din net. Totalurile contribuțiilor sunt sume ale calculelor individuale, nu obligații declarative finale. Verificați tratamentul fiscal și documentele justificative separat.

Pachet de verificare, nu import SAGA, declarație D112 sau fișier de plată bancară. Pregătirea nu transmite un email, nu efectuează plăți și nu confirmă descărcarea ori predarea. Fișierele nu sunt stocate ca arhivă publică în aplicație.
`
    : `${brandName} — Accountant handover\n${revision}\n${reference}
CONFIDENTIAL. This ZIP is not encrypted. Review the contents and share only through your organisation's approved secure delivery method.

Only the ${p.items.length} employees in the selected revision are included. Match records using employee IDs and contracts; names may be duplicated. Calculations were saved at approval (${p.run.approved_at}); this export does not recalculate taxes. Accountant review remains necessary.

Context at preparation (${p.prepared_at}): ${p.is_historical ? `HISTORICAL REVISION. Latest approved revision: r${p.latest_approved_revision}.` : "Latest approved revision at preparation."}
${p.has_open_correction ? "A correction draft is open. Review the correction before using these amounts." : "No correction draft was open at preparation."}
New revisions may be approved later. Check the current state in the app before acting. A corrected revision contains complete amounts for its included employees, not differences to add to earlier revisions. Compare employee lists too; do not add together revisions for the same month.

Files:
- payroll-summary.pdf: printable summary, totals and individual tables.
- payroll.csv: saved calculation inputs and results, including deductions and contributions.
- remaining-pay.csv: cash net, advances already paid and remaining cash payable.
- totals.csv: exact sums of saved amounts for the included employees.
- manifest.json: scope, revision and file SHA-256 hashes. Hashes check integrity; they are not a digital signature.

${periodNote}

CSV: UTF-8 with BOM, semicolon separator, decimal point, no thousands separators. Import IDs and contract numbers as text. Text that could be interpreted as a formula or a leading-zero number is prefixed with a protective apostrophe. Do not remove this prefix by evaluating a formula. All amounts are RON; contractual hours use two decimals. Yes/No values and exception labels are translated.

Meal vouchers are included in employer cost but excluded from cash payable. Advances are subtracted once from cash net. Contribution totals sum individual calculations; they are not final employer filing liabilities. Review tax treatment and supporting evidence separately.

This is a review package, not a SAGA import, D112 filing or bank payment file. Preparation does not send an email, execute a payment or confirm download or delivery. Files are not stored as a public archive in the app.
`;
}

export async function buildPayrollHandoverArchive(
  raw: unknown,
  brandName: string,
) {
  const payload = validatePayrollHandover(raw);
  const files: Record<string, Uint8Array> = {
    "payroll-summary.pdf": await generatePayrollHandoverPdf(payload, brandName),
    ...Object.fromEntries(
      Object.entries(payrollHandoverCsvs(payload)).map(([name, content]) => [
        name,
        strToU8(content),
      ]),
    ),
    "README.txt": strToU8(reviewInstructions(payload, brandName)),
  };
  if (
    Object.values(files).reduce((sum, bytes) => sum + bytes.length, 0) >
    MAX_BYTES
  )
    throw new HandoverSizeError("Handover files exceed the size limit");
  const manifest = {
    format: payload.format_version,
    export_id: payload.export_id,
    prepared_at: payload.prepared_at,
    organisation_id: payload.organisation_id,
    company: payload.company,
    locale: payload.locale,
    run: payload.run,
    currency: "RON",
    employee_count: payload.items.length,
    scope:
      "Only employees included in this approved revision; full amounts, not correction deltas.",
    employees: payload.items.map((item) => ({
      employee_id: item.employee_id,
      item_id: item.id,
      ...(item.input.period ? { period: item.input.period } : {}),
    })),
    is_historical: payload.is_historical,
    latest_approved_run_id: payload.latest_approved_run_id,
    latest_approved_revision: payload.latest_approved_revision,
    has_open_correction: payload.has_open_correction,
    rules: [...new Set(payload.items.map((item) => item.result.rules))],
    files: Object.entries(files).map(([name, bytes]) => ({
      name,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    })),
  };
  files["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2) + "\n");
  const archive = zipSync(files, { level: 6 });
  if (archive.length > MAX_ZIP_BYTES)
    throw new HandoverSizeError("Handover ZIP exceeds the size limit");
  return archive;
}

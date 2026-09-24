import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { PDFDocument, PDFName, PDFNumber, PDFString } from "pdf-lib";
import {
  generateEmployeePdf,
  isReadablePdf,
  UnsupportedPdfText,
} from "../src/lib/document-pdf.ts";
import { calculatePayroll, payrollSchema } from "../src/lib/payroll.ts";
import { payslipBody } from "../src/lib/payroll-i18n.ts";
const input = {
  locale: "ro",
  brandName: "HRConnector",
  title: "Fișa angajatului - exemplu de verificare",
  template: "summary",
  body: "",
  company: {
    name: "Companie demonstrativă SRL",
    cui: "RO12345678",
    address: "Strada Exemplului 12, Brașov",
  },
  employee: {
    name: "Ștefania Țăran",
    email: "exemplu@example.invalid",
    job: "Specialist resurse umane",
    department: "Operațiuni",
    workplace: "Brașov",
    start: "2026-09-01",
    status: "Activ",
  },
  generatedAt: new Date("2026-09-23T10:00:00Z"),
};
async function sample(name, bytes) {
  if (process.env.HR_PDF_QA_DIR) {
    await mkdir(process.env.HR_PDF_QA_DIR, { recursive: true });
    await writeFile(`${process.env.HR_PDF_QA_DIR}/${name}.pdf`, bytes);
  }
}
test("Romanian payslip prints its calculation facts and tax breakdown on one A4 page", async () => {
  const facts = payrollSchema.parse({
    month: "2026-09",
    basic: 4325,
    bonus: 0,
    primary: "yes",
    dependants: 1,
    young: "yes",
    children: 1,
    reduced: "no",
    standard: "on",
  });
  const bytes = await generateEmployeePdf({
    ...input,
    template: "payslip",
    title: "Fluturaș de salariu - 2026-09",
    body: payslipBody(facts, calculatePayroll(facts), "ro"),
  });
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
  assert.equal(await isReadablePdf(bytes), true);
  await sample("payslip", bytes);
});
test("Romanian summary is a valid one-page A4 PDF with embedded font", async () => {
  const bytes = await generateEmployeePdf(input),
    pdf = await PDFDocument.load(bytes);
  assert.equal(await isReadablePdf(bytes), true);
  assert.equal(pdf.getPageCount(), 1);
  assert.equal(pdf.getTitle(), input.title);
  assert.ok(Math.abs(pdf.getPage(0).getWidth() - 595.28) < 0.1);
  assert.ok(bytes.length < 10485760);
  await sample("employee-summary", bytes);
});
test("expanded payslip includes voucher, employer top-up and advance facts with bounded pagination", async () => {
  const facts = payrollSchema.parse({
    month: "2026-09",
    basic: 2200,
    bonus: 0,
    hours: 4,
    primary: "yes",
    dependants: 0,
    young: "no",
    children: 0,
    reduced: "no",
    standard: "on",
    meals: 800,
    mealsReference: "Tichete-09-2026",
    advance: 500,
    advanceReference: "OP-09-2026",
  });
  const body = payslipBody(facts, calculatePayroll(facts), "ro");
  assert.match(body, /Diferență CAS suportată de angajator/);
  assert.match(body, /Rest de plată/);
  assert.match(body, /OP-09-2026/);
  const bytes = await generateEmployeePdf({
    ...input,
    template: "payslip",
    title: "Fluturaș de salariu - 2026-09",
    body,
  });
  const pdf = await PDFDocument.load(bytes);
  assert.ok(pdf.getPageCount() <= 2);
  await sample("payslip-part-time", bytes);
});
test("bani payslips preserve exact inputs, remaining cash and tax rounding in both languages", async () => {
  const facts = payrollSchema.parse({
    month: "2026-09",
    basic: "2162,50",
    bonus: "0.20",
    hours: 4,
    primary: "yes",
    dependants: 0,
    young: "no",
    children: 0,
    reduced: "no",
    standard: "on",
    meals: "800.15",
    mealsReference: "Tichete-09-2026",
    advance: "500.25",
    advanceReference: "OP-09-2026",
  });
  const result = calculatePayroll(facts);
  for (const locale of ["ro", "en"]) {
    const body = payslipBody(facts, result, locale);
    const formatted = body.replace(/\s/g, " ");
    assert.ok(formatted.includes(locale === "ro" ? "2.162,50" : "2,162.50"));
    assert.ok(formatted.includes(locale === "ro" ? "699,45" : "699.45"));
    assert.ok(formatted.includes(locale === "ro" ? "1.260,85" : "1,260.85"));
    assert.ok(formatted.includes(locale === "ro" ? "1.261,00" : "1,261.00"));
    assert.match(body, /RO-2026-monthly-v3/);
    const bytes = await generateEmployeePdf({
      ...input,
      locale,
      template: "payslip",
      title:
        locale === "ro" ? "Fluturaș de salariu - 2026-09" : "Payslip - 2026-09",
      body,
    });
    const pdf = await PDFDocument.load(bytes);
    assert.ok(pdf.getPageCount() <= 2);
    await sample(`payslip-bani-${locale}`, bytes);
  }
});
test("long Romanian letter wraps long words and paginates", async () => {
  const paragraph =
    "Stimată colegă, confirmăm actualizarea datelor de lucru și a documentelor organizației. Responsabilitățile, programul și informațiile de contact se verifică împreună cu echipa de resurse umane. Îți mulțumim pentru colaborare.";
  const bytes = await generateEmployeePdf({
    ...input,
    template: "letter",
    title: "Scrisoare HR - verificare paginare",
    body:
      Array.from({ length: 10 }, (_, i) => `${i + 1}. ${paragraph}`).join(
        "\n\n",
      ) +
      "\n\n" +
      "CuvântLungȘȚĂÎÂ".repeat(10),
  });
  const pdf = await PDFDocument.load(bytes);
  assert.ok(pdf.getPageCount() >= 2);
  assert.ok(pdf.getPageCount() <= 4);
  await sample("hr-letter", bytes);
});
test("unsupported glyphs, empty files, fake headers and encrypted PDFs fail safely", async () => {
  await assert.rejects(
    generateEmployeePdf({ ...input, title: "Emoji 🦄" }),
    UnsupportedPdfText,
  );
  for (const data of ["", "not pdf", "%PDF-fake"])
    assert.equal(await isReadablePdf(new TextEncoder().encode(data)), false);
  const pdf = await PDFDocument.create();
  pdf.addPage();
  // A synthetic encryption dictionary exercises the reader's encrypted-document rejection.
  pdf.context.trailerInfo.Encrypt = pdf.context.register(
    pdf.context.obj({
      Filter: PDFName.of("Standard"),
      V: PDFNumber.of(1),
      R: PDFNumber.of(2),
      O: PDFString.of("test"),
      U: PDFString.of("test"),
      P: PDFNumber.of(-4),
    }),
  );
  assert.equal(await isReadablePdf(await pdf.save()), false);
});

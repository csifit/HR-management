import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  decodePDFRawStream,
} from "pdf-lib";
import { generatePayrollHandoverPdf } from "../src/lib/payroll-handover-pdf.ts";
import { UnsupportedPdfText } from "../src/lib/document-pdf.ts";
import { calculatePayroll, payrollSchema } from "../src/lib/payroll.ts";

const facts = payrollSchema.parse({
  month: "2026-08",
  basic: 2162.5,
  bonus: 0.2,
  hours: 4,
  primary: "yes",
  dependants: 0,
  young: "no",
  children: 0,
  reduced: "no",
  standard: "on",
  meals: 800.15,
  mealsReference: "Tichete-08-2026",
  advance: 500.25,
  advanceReference: "Avans-08-2026",
});
function fixture(count = 3, locale = "ro") {
  return {
    export_id: "81000000-0000-4000-8000-000000000001",
    prepared_at: "2026-09-30T09:42:00Z",
    organisation_id: "82000000-0000-4000-8000-000000000001",
    locale,
    format_version: "HRConnector-accountant-v1",
    run: {
      id: "83000000-0000-4000-8000-000000000001",
      month: "2026-08-01",
      revision: 1,
      version: 5,
      approved_at: "2026-09-02T11:00:00Z",
      previous_run_id: null,
    },
    latest_approved_run_id: "83000000-0000-4000-8000-000000000002",
    latest_approved_revision: 2,
    is_historical: true,
    has_open_correction: true,
    company: {
      name: "Companie demonstrativă de servicii și operațiuni SRL",
      cui: "RO12345678",
      address: "Strada Exemplului nr. 12, Brașov, România",
    },
    items: Array.from({ length: count }, (_, index) => ({
      id: `84000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      employee_id: `85000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      employee_name: `${String(index + 1).padStart(3, "0")} Ștefania Țăran Popescu`,
      department: "Operațiuni",
      job_title: "Specialist resurse umane",
      contract_number: `CIM-2026-${index + 1}`,
      input: { ...facts },
      result: calculatePayroll(facts),
    })),
  };
}
async function sample(name, bytes) {
  if (process.env.HR_HANDOVER_QA_DIR) {
    await mkdir(process.env.HR_HANDOVER_QA_DIR, { recursive: true });
    await writeFile(`${process.env.HR_HANDOVER_QA_DIR}/${name}.pdf`, bytes);
  }
}
const streamText = (stream) =>
  new TextDecoder().decode(decodePDFRawStream(stream).decode());
// Inspect the embedded Unicode map and draw operators, not the input objects.
function inspectPage(pdf, page) {
  const fonts = page.node.Resources().lookup(PDFName.of("Font"), PDFDict);
  const unicode = new Map();
  for (const [, fontRef] of fonts.entries()) {
    const font = pdf.context.lookup(fontRef, PDFDict);
    const cmap = streamText(font.lookup(PDFName.of("ToUnicode"), PDFRawStream));
    for (const [, from, to] of cmap.matchAll(
      /<([a-fA-F0-9]+)>\s*<([a-fA-F0-9]+)>/g,
    ))
      unicode.set(
        from.toUpperCase(),
        new TextDecoder("utf-16be").decode(Buffer.from(to, "hex")),
      );
  }
  const contents = page.node.Contents();
  const streams =
    contents instanceof PDFArray
      ? contents.asArray().map((ref) => pdf.context.lookup(ref, PDFRawStream))
      : [contents];
  const source = streams.map(streamText).join("\n");
  const text = Array.from(
    source.matchAll(/<([a-fA-F0-9]+)>\s*Tj/g),
    ([, value]) =>
      (value.match(/.{4}/g) ?? [])
        .map((glyph) => unicode.get(glyph.toUpperCase()) ?? "�")
        .join(""),
  ).join("\n");
  for (const [, size] of source.matchAll(/\/\S+\s+([\d.]+)\s+Tf/g))
    assert.ok(Number(size) >= 9, `Text too small: ${size}`);
  for (const [, x, y] of source.matchAll(/1 0 0 1 ([\d.-]+) ([\d.-]+) Tm/g)) {
    assert.ok(
      Number(x) >= 33 && Number(x) <= 808,
      `Text x out of bounds: ${x}`,
    );
    assert.ok(
      Number(y) >= 32 && Number(y) <= 548,
      `Text y out of bounds: ${y}`,
    );
  }
  assert.ok(!text.includes("�"), "Embedded font must map every drawn glyph");
  return text;
}

test("accountant PDFs preserve approved bani and use the real export date in RO and EN", async () => {
  for (const locale of ["ro", "en"]) {
    const payload = fixture(3, locale);
    // A saved result deliberately differs from the live calculator. Export must not recalculate it.
    payload.items[0].result.payable = 1234.56;
    const bytes = await generatePayrollHandoverPdf(payload, "HRConnector");
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), 3);
    assert.equal(
      pdf.getCreationDate().toISOString(),
      payload.prepared_at.replace("Z", ".000Z"),
    );
    assert.match(pdf.getTitle(), /2026-08 - r1$/);
    assert.match(pdf.getSubject(), new RegExp(payload.export_id));
    const texts = pdf.getPages().map((page) => inspectPage(pdf, page));
    const allText = texts.join("\n");
    assert.match(allText, /Ștefania Țăran Popescu/);
    assert.ok(allText.includes(locale === "ro" ? "1.234,56" : "1,234.56"));
    assert.ok(
      texts[0].includes(
        locale === "ro" ? "3 angajați incluși" : "3 employees included",
      ),
    );
    assert.ok(texts[0].includes(locale === "ro" ? "2.633,46" : "2,633.46"));
    assert.ok(
      allText.includes(
        locale === "ro" ? "REVIZIE ISTORICĂ" : "HISTORICAL REVISION",
      ),
    );
    assert.ok(
      allText.includes(
        locale === "ro" ? "corecție în lucru" : "correction draft is open",
      ),
    );
    assert.match(allText, /D112/);
    assert.match(allText, /SAGA/);
    for (const [index, page] of pdf.getPages().entries()) {
      assert.ok(Math.abs(page.getWidth() - 841.89) < 0.1);
      assert.ok(Math.abs(page.getHeight() - 595.28) < 0.1);
      assert.ok(texts[index].includes(payload.export_id));
      assert.ok(texts[index].includes(payload.run.id));
      assert.ok(texts[index].includes(`${index + 1} / ${pdf.getPageCount()}`));
    }
    await sample(`handover-${locale}`, bytes);
  }
});

test("200 long employee names and contract references paginate with repeated headers and no lost rows", async () => {
  for (const locale of ["ro", "en"]) {
    const payload = fixture(200, locale);
    payload.is_historical = false;
    payload.has_open_correction = false;
    payload.latest_approved_run_id = payload.run.id;
    payload.latest_approved_revision = payload.run.revision;
    payload.items.forEach((item, index) => {
      item.employee_name = `${String(index + 1).padStart(3, "0")} Ștefania Țăran Popescu Alexandrescu Dumitrescu Georgescu Mărgineanu`;
      item.contract_number = `CIM-${String(index + 1).padStart(3, "0")}-REFERINȚĂCONTRACTUALĂEXTINSĂ-2026-08`;
    });
    const bytes = await generatePayrollHandoverPdf(payload, "HRConnector");
    const pdf = await PDFDocument.load(bytes);
    assert.ok(pdf.getPageCount() >= 20 && pdf.getPageCount() < 80);
    const texts = pdf.getPages().map((page) => inspectPage(pdf, page));
    const allText = texts.join("\n").replace(/\s+/g, " ");
    for (const item of payload.items) {
      assert.equal(
        allText.split(item.employee_name).length - 1,
        2,
        "Full name occurs in both detailed tables",
      );
    }
    for (const text of texts.slice(1)) {
      assert.ok(text.includes(locale === "ro" ? "Angajat" : "Employee"));
      assert.match(text, /Contract/);
      assert.match(text, /CAS/);
      assert.ok(text.includes(payload.export_id));
    }
    assert.ok(bytes.length < 3 * 1024 * 1024);
    await sample(`handover-long-${locale}`, bytes);
  }
});

test("PDF handover rejects unsupported glyphs and invalid export dates before returning an artifact", async () => {
  const unsupported = fixture();
  unsupported.items[0].employee_name = "Unsupported 🦄";
  await assert.rejects(
    generatePayrollHandoverPdf(unsupported, "HRConnector"),
    UnsupportedPdfText,
  );
  await assert.rejects(
    generatePayrollHandoverPdf(
      { ...fixture(), prepared_at: "invalid" },
      "HRConnector",
    ),
  );
});

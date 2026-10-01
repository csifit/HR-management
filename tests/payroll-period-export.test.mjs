import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { unzipSync, strFromU8 } from "fflate";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  decodePDFRawStream,
} from "pdf-lib";
import { calculatePayroll, payrollSchema } from "../src/lib/payroll.ts";
import {
  calculatePayrollEntry,
  payrollEntrySchema,
} from "../src/lib/payroll-settlement.ts";
import {
  calculatePayrollRun,
  payrollRunInputSchema,
} from "../src/lib/payroll-period.ts";
import { payslipBody } from "../src/lib/payroll-i18n.ts";
import {
  payrollHandoverCsvs,
  validatePayrollHandover,
} from "../src/lib/payroll-handover.ts";
import { buildPayrollHandoverArchive } from "../src/lib/payroll-handover-archive.ts";
import { generateApprovedPayrollPdf } from "../src/lib/payroll-run-pdf.ts";
import { generatePayrollHandoverPdf } from "../src/lib/payroll-handover-pdf.ts";
import {
  calculatePayrollWithLeave,
  payrollWithAnnualSchema,
} from "../src/lib/payroll-annual-leave.ts";

const ids = Array.from(
  { length: 7 },
  (_, i) => `c1000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
);
function fixture(locale = "ro") {
  const input = payrollRunInputSchema.parse({
    month: "2026-07",
    basic: 2162.5,
    bonus: 10.25,
    hours: 4,
    meals: 200.15,
    mealsReference: "Tichete-07",
    advance: 50.25,
    advanceReference: "Avans-07",
    primary: "yes",
    dependants: 0,
    young: "no",
    children: 0,
    reduced: "no",
    standard: "on",
    period: {
      start: "2026-07-01",
      end: "2026-07-22",
      monthWorkingDays: 23,
      employedWorkingDays: 16,
      monthCalendarDays: 31,
      employedCalendarDays: 22,
    },
    deductionEmployer: "this",
    deductionReference: "Declarație primul angajator",
  });
  const legacy = payrollSchema.parse({ ...input, basic: 5000 });
  return {
    export_id: ids[0],
    prepared_at: "2026-10-01T09:42:00Z",
    organisation_id: ids[1],
    locale,
    format_version: "HRConnector-accountant-v2",
    run: {
      id: ids[2],
      month: "2026-07-01",
      revision: 1,
      version: 5,
      approved_at: "2026-08-02T09:00:00Z",
      previous_run_id: null,
    },
    latest_approved_run_id: ids[2],
    latest_approved_revision: 1,
    is_historical: false,
    has_open_correction: false,
    company: {
      name: "Companie demonstrativă SRL",
      cui: "RO12345678",
      address: "Strada Exemplului 12, Brașov",
    },
    items: [
      {
        id: ids[3],
        employee_id: ids[4],
        employee_name: "Ștefania Țăran Popescu",
        department: "Operațiuni",
        job_title: "Specialist resurse umane",
        contract_number: "CIM-001",
        input,
        result: calculatePayrollRun(input),
      },
      {
        id: ids[5],
        employee_id: ids[6],
        employee_name: "Colegul lunii complete",
        department: "Operațiuni",
        job_title: "Specialist",
        contract_number: "CIM-002",
        input: legacy,
        result: calculatePayroll(legacy),
      },
    ],
  };
}

function annualFixture(locale = "ro") {
  const p = fixture(locale),
    item = p.items[0];
  p.format_version = "HRConnector-accountant-v4";
  item.input = payrollWithAnnualSchema.parse({
    ...item.input,
    annualLeave: {
      requests: [
        {
          id: "d1000000-0000-4000-8000-000000000001",
          dates: ["2026-07-02", "2026-07-03"],
          dailyGross: 110.25,
          rateReference: "Contabil CO iulie",
        },
      ],
      confirmed: "on",
    },
  });
  item.result = calculatePayrollWithLeave(item.input);
  return p;
}

test("v6 RO/EN exports preserve saved annual components, request evidence and hashes without recalculating", async () => {
  for (const locale of ["ro", "en"]) {
    const p = annualFixture(locale),
      item = p.items[0];
    // Download must retain these deliberately changed approved amounts.
    item.result.annualLeave.workedBasic = 1316.41;
    item.result.annualLeave.leaveGross = 231.5;
    item.result.cashGross += 11;
    const valid = validatePayrollHandover(p),
      rows = csvRows(payrollHandoverCsvs(valid)["payroll.csv"]);
    assert.equal(rows[0].length, rows[1].length);
    assert.equal(rows[0].length, rows[2].length);
    assert.equal(rows[1][16], locale === "ro" ? "1316,41" : "1316.41");
    assert.deepEqual(
      rows[1].slice(26, 29),
      locale === "ro" ? ["2", "1316,41", "231,50"] : ["2", "1316.41", "231.50"],
    );
    assert.deepEqual(JSON.parse(rows[1][29]), item.input.annualLeave.requests);
    assert.deepEqual(rows[2].slice(26, 30), ["", "", "", ""]);
    const archive = unzipSync(
        await buildPayrollHandoverArchive(valid, "HRConnector"),
      ),
      manifest = JSON.parse(strFromU8(archive["manifest.json"]));
    assert.deepEqual(
      manifest.employees[0].annual_leave,
      item.input.annualLeave,
    );
    assert.deepEqual(
      manifest.employees[0].annual_leave_amounts,
      item.result.annualLeave,
    );
    assert.match(strFromU8(archive["README.txt"]), /Format v4/);
    for (const f of manifest.files)
      assert.equal(
        f.sha256,
        createHash("sha256").update(archive[f.name]).digest("hex"),
      );
    const handoverPdf = await PDFDocument.load(archive["payroll-summary.pdf"]),
      handoverText = handoverPdf
        .getPages()
        .map((page) => pageText(handoverPdf, page))
        .join("\n");
    assert.match(handoverText, /Contabil CO iulie/);
    assert.match(handoverText, /2026-07-02, 2026-07-03/);
    assert.match(handoverText, locale === "ro" ? /231,50/ : /231\.50/);
    assert.match(handoverText, /RO-2026-monthly-v6/);
    await sample(`annual-handover-${locale}`, archive["payroll-summary.pdf"]);
    const bytes = await generateApprovedPayrollPdf(
        { ...p.run, organisation_id: p.organisation_id, status: "approved" },
        {
          ...item,
          run_id: p.run.id,
          organisation_id: p.organisation_id,
          source: {
            company: p.company,
            employee: {
              name: item.employee_name,
              email: "synthetic@example.test",
              job: item.job_title,
              department: item.department,
              workplace: "Office",
              start: "2026-01-01",
            },
          },
        },
        locale,
        "HRConnector",
      ),
      pdf = await PDFDocument.load(bytes),
      text = pdf
        .getPages()
        .map((page) => pageText(pdf, page))
        .join("\n");
    await sample(`annual-payslip-${locale}`, bytes);
    assert.equal(pdf.getPageCount(), 1);
    assert.match(text, /Contabil CO iulie/);
    assert.match(text, /RO-2026-monthly-v6/);
    assert.match(text, locale === "ro" ? /231,50/ : /231\.50/);
    await sample(`annual-payslip-${locale}`, bytes);
  }
});

test("annual handover rejects missing components, duplicate dates and incompatible saved versions", () => {
  const p = annualFixture();
  for (const mutate of [
    (q) => (q.format_version = "HRConnector-accountant-v3"),
    (q) => delete q.items[0].input.annualLeave,
    (q) => delete q.items[0].result.annualLeave,
    (q) => q.items[0].input.annualLeave.requests[0].dates.push("2026-07-03"),
    (q) => (q.items[0].input.annualLeave.requests[0].dates[0] = "2026-07-04"),
    (q) =>
      (q.items[0].input.annualLeave.requests[0].rateReference = " untrimmed "),
    (q) => (q.items[0].result.annualLeave.leaveGross = -1),
    (q) => (q.items[1].input.annualLeave = q.items[0].input.annualLeave),
    (q) => (q.items[0].result.rules = "RO-2026-monthly-v4"),
  ]) {
    const q = structuredClone(p);
    mutate(q);
    assert.throws(() => validatePayrollHandover(q));
  }
});

test("mixed v6/v5/v4/v3 handover and long annual evidence paginate without losing saved facts", async () => {
  const p = annualFixture("en"),
    item = p.items[0];
  for (const [n, withSettlement] of [
    [8, false],
    [10, true],
  ]) {
    const previous = structuredClone(fixture("en").items[0]);
    previous.id = `c1000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    previous.employee_id = `c1000000-0000-4000-8000-${String(n + 1).padStart(12, "0")}`;
    if (withSettlement)
      previous.input = payrollEntrySchema.parse({
        ...previous.input,
        settlement: {
          days: 2,
          dailyGross: 110.25,
          balanceReference: "Final balance",
          rateReference: "Final rate",
          otherGross: 0,
          otherReference: "",
          confirmed: "on",
        },
      });
    previous.result = calculatePayrollEntry(previous.input);
    p.items.push(previous);
  }
  const dates = Array.from(
    { length: 22 },
    (_, i) => `2026-07-${String(i + 1).padStart(2, "0")}`,
  ).filter((d) => ![0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay()));
  item.input = payrollWithAnnualSchema.parse({
    ...item.input,
    annualLeave: {
      confirmed: "on",
      requests: dates.map((date, i) => ({
        id: `d1000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
        dates: [date],
        dailyGross: 110.25,
        rateReference:
          `REF-${i + 1}-` +
          "Approved historical permanent components ".repeat(2),
      })),
    },
  });
  item.result = calculatePayrollWithLeave(item.input);
  const valid = validatePayrollHandover(p),
    archive = unzipSync(
      await buildPayrollHandoverArchive(valid, "HRConnector"),
    );
  const pdf = await PDFDocument.load(archive["payroll-summary.pdf"]),
    text = pdf
      .getPages()
      .map((page) => pageText(pdf, page))
      .join("\n");
  assert.ok(pdf.getPageCount() > 4);
  for (const request of item.input.annualLeave.requests) {
    assert.ok(text.includes(request.id));
    assert.ok(text.includes(request.dates[0]));
    assert.ok(
      text
        .replace(/\s+/g, " ")
        .includes(request.rateReference.replace(/\s+/g, " ")),
    );
  }
  for (const rule of ["v6", "v5", "v4", "v3"])
    assert.ok(text.includes(`RO-2026-monthly-${rule}`));
  await sample("annual-handover-long", archive["payroll-summary.pdf"]);
  const bytes = await generateApprovedPayrollPdf(
      { ...p.run, organisation_id: p.organisation_id, status: "approved" },
      {
        ...item,
        run_id: p.run.id,
        organisation_id: p.organisation_id,
        source: {
          company: p.company,
          employee: {
            name: item.employee_name,
            email: "synthetic@example.test",
            job: item.job_title,
            department: item.department,
            workplace: "Office",
            start: "2026-01-01",
          },
        },
      },
      "en",
      "HRConnector",
    ),
    slip = await PDFDocument.load(bytes),
    slipText = slip
      .getPages()
      .map((page) => pageText(slip, page))
      .join("\n");
  assert.ok(slip.getPageCount() > 1);
  for (const request of item.input.annualLeave.requests)
    assert.match(slipText, new RegExp(request.rateReference.slice(0, 7)));
  assert.match(slipText, /electronically generated|Electronically generated/);
  await sample("annual-payslip-long", bytes);
});

test("v5 mixed exports keep separate saved compensation, rate evidence and earned basic without recalculation", async () => {
  for (const locale of ["ro", "en"]) {
    const p = fixture(locale),
      previous = structuredClone(p.items[0]);
    previous.id = "c1000000-0000-4000-8000-000000000008";
    previous.employee_id = "c1000000-0000-4000-8000-000000000009";
    p.items.push(previous);
    p.format_version = "HRConnector-accountant-v3";
    const item = p.items[0];
    item.input = payrollEntrySchema.parse({
      ...item.input,
      settlement: {
        days: 5.5,
        dailyGross: 250.25,
        balanceReference: "Sold final revizuit",
        rateReference: "Tarif aprobat contabil",
        otherGross: 1000.25,
        otherReference: "Aprobare compensație",
        confirmed: "on",
      },
    });
    item.result = calculatePayrollEntry(item.input);
    const earned =
      (Math.round(item.result.cashGross * 100) -
        Math.round(item.input.bonus * 100) -
        Math.round(item.result.settlement.unusedLeaveGross * 100) -
        Math.round(item.result.settlement.otherGross * 100)) /
      100;
    // Deliberately different saved values verify that download does not recalculate.
    item.result.cashGross += 10;
    item.result.settlement.unusedLeaveGross += 10;
    const valid = validatePayrollHandover(p),
      files = payrollHandoverCsvs(valid),
      rows = csvRows(files["payroll.csv"]);
    assert.equal(
      rows[1][16],
      earned.toFixed(2).replace(".", locale === "ro" ? "," : "."),
    );
    assert.equal(rows[1][19], locale === "ro" ? "5,50" : "5.50");
    assert.equal(rows[1][21], locale === "ro" ? "1386,38" : "1386.38");
    assert.equal(rows[2][19], "");
    assert.equal(rows[3][19], "");
    const archive = unzipSync(
      await buildPayrollHandoverArchive(p, "HRConnector"),
    );
    const manifest = JSON.parse(strFromU8(archive["manifest.json"]));
    assert.deepEqual(manifest.employees[0].settlement, item.input.settlement);
    assert.equal(
      manifest.employees[0].settlement_amounts.unusedLeaveGross,
      1386.38,
    );
    assert.match(strFromU8(archive["README.txt"]), /Format v3/);
    for (const f of manifest.files)
      assert.equal(
        f.sha256,
        createHash("sha256").update(archive[f.name]).digest("hex"),
      );
    await sample(
      `settlement-handover-${locale}`,
      archive["payroll-summary.pdf"],
    );
    const run = {
        ...p.run,
        organisation_id: p.organisation_id,
        status: "approved",
      },
      snap = {
        ...item,
        run_id: p.run.id,
        organisation_id: p.organisation_id,
        source: {
          company: p.company,
          employee: {
            name: item.employee_name,
            email: "synthetic@example.test",
            job: item.job_title,
            department: item.department,
            workplace: "Office",
            start: "2026-01-01",
          },
        },
      };
    const bytes = await generateApprovedPayrollPdf(
        run,
        snap,
        locale,
        "HRConnector",
      ),
      pdf = await PDFDocument.load(bytes);
    const text = pdf
      .getPages()
      .map((page) => pageText(pdf, page))
      .join("\n");
    assert.equal(pdf.getPageCount(), 1);
    assert.match(text, /Tarif aprobat contabil/);
    assert.match(text, /Sold final revizuit/);
    assert.match(text, /RO-2026-monthly-v5/);
    assert.match(
      payslipBody(item.input, item.result, locale),
      locale === "ro" ? /1\.386,38/ : /1,386\.38/,
    );
    await sample(`settlement-payslip-${locale}`, bytes);
  }
});

test("settlement handover rejects missing facts, mixed format mismatch and invented old-version settlement", () => {
  const p = fixture("en");
  p.format_version = "HRConnector-accountant-v3";
  const item = p.items[0];
  item.input = payrollEntrySchema.parse({
    ...item.input,
    settlement: {
      days: 2,
      dailyGross: 250,
      balanceReference: "Balance reviewed",
      rateReference: "Rate approved",
      otherGross: 0,
      otherReference: "",
      confirmed: "on",
    },
  });
  item.result = calculatePayrollEntry(item.input);
  validatePayrollHandover(p);
  for (const modify of [
    (q) => (q.format_version = "HRConnector-accountant-v2"),
    (q) => delete q.items[0].input.settlement,
    (q) => delete q.items[0].result.settlement,
    (q) => (q.items[0].input.settlement.confirmed = ""),
    (q) => (q.items[0].input.settlement.rateReference = ""),
    (q) => (q.items[0].result.settlement.otherGross = 1),
    (q) => (q.items[1].input.settlement = item.input.settlement),
  ]) {
    const q = structuredClone(p);
    modify(q);
    assert.throws(() => validatePayrollHandover(q));
  }
});
function csvRows(text) {
  // These fixtures contain no multiline cells; quoted semicolons still need parsing.
  return text
    .slice(1)
    .trimEnd()
    .split("\r\n")
    .map((line) => {
      const cells = line.match(/"(?:[^"]|"")*"|[^;]+|(?<=;)(?=;|$)/g) ?? [];
      return cells.map((c) =>
        c.startsWith('"') ? c.slice(1, -1).replaceAll('""', '"') : c,
      );
    });
}
async function sample(name, bytes) {
  if (!process.env.HR_PERIOD_QA_DIR) return;
  await mkdir(process.env.HR_PERIOD_QA_DIR, { recursive: true });
  await writeFile(`${process.env.HR_PERIOD_QA_DIR}/${name}.pdf`, bytes);
}
function pageText(pdf, page) {
  const unicode = new Map();
  for (const [, ref] of page.node
    .Resources()
    .lookup(PDFName.of("Font"), PDFDict)
    .entries()) {
    const stream = pdf.context
      .lookup(ref, PDFDict)
      .lookup(PDFName.of("ToUnicode"), PDFRawStream);
    const source = new TextDecoder().decode(
      decodePDFRawStream(stream).decode(),
    );
    for (const [, from, to] of source.matchAll(
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
  const source = streams
    .map((stream) =>
      new TextDecoder().decode(decodePDFRawStream(stream).decode()),
    )
    .join("\n");
  const text = [...source.matchAll(/<([a-fA-F0-9]+)>\s*Tj/g)]
    .map(([, value]) =>
      (value.match(/.{4}/g) ?? [])
        .map((g) => unicode.get(g.toUpperCase()) ?? "�")
        .join(""),
    )
    .join("\n");
  assert.ok(!text.includes("�"));
  return text;
}

test("v2 mixed CSVs identify the saved period and leave retained v3 period fields empty", () => {
  for (const locale of ["ro", "en"]) {
    const payload = fixture(locale);
    // Deliberately different approved figures prove exports do not rerun the calculator.
    payload.items[0].result.cashGross = 1511.49;
    payload.items[0].result.payable = 812.34;
    const files = payrollHandoverCsvs(validatePayrollHandover(payload));
    const rows = csvRows(files["payroll.csv"]),
      payments = csvRows(files["remaining-pay.csv"]);
    assert.equal(rows[0].length, rows[1].length);
    assert.equal(rows[0].length, rows[2].length);
    assert.deepEqual(rows[1].slice(12, 16), [
      "2026-07-01",
      "2026-07-22",
      "23",
      "16",
    ]);
    assert.equal(rows[1][16], locale === "ro" ? "1501,24" : "1501.24");
    assert.deepEqual(rows[2].slice(12, 19), Array(7).fill(""));
    assert.equal(payments[0].length, payments[1].length);
    assert.equal(payments[0].length, payments[2].length);
    assert.deepEqual(payments[1].slice(10, 14), [
      "2026-07-01",
      "2026-07-22",
      "23",
      "16",
    ]);
    assert.equal(payments[1].at(-1), locale === "ro" ? "812,34" : "812.34");
  }
});

test("saved v4 exports reject inconsistent period, deduction entitlement and format", () => {
  for (const mutate of [
    (p) => {
      p.items[0].input.period.end = "2026-07-32";
    },
    (p) => {
      p.items[0].input.period.monthWorkingDays = 30;
    },
    (p) => {
      p.items[0].input.period = undefined;
    },
    (p) => {
      p.items[0].input.deductionReference = "";
    },
    (p) => {
      p.items[0].input.deductionReference = " untrimmed ";
    },
    (p) => {
      p.items[0].input.primary = "no";
    },
    (p) => {
      p.format_version = "HRConnector-accountant-v1";
    },
    (p) => {
      p.items[1].input.deductionEmployer = "this";
    },
  ]) {
    const payload = fixture();
    mutate(payload);
    assert.throws(() => validatePayrollHandover(payload));
  }
});

test("v2 ZIP manifests retain mixed rule versions, saved periods and matching file hashes", async () => {
  for (const locale of ["ro", "en"]) {
    const payload = fixture(locale);
    const files = unzipSync(
      await buildPayrollHandoverArchive(payload, "HRConnector"),
    );
    const manifest = JSON.parse(strFromU8(files["manifest.json"]));
    assert.equal(manifest.format, "HRConnector-accountant-v2");
    assert.deepEqual(manifest.rules, [
      "RO-2026-monthly-v4",
      "RO-2026-monthly-v3",
    ]);
    assert.deepEqual(
      manifest.employees[0].period,
      payload.items[0].input.period,
    );
    assert.ok(!("period" in manifest.employees[1]));
    for (const f of manifest.files) {
      assert.equal(f.bytes, files[f.name].length);
      assert.equal(
        f.sha256,
        createHash("sha256").update(files[f.name]).digest("hex"),
      );
    }
    assert.match(strFromU8(files["README.txt"]), /v3/);
    const pdf = await PDFDocument.load(files["payroll-summary.pdf"]);
    assert.equal(pdf.getPageCount(), 3);
    const text = pdf
      .getPages()
      .map((p) => pageText(pdf, p))
      .join("\n");
    assert.match(text, /2026-07-01 - 2026-07-22/);
    assert.match(text, /16\/23/);
    await sample(`handover-${locale}`, files["payroll-summary.pdf"]);
  }
});

test("RO/EN approved payslips show saved earned basic, employed dates and deduction reference", async () => {
  for (const locale of ["ro", "en"]) {
    const p = fixture(locale),
      i = p.items[0];
    i.result.cashGross = 1511.49;
    i.result.payable = 812.34;
    const body = payslipBody(i.input, i.result, locale);
    assert.ok(body.includes(locale === "ro" ? "1.501,24" : "1,501.24"));
    assert.match(body, /2026-07-22/);
    assert.match(body, /Declarație primul angajator/);
    const bytes = await generateApprovedPayrollPdf(
      { ...p.run, organisation_id: p.organisation_id, status: "approved" },
      {
        ...i,
        organisation_id: p.organisation_id,
        run_id: p.run.id,
        source: {
          company: p.company,
          employee: {
            name: i.employee_name,
            job: i.job_title,
            email: "synthetic@example.invalid",
            department: i.department,
            workplace: "Brașov",
            start: "2026-01-01",
            status: "terminated",
          },
        },
      },
      locale,
      "HRConnector",
    );
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), 1);
    const text = pdf
      .getPages()
      .map((page) => pageText(pdf, page))
      .join("\n");
    assert.ok(text.includes(locale === "ro" ? "812,34" : "812.34"));
    assert.match(text, /2026-07-22/);
    assert.match(text, /RO-2026-monthly-v4/);
    assert.match(text, /Declarație primul angajator/);
    await sample(`payslip-${locale}`, bytes);
  }
});

test("period labels remain present on paginated handovers with long employee names", async () => {
  const p = fixture();
  p.items = Array.from({ length: 35 }, (_, n) => ({
    ...p.items[0],
    employee_name: `${n + 1} Ștefania Țăran Popescu-Ionescu Dumitrescu Specialist operațiuni internaționale`,
  }));
  const bytes = await generatePayrollHandoverPdf(p, "HRConnector");
  const pdf = await PDFDocument.load(bytes);
  const texts = pdf.getPages().map((page) => pageText(pdf, page));
  assert.ok(pdf.getPageCount() > 3);
  assert.equal(texts.join("\n").match(/2026-07-01 - 2026-07-22/g).length, 70);
  for (const text of texts) assert.ok(text.includes(p.export_id));
  await sample("handover-long", bytes);
});

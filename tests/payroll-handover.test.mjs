import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HANDOVER_FORMAT,
  validatePayrollHandover,
  payrollHandoverTotals,
  payrollHandoverCsvs,
  payrollCsvText,
} from "../src/lib/payroll-handover.ts";
import { payrollDictionary, payrollRows } from "../src/lib/payroll-i18n.ts";

const uuid = (number) =>
  `96000000-0000-4000-8000-${String(number).padStart(12, "0")}`;

function fixture(count = 1) {
  return {
    export_id: uuid(1),
    prepared_at: "2026-09-30T09:30:00Z",
    organisation_id: uuid(2),
    locale: "ro",
    format_version: HANDOVER_FORMAT,
    run: {
      id: uuid(3),
      month: "2026-08-01",
      revision: 2,
      version: 6,
      approved_at: "2026-09-02T08:00:00+03:00",
      previous_run_id: uuid(4),
    },
    latest_approved_run_id: uuid(3),
    latest_approved_revision: 2,
    is_historical: false,
    has_open_correction: false,
    company: {
      name: "Companie exemplu SRL",
      cui: "RO12345678",
      address: "Strada Exemplului 12, Brașov",
    },
    items: Array.from({ length: count }, (_, index) => ({
      id: uuid(1000 + index),
      employee_id: uuid(2000 + index),
      employee_name: `Ștefania Țăran ${index + 1}`,
      department: "Operațiuni",
      job_title: "Specialist resurse umane",
      contract_number: "00042",
      input: {
        month: "2026-08",
        basic: 2162.5,
        bonus: 0.2,
        hours: 4,
        meals: 800.15,
        advance: 500.25,
        floorException: "none",
        evidence: "",
        mealsReference: "Tichete-08-2026",
        advanceReference: "Avans-08-2026",
        primary: "yes",
        dependants: 0,
        young: "no",
        children: 0,
        reduced: "no",
        standard: "on",
      },
      result: {
        rules: "RO-2026-monthly-v3",
        month: "2026-08",
        gross: 2962.85,
        cashGross: 2162.7,
        meals: 800.15,
        relief: 0,
        contributionBase: 2162.7,
        healthBase: 2962.85,
        cas: 541,
        cass: 296,
        personalDeduction: 865,
        youngDeduction: 0,
        childrenDeduction: 0,
        taxBaseBeforeRounding: 1260.85,
        taxBase: 1261,
        incomeTax: 126,
        net: 1199.7,
        advance: 500.25,
        payable: 699.45,
        contributionFloor: 4125,
        employerCas: 490,
        employerCass: 117,
        cam: 49,
        employerCost: 3618.85,
      },
    })),
  };
}

// Parse semicolon-delimited CSV independently, including embedded newlines and
// escaped quotes, so a broken field boundary cannot pass a substring assertion.
function readCsv(text) {
  assert.equal(
    text[0],
    "\uFEFF",
    "CSV includes a UTF-8 BOM for spreadsheet tools",
  );
  const rows = [];
  let row = [],
    field = "",
    quoted = false;
  for (let index = 1; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index++;
      } else quoted = !quoted;
    } else if (!quoted && char === ";") {
      row.push(field);
      field = "";
    } else if (!quoted && char === "\r" && text[index + 1] === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      index++;
    } else field += char;
  }
  assert.equal(quoted, false, "CSV quote is closed");
  assert.deepEqual(row, [], "CSV ends on a complete record");
  assert.equal(field, "");
  return rows;
}

test("handover totals use exact bani and retain every approved monetary amount", () => {
  const raw = fixture(3);
  raw.items[0].result.payable = 0.1;
  raw.items[1].result.payable = 0.2;
  raw.items[2].result.payable = 0.03;
  const data = validatePayrollHandover(raw),
    totals = payrollHandoverTotals(data);
  assert.equal(totals.payable, 0.33);
  assert.equal(totals.cashGross, 6488.1);
  assert.equal(totals.meals, 2400.45);
  assert.equal(totals.advance, 1500.75);
  assert.equal(totals.employerCost, 10856.55);
  assert.deepEqual(Object.keys(totals).sort(), [...payrollRows].sort());
  assert.deepEqual(
    raw.items,
    fixture(3).items.map((item, index) => ({
      ...item,
      result: { ...item.result, payable: [0.1, 0.2, 0.03][index] },
    })),
    "validation and totals do not mutate the input snapshot",
  );
});

test("handover preserves deliberately saved results rather than recalculating payroll", () => {
  const raw = fixture();
  // This deliberate discrepancy is a sentinel for accidental tax recalculation.
  // Approval and accounting correctness are enforced upstream, not by an export.
  raw.items[0].result.cas = 123.45;
  raw.items[0].result.net = 1000.55;
  raw.items[0].result.payable = 500.3;
  const data = validatePayrollHandover(raw);
  assert.deepEqual(data.items[0].result, raw.items[0].result);
  const totals = payrollHandoverTotals(data);
  assert.equal(totals.cas, 123.45);
  assert.equal(totals.net, 1000.55);
  assert.equal(totals.payable, 500.3);
  const rows = readCsv(payrollHandoverCsvs(data)["remaining-pay.csv"]);
  assert.deepEqual(rows[1].slice(-3), ["1000,55", "500,25", "500,30"]);
});

test("CSV exports have consistent columns, revision references and localized money", () => {
  for (const locale of ["ro", "en"]) {
    const raw = fixture(2);
    raw.locale = locale;
    raw.items[0].employee_name = 'Ștefania; "Țăran"\nDepartament nou';
    raw.items[0].department = 'Echipă "A"; HR';
    const data = validatePayrollHandover(raw),
      d = payrollDictionary(locale);
    const csvs = payrollHandoverCsvs(data);
    assert.deepEqual(Object.keys(csvs).sort(), [
      "payroll.csv",
      "remaining-pay.csv",
      "totals.csv",
    ]);
    const full = readCsv(csvs["payroll.csv"]),
      remaining = readCsv(csvs["remaining-pay.csv"]),
      totals = readCsv(csvs["totals.csv"]);
    for (const table of [full, remaining, totals]) {
      for (const row of table.slice(1)) {
        assert.equal(row.length, table[0].length);
        assert.deepEqual(row.slice(0, 6), [
          "2026-08",
          "2",
          uuid(3),
          uuid(1),
          locale === "ro" ? "Nu" : "No",
          "RON",
        ]);
      }
    }
    assert.equal(full.length, 3);
    assert.equal(full[0].length, 47);
    assert.equal(remaining.length, 3);
    assert.equal(remaining[0].length, 13);
    assert.equal(totals.length, 2);
    assert.equal(totals[0].length, 29);
    assert.equal(full[1][8], raw.items[0].employee_name);
    assert.equal(full[1][9], "'00042", "contract zeros remain text");
    assert.equal(full[1][10], raw.items[0].department);
    assert.equal(
      full[1][full[0].indexOf(d.basic)],
      locale === "ro" ? "2162,50" : "2162.50",
    );
    assert.equal(
      full[1][full[0].indexOf(d.bonus)],
      locale === "ro" ? "0,20" : "0.20",
    );
    assert.equal(
      full[1][full[0].indexOf(d.payable)],
      locale === "ro" ? "699,45" : "699.45",
    );
    assert.equal(full[1].at(-1), "RO-2026-monthly-v3");
    assert.deepEqual(
      remaining[1].slice(-3),
      locale === "ro"
        ? ["1199,70", "500,25", "699,45"]
        : ["1199.70", "500.25", "699.45"],
    );
    assert.equal(totals[1][6], "2");
    assert.equal(
      totals[1][totals[0].indexOf(d.payable)],
      locale === "ro" ? "1398,90" : "1398.90",
    );
  }
});

test("CSV text neutralizes formula prefixes, whitespace variants and fullwidth operators", () => {
  for (const dangerous of [
    "=1+1",
    "+SUM(1;2)",
    "-1+1",
    "@SUM(A1)",
    "  =1+1",
    "\u00a0+1",
    "\uFEFF@A1",
    "\t=1+1",
    "\n-2",
    "\r\n@A1",
    "＝1+1",
    "＋1",
    "－1",
    "＠A1",
    " \t＝1",
    "\tordinary text",
    "\nordinary text",
    '"quoted";=1\nnext',
  ]) {
    const encoded = payrollCsvText(dangerous),
      decoded = readCsv(`\uFEFF${encoded}\r\n`)[0][0];
    if (dangerous.startsWith('"')) assert.equal(decoded, dangerous);
    else
      assert.equal(
        decoded[0],
        "'",
        `formula/text prefix protected: ${JSON.stringify(dangerous)}`,
      );
    assert.equal(readCsv(`\uFEFF${encoded}\r\n`)[0].length, 1);
  }
  assert.equal(payrollCsvText("00000123"), '"\'00000123"');
  assert.equal(payrollCsvText(" 00123"), '"\' 00123"');
  assert.equal(payrollCsvText("0"), '"0"');
  assert.equal(payrollCsvText("Contract-001/2026"), '"Contract-001/2026"');
  assert.equal(
    payrollCsvText('Ștefania "Țăran"; HR'),
    '"Ștefania ""Țăran""; HR"',
  );
  assert.equal(payrollCsvText("a\u0000b\r\nc\rd\u007f"), '"a b\nc\nd "');
});

test("CSV protects every employee and evidence text column from formulas", () => {
  const raw = fixture();
  const item = raw.items[0];
  item.employee_name = "=SUM(A1:A2)";
  item.contract_number = "+12345";
  item.department = "@A1";
  item.job_title = "－1";
  item.input.evidence = "=EVIDENCE";
  item.input.mealsReference = "＝VOUCHERS";
  item.input.advanceReference = "@ADVANCE";
  const rows = readCsv(
    payrollHandoverCsvs(validatePayrollHandover(raw))["payroll.csv"],
  );
  for (const text of [
    item.employee_name,
    item.contract_number,
    item.department,
    item.job_title,
    item.input.evidence,
    item.input.mealsReference,
    item.input.advanceReference,
  ]) {
    assert.ok(rows[1].includes(`'${text}`), `protected text column: ${text}`);
    assert.ok(!rows[1].includes(text));
  }
});

test("historical exports must identify the correct newer approved revision", () => {
  const historical = fixture();
  historical.is_historical = true;
  historical.latest_approved_revision = 3;
  historical.latest_approved_run_id = uuid(5);
  historical.has_open_correction = true;
  const data = validatePayrollHandover(historical);
  assert.equal(readCsv(payrollHandoverCsvs(data)["payroll.csv"])[1][4], "Da");
  for (const patch of [
    { is_historical: false },
    { latest_approved_revision: 2 },
    { latest_approved_revision: 1 },
    { latest_approved_run_id: historical.run.id },
  ])
    assert.throws(() => validatePayrollHandover({ ...historical, ...patch }));
  assert.throws(() =>
    validatePayrollHandover({ ...fixture(), latest_approved_run_id: uuid(5) }),
  );
  assert.throws(() =>
    validatePayrollHandover({ ...fixture(), is_historical: true }),
  );
});

test("malformed handover IDs, versions, dates, months and formats fail validation", () => {
  const mutations = [
    (p) => {
      p.export_id = "not-a-uuid";
    },
    (p) => {
      p.organisation_id = "not-a-uuid";
    },
    (p) => {
      p.run.id = "not-a-uuid";
    },
    (p) => {
      p.items[0].employee_id = "not-a-uuid";
    },
    (p) => {
      p.run.version = 0;
    },
    (p) => {
      p.run.revision = -1;
    },
    (p) => {
      p.run.version = 1.5;
    },
    (p) => {
      p.run.revision = Number.MAX_SAFE_INTEGER + 1;
    },
    (p) => {
      p.latest_approved_revision = Infinity;
    },
    (p) => {
      p.run.month = "2026-08-02";
    },
    (p) => {
      p.run.month = "2027-08-01";
    },
    (p) => {
      p.run.month = "2026-13-01";
    },
    (p) => {
      p.items[0].input.month = "2026-07";
    },
    (p) => {
      p.items[0].result.month = "2026-07";
    },
    (p) => {
      p.prepared_at = "2026-09-30";
    },
    (p) => {
      p.run.approved_at = null;
    },
    (p) => {
      p.run.approved_at = "2026-02-30T09:00:00Z";
    },
    (p) => {
      p.format_version = "unrecognised-format";
    },
    (p) => {
      p.locale = "fr";
    },
    (p) => {
      p.items[0].result.rules = "RO-2026-monthly-v2";
    },
  ];
  for (const [index, mutate] of mutations.entries()) {
    const raw = fixture();
    mutate(raw);
    assert.throws(() => validatePayrollHandover(raw), `invalid case ${index}`);
  }
});

test("saved money is required, finite, nonnegative and limited to two decimal places", () => {
  for (const key of payrollRows) {
    for (const invalid of [
      undefined,
      null,
      "699.45",
      NaN,
      Infinity,
      -Infinity,
      -0.01,
      0.001,
      2000000.01,
    ]) {
      const raw = fixture();
      raw.items[0].result[key] = invalid;
      assert.throws(
        () => validatePayrollHandover(raw),
        `${key}: ${String(invalid)}`,
      );
    }
  }
  for (const valid of [0, 0.01, 0.1, 699.45, 1999999.99, 2000000]) {
    const raw = fixture();
    raw.items[0].result.payable = valid;
    assert.equal(validatePayrollHandover(raw).items[0].result.payable, valid);
  }
});

test("duplicate employees/items and empty or oversized employee sets fail atomically", () => {
  for (const key of ["id", "employee_id"]) {
    const raw = fixture(2);
    raw.items[1][key] = raw.items[0][key];
    assert.throws(() => validatePayrollHandover(raw));
  }
  assert.throws(() => validatePayrollHandover(fixture(0)));
  assert.throws(() => validatePayrollHandover(fixture(201)));
  assert.equal(validatePayrollHandover(fixture(200)).items.length, 200);
});

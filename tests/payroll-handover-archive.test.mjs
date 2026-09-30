import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { unzipSync, strFromU8, strToU8 } from "fflate";
import { PDFDocument } from "pdf-lib";
import { buildPayrollHandoverArchive } from "../src/lib/payroll-handover-archive.ts";
import { readHandoverRequest } from "../src/lib/payroll-handover-http.ts";
import {
  payrollHandoverCsvs,
  HANDOVER_FORMAT,
} from "../src/lib/payroll-handover.ts";
import { calculatePayroll, payrollSchema } from "../src/lib/payroll.ts";

const origin = "https://www.mkdir.space";
const url = `${origin}/api/payroll/83000000-0000-4000-8000-000000000001/handover`;
const requestBody = { version: 7, confirm: true, allowHistorical: false };
function request(body = JSON.stringify(requestBody), changes = {}) {
  const headers = new Headers({
    origin,
    "content-type": "application/json",
    "sec-fetch-site": "same-origin",
  });
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) headers.delete(key);
    else headers.set(key, value);
  }
  return new Request(url, { method: "POST", headers, body, duplex: "half" });
}
function fixture(locale) {
  const input = payrollSchema.parse({
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
  return {
    export_id: "81000000-0000-4000-8000-000000000001",
    prepared_at: "2026-09-30T09:42:00Z",
    organisation_id: "82000000-0000-4000-8000-000000000001",
    locale,
    format_version: HANDOVER_FORMAT,
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
      name: "Companie demonstrativă SRL",
      cui: "RO12345678",
      address: "Strada Exemplului nr. 12, Brașov",
    },
    items: [
      {
        id: "84000000-0000-4000-8000-000000000001",
        employee_id: "85000000-0000-4000-8000-000000000001",
        employee_name: "Ștefania Țăran",
        department: "Operațiuni",
        job_title: "Specialist resurse umane",
        contract_number: "000123",
        input,
        result: { ...calculatePayroll(input), payable: 1234.56 },
      },
    ],
  };
}

test("accountant archives have fixed names, byte-accurate manifests and original CSV bytes in both languages", async () => {
  const names = [
    "README.txt",
    "manifest.json",
    "payroll-summary.pdf",
    "payroll.csv",
    "remaining-pay.csv",
    "totals.csv",
  ];
  for (const locale of ["ro", "en"]) {
    const payload = fixture(locale);
    const files = unzipSync(
      await buildPayrollHandoverArchive(payload, "HRConnector"),
    );
    assert.deepEqual(Object.keys(files).sort(), names);
    for (const name of Object.keys(files))
      assert.match(name, /^[a-zA-Z0-9.-]+$/);
    const manifest = JSON.parse(strFromU8(files["manifest.json"]));
    assert.equal(manifest.format, HANDOVER_FORMAT);
    assert.equal(manifest.export_id, payload.export_id);
    assert.equal(manifest.prepared_at, payload.prepared_at);
    assert.deepEqual(manifest.run, payload.run);
    assert.equal(manifest.currency, "RON");
    assert.equal(manifest.employee_count, 1);
    assert.equal(manifest.is_historical, true);
    assert.equal(manifest.has_open_correction, true);
    assert.equal(
      manifest.latest_approved_run_id,
      payload.latest_approved_run_id,
    );
    assert.equal(manifest.latest_approved_revision, 2);
    assert.deepEqual(manifest.employees, [
      {
        employee_id: payload.items[0].employee_id,
        item_id: payload.items[0].id,
      },
    ]);
    assert.deepEqual(
      manifest.files.map((file) => file.name).sort(),
      names.filter((name) => name !== "manifest.json"),
    );
    for (const entry of manifest.files) {
      assert.equal(entry.bytes, files[entry.name].length);
      assert.equal(
        entry.sha256,
        createHash("sha256").update(files[entry.name]).digest("hex"),
      );
    }
    for (const [name, csv] of Object.entries(payrollHandoverCsvs(payload))) {
      assert.deepEqual(
        files[name],
        strToU8(csv),
        "CSV bytes must not be normalized or re-encoded",
      );
      assert.deepEqual(Array.from(files[name].slice(0, 3)), [0xef, 0xbb, 0xbf]);
      assert.ok(strFromU8(files[name]).endsWith("\r\n"));
    }
    const payments = strFromU8(files["remaining-pay.csv"]);
    assert.ok(
      payments.includes(locale === "ro" ? '"1234,56"' : '"1234.56"'),
      "Saved payable must not be recalculated",
    );
    assert.ok(
      payments.includes('"\'000123"'),
      "Leading-zero contract remains protected as text",
    );
    assert.equal(
      new TextDecoder().decode(files["payroll-summary.pdf"].subarray(0, 5)),
      "%PDF-",
    );
    const pdf = await PDFDocument.load(files["payroll-summary.pdf"]);
    assert.equal(pdf.getPageCount(), 3);
    assert.match(pdf.getSubject(), new RegExp(payload.export_id));
    assert.equal(
      pdf.getCreationDate().toISOString(),
      "2026-09-30T09:42:00.000Z",
    );
    const readme = strFromU8(files["README.txt"]);
    assert.ok(
      readme.includes(
        locale === "ro" ? "REVIZIE ISTORICĂ" : "HISTORICAL REVISION",
      ),
    );
    assert.ok(
      readme.includes(
        locale === "ro"
          ? "ciornă de corecție deschisă"
          : "correction draft is open",
      ),
    );
    assert.ok(
      readme.includes(
        locale === "ro" ? "valorile complete" : "complete amounts",
      ),
    );
    assert.ok(
      readme.includes(
        locale === "ro"
          ? "nu cumulați reviziile"
          : "do not add together revisions",
      ),
    );
    assert.ok(
      readme.includes(locale === "ro" ? "nu este criptată" : "not encrypted"),
    );
    assert.ok(
      readme.includes(
        locale === "ro"
          ? "nu sunt o semnătură digitală"
          : "not a digital signature",
      ),
    );
    assert.ok(
      readme.includes(
        locale === "ro" ? "nu transmite un email" : "does not send an email",
      ),
    );
    assert.match(readme, /SAGA/);
    assert.match(readme, /D112/);
  }
});

test("archive projection excludes private source and unrequested fields", async () => {
  const payload = fixture("en");
  const sentinel = "PRIVATE_SOURCE_MUST_NOT_BE_EXPORTED";
  const dirty = structuredClone(payload);
  dirty.source = { secret: sentinel };
  dirty.company.bank_account = sentinel;
  dirty.run.private_notes = sentinel;
  dirty.items[0].source = {
    employee: { cnp: sentinel, email: sentinel },
    attendance: sentinel,
  };
  dirty.items[0].input.private_notes = sentinel;
  dirty.items[0].result.private_notes = sentinel;
  const files = unzipSync(
    await buildPayrollHandoverArchive(dirty, "HRConnector"),
  );
  const manifest = JSON.parse(strFromU8(files["manifest.json"]));
  assert.deepEqual(manifest.company, payload.company);
  assert.deepEqual(manifest.run, payload.run);
  assert.deepEqual(Object.keys(manifest.employees[0]).sort(), [
    "employee_id",
    "item_id",
  ]);
  for (const [name, bytes] of Object.entries(files)) {
    assert.ok(
      !strFromU8(bytes).includes(sentinel),
      `Private data leaked in ${name}`,
    );
  }
  for (const [name, content] of Object.entries(payrollHandoverCsvs(payload)))
    assert.deepEqual(files[name], strToU8(content));
});

test("HTTP handover accepts an explicit same-origin confirmed JSON request", async () => {
  assert.deepEqual(await readHandoverRequest(request()), requestBody);
  assert.deepEqual(
    await readHandoverRequest(
      request(JSON.stringify({ ...requestBody, allowHistorical: true }), {
        "content-type": "Application/JSON; charset=utf-8",
        "sec-fetch-site": null,
      }),
    ),
    { ...requestBody, allowHistorical: true },
  );
});

test("HTTP handover rejects missing, cross-site, same-site and forged origins", async () => {
  for (const changes of [
    { origin: null },
    { origin: "null" },
    { origin: "https://evil.example" },
    { origin: "https://mkdir.space" },
    { origin: "http://www.mkdir.space" },
    { origin: "https://www.mkdir.space:444" },
    { origin: `${origin}/` },
    { "sec-fetch-site": "cross-site" },
    { "sec-fetch-site": "same-site" },
    {
      origin: "https://evil.example",
      host: "evil.example",
      "x-forwarded-host": "evil.example",
      "x-forwarded-proto": "https",
    },
  ])
    await assert.rejects(
      readHandoverRequest(request(undefined, changes)),
      /^Error: origin$/,
    );
});

test("HTTP handover rejects wrong MIME and malformed, unconfirmed or extra body fields", async () => {
  for (const contentType of [
    null,
    "text/plain",
    "application/jsonp",
    "application/x-www-form-urlencoded",
  ])
    await assert.rejects(
      readHandoverRequest(request(undefined, { "content-type": contentType })),
      /^Error: body$/,
    );
  for (const body of [
    "{",
    "null",
    "[]",
    "",
    JSON.stringify({ ...requestBody, confirm: false }),
    JSON.stringify({ ...requestBody, version: "7" }),
    JSON.stringify({ ...requestBody, version: 0 }),
    JSON.stringify({ ...requestBody, version: 1.5 }),
    JSON.stringify({ ...requestBody, version: 2147483648 }),
    JSON.stringify({ ...requestBody, allowHistorical: "true" }),
    JSON.stringify({ version: 7, confirm: true }),
    JSON.stringify({ ...requestBody, employeeIds: ["unexpected"] }),
  ])
    await assert.rejects(readHandoverRequest(request(body)));
  await assert.rejects(readHandoverRequest(request(new Uint8Array([0xff]))));
  await assert.rejects(readHandoverRequest(request(null)), /^Error: body$/);
});

test("HTTP handover enforces declared and actual streamed body byte caps", async () => {
  await assert.rejects(
    readHandoverRequest(request(undefined, { "content-length": "4097" })),
    /^Error: body$/,
  );
  const valid = JSON.stringify(requestBody);
  assert.deepEqual(
    await readHandoverRequest(request(valid.padEnd(4096, " "))),
    requestBody,
  );
  for (const declared of [null, "12"]) {
    let cancelled = false;
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(strToU8(valid));
        controller.enqueue(new Uint8Array(4096).fill(32));
      },
      cancel() {
        cancelled = true;
      },
    });
    await assert.rejects(
      readHandoverRequest(request(stream, { "content-length": declared })),
      /^Error: body$/,
    );
    assert.equal(cancelled, true, "Oversized live streams must be cancelled");
  }
  // Byte count, not JavaScript character count: each accented character is two UTF-8 bytes.
  await assert.rejects(
    readHandoverRequest(request('"' + "ă".repeat(2100) + '"')),
    /^Error: body$/,
  );
});

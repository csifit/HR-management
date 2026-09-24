import { test, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { unzipSync, strFromU8 } from "fflate";
import { buildPrivacyArchive } from "../src/lib/privacy-export.ts";
import {
  calendarMonthAfter,
  createPrivacySchema,
} from "../src/lib/privacy-validation.ts";
let db,
  org,
  otherOrg,
  employee,
  colleague,
  otherEmployee,
  inTest = false;
const users = Object.fromEntries(
  ["owner", "other", "employee", "manager", "hr", "platform"].map((name, i) => [
    name,
    `70000000-0000-4000-8000-00000000000${i + 1}`,
  ]),
);
async function scalar(sql, args = []) {
  return Object.values((await db.query(sql, args)).rows[0])[0];
}
async function as(user, fn) {
  if (inTest) await db.exec("savepoint actor");
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  try {
    return await fn();
  } catch (error) {
    if (inTest) await db.exec("rollback to savepoint actor");
    throw error;
  } finally {
    await db.exec("reset role");
    if (inTest) await db.exec("release savepoint actor");
  }
}
async function create({
  actor = users.owner,
  o = org,
  e = employee,
  received = "2026-01-31",
  due = "2026-02-28",
  kind = "access",
  assignee = users.hr,
} = {}) {
  return as(actor, () =>
    scalar(
      "select create_privacy_request($1,$2,$3,$4,$5,'email','Scope-REF-01',$6)",
      [o, e, kind, received, due, assignee],
    ),
  );
}
async function update(id, patch = {}, actor = users.owner) {
  const v = {
    version: 1,
    status: "in_review",
    assignee: users.hr,
    identity: "Verified-REF-01",
    due: "2026-02-28",
    reason: "",
    notified: null,
    response: "",
    responded: null,
    resolution: "",
    ...patch,
  };
  return as(actor, () =>
    db.query(
      "select update_privacy_request($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
      [
        org,
        id,
        v.version,
        v.status,
        v.assignee,
        v.identity,
        v.due,
        v.reason,
        v.notified,
        v.response,
        v.responded,
        v.resolution,
      ],
    ),
  );
}
async function prepare(
  id,
  {
    actor = users.owner,
    o = org,
    version = 2,
    documents = [],
    from = "2026-01-01",
    to = "2026-01-31",
    confirm = true,
  } = {},
) {
  return as(actor, () =>
    scalar("select prepare_privacy_export($1,$2,$3,$4::jsonb,$5,$6,$7)", [
      o,
      id,
      version,
      JSON.stringify(documents),
      from,
      to,
      confirm,
    ]),
  );
}
async function documentFor(e = employee, o = org) {
  const id = await as(o === org ? users.owner : users.other, () =>
    scalar(
      "select prepare_employee_document($1,$2,'Reviewed PDF','employment','hr_only','uploaded','test.pdf',5)",
      [o, e],
    ),
  );
  await db.query(
    "update employee_documents set ready_at=now(),status='uploaded',version=2 where id=$1",
    [id],
  );
  return { id, version: 2 };
}
before(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create schema auth;grant usage on schema auth to authenticated,anon;
  create table auth.users(id uuid primary key,email text unique,raw_user_meta_data jsonb default '{}',email_confirmed_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant execute on function auth.uid() to authenticated,anon;`);
  for (const name of ["storage-fixture.sql", "mfa-fixture.sql"])
    await db.exec(await readFile(new URL(name, import.meta.url), "utf8"));
  const folder = new URL("../supabase/migrations/", import.meta.url);
  for (const f of (await readdir(folder))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(await readFile(new URL(f, folder), "utf8"));
  for (const [name, id] of Object.entries(users))
    await db.query("insert into auth.users(id,email) values($1,$2)", [
      id,
      `${name}@privacy.test`,
    ]);
  await db.query("insert into private.platform_admins values($1,now())", [
    users.platform,
  ]);
  org = await as(users.owner, () =>
    scalar("select create_organisation('Privacy A','RO95001')"),
  );
  otherOrg = await as(users.other, () =>
    scalar("select create_organisation('Privacy B','RO95002')"),
  );
  const add = (o, name) =>
    scalar(
      "insert into employees(organisation_id,first_name,last_name,email,job_title,department,workplace,start_date,status) values($1,$2,'Test',$3,'Engineer','Product','Office','2026-01-01','active') returning id",
      [o, name, `${name}@privacy.test`],
    );
  await as(users.owner, async () => {
    employee = await add(org, "employee");
    colleague = await add(org, "colleague");
    for (const [name, role, e] of [
      ["hr", "hr_manager", null],
      ["manager", "manager", null],
      ["employee", "employee", employee],
    ])
      await db.query("select set_organisation_member($1,$2,$3,$4)", [
        org,
        `${name}@privacy.test`,
        role,
        e,
      ]);
    await db.query(
      "insert into employment_contracts(organisation_id,employee_id,contract_number,start_date,job_title,cor_code,contract_type,working_hours,workplace,gross_salary,status) values($1,$2,'C-1','2026-01-01','Engineer','123456','indefinite',8,'Office',10000,'active')",
      [org, employee],
    );
  });
  otherEmployee = await as(users.other, () => add(otherOrg, "other"));
});
beforeEach(async () => {
  await db.exec("begin");
  inTest = true;
});
afterEach(async () => {
  await db.exec("rollback;reset role");
  inTest = false;
});
after(async () => db.close());
test("HR register is isolated from employees, managers, platform administrators and other tenants", async () => {
  const id = await create();
  assert.equal(
    await as(users.hr, () =>
      scalar("select count(*)::int from privacy_requests"),
    ),
    1,
  );
  for (const user of [
    users.employee,
    users.manager,
    users.platform,
    users.other,
  ]) {
    assert.equal(
      await as(user, () =>
        scalar("select count(*)::int from privacy_requests"),
      ),
      0,
    );
    assert.equal(
      await as(user, () =>
        scalar("select count(*)::int from privacy_request_events"),
      ),
      0,
    );
    await assert.rejects(() => create({ actor: user }));
    await assert.rejects(() => update(id, {}, user));
    await assert.rejects(() => prepare(id, { actor: user }));
  }
  await assert.rejects(() =>
    as(users.hr, () =>
      db.query("update privacy_requests set summary='bypass' where id=$1", [
        id,
      ]),
    ),
  );
  await assert.rejects(() =>
    as(users.hr, () => db.query("delete from privacy_request_events")),
  );
  await assert.rejects(() =>
    as(users.hr, () =>
      scalar(
        "select private.privacy_employee_data($1,$2,'2026-01-01','2026-01-31')",
        [otherOrg, otherEmployee],
      ),
    ),
  );
  await assert.rejects(() => create({ e: otherEmployee }));
  await assert.rejects(() => create({ assignee: users.manager }));
  await assert.rejects(
    () =>
      as(users.employee, async () => {
        await db.exec("set role anon");
        return db.query("select * from privacy_requests");
      }),
    (e) => e.code === "42501",
  );
});
test("request changes preserve evidence, enforce deadlines, closure and optimistic concurrency", async () => {
  const id = await create();
  await update(id);
  await assert.rejects(
    () => update(id),
    (e) => e.code === "P0006",
  );
  await assert.rejects(() =>
    update(id, {
      version: 2,
      due: "2026-04-29",
      reason: "Complex case",
      notified: "2026-02-20",
    }),
  );
  await assert.rejects(() => update(id, { version: 2, due: "2026-03-28" }));
  await update(id, {
    version: 2,
    due: "2026-04-28",
    reason: "Complex case",
    notified: "2026-03-01",
  }); // retain actual late notice
  assert.equal(
    await scalar(
      "select count(*)::int from privacy_request_events where request_id=$1",
      [id],
    ),
    3,
  );
  await assert.rejects(() =>
    update(id, {
      version: 3,
      status: "completed",
      due: "2026-04-28",
      reason: "Complex case",
      notified: "2026-03-01",
    }),
  );
  await update(id, {
    version: 3,
    status: "completed",
    due: "2026-04-28",
    reason: "Complex case",
    notified: "2026-03-01",
    response: "Secure-transfer-01",
    responded: "2026-03-02",
    resolution: "Responded with reviewed records",
  });
  await assert.rejects(() => update(id, { version: 4 }));
  await assert.rejects(() => prepare(id, { version: 4 }));
  const audit = await scalar(
    "select jsonb_agg(metadata)::text from audit_log where entity_id=$1",
    [id],
  );
  assert.ok(
    !audit.includes("Secure-transfer") &&
      !audit.includes("Verified-REF") &&
      !audit.includes("Complex case"),
  );
  await assert.rejects(() =>
    create({ received: "2200-01-01", due: "2200-02-01" }),
  );
});
test("exports require verified identity, explicit scope and current document versions", async () => {
  const id = await create(),
    own = await documentFor(),
    wrong = await documentFor(colleague),
    foreign = await documentFor(otherEmployee, otherOrg);
  await assert.rejects(() => prepare(id, { version: 1 }));
  await update(id, { identity: "" });
  await assert.rejects(() => prepare(id));
  await update(id, { version: 2 });
  for (const documents of [
    [wrong],
    [foreign],
    [{ ...own, version: 1 }],
    [own, own],
  ])
    await assert.rejects(() => prepare(id, { version: 3, documents }));
  await assert.rejects(() => prepare(id, { version: 3, confirm: false }));
  await assert.rejects(() => prepare(id, { version: 3, to: "2027-02-02" }));
  const payload = await prepare(id, { version: 3, documents: [own] });
  assert.equal(payload.employee_id, employee);
  assert.equal(payload.files.length, 1);
  assert.equal(payload.data.employee.email, "employee@privacy.test");
  assert.equal(payload.data.contracts[0].gross_salary, 10000);
  assert.equal(payload.data.attendance_calculated.length, 31);
  assert.equal(
    payload.data.attendance_calculated.find((d) => d.day === "2026-01-05")
      .worked_hours,
    8,
  );
  const json = JSON.stringify(payload);
  assert.ok(
    !json.includes("colleague@") &&
      !json.includes("other@") &&
      !json.includes("Verified-REF") &&
      !json.includes("manager_user_id"),
  );
  assert.equal(
    await scalar(
      "select count(*)::int from privacy_exports where request_id=$1",
      [id],
    ),
    1,
  );
  assert.equal(
    await scalar("select status from privacy_requests where id=$1", [id]),
    "in_review",
  );
  assert.equal(
    await as(users.employee, () =>
      scalar("select count(*)::int from privacy_exports"),
    ),
    0,
  );
  await db.query(
    "update employee_documents set status='archived',version=3 where id=$1",
    [own.id],
  );
  assert.equal(
    (await prepare(id, { version: 3, documents: [{ ...own, version: 3 }] }))
      .files.length,
    1,
  );
});
test("MFA, suspension and blocking apply to register and export RPCs", async () => {
  const id = await create();
  await update(id);
  await db.query(
    "insert into auth.mfa_factors(user_id,status) values($1,'verified')",
    [users.hr],
  );
  assert.equal(
    await as(users.hr, () =>
      scalar("select count(*)::int from privacy_requests"),
    ),
    0,
  );
  await assert.rejects(() => prepare(id, { actor: users.hr }));
  await db.exec(
    `select set_config('request.jwt.claims','{"aal":"aal2"}',false)`,
  );
  assert.equal((await prepare(id, { actor: users.hr })).employee_id, employee);
  await db.query(
    "update organisations set status='suspended',status_reason='Test suspension' where id=$1",
    [org],
  );
  assert.equal(
    await as(users.hr, () =>
      scalar("select count(*)::int from privacy_requests"),
    ),
    1,
  );
  await assert.rejects(() => prepare(id, { actor: users.hr }));
  await assert.rejects(() => update(id, { version: 2 }));
  await db.query("update organisations set status='blocked' where id=$1", [
    org,
  ]);
  assert.equal(
    await as(users.hr, () =>
      scalar("select count(*)::int from privacy_requests"),
    ),
    0,
  );
  await assert.rejects(() => prepare(id));
});
test("case closure does not erase employment records and non-access requests cannot export", async () => {
  const id = await create({ kind: "erasure" });
  await update(id);
  await assert.rejects(() => prepare(id));
  await update(id, {
    version: 2,
    status: "refused",
    identity: "",
    response: "Reply-01",
    responded: "2026-02-01",
    resolution: "Retention reviewed; reasons communicated",
  });
  assert.equal(
    await scalar("select count(*)::int from employees where id=$1", [employee]),
    1,
  );
  assert.equal(
    await scalar(
      "select count(*)::int from employment_contracts where employee_id=$1",
      [employee],
    ),
    1,
  );
});
test("exports enforce total file and record limits without creating a misleading preparation entry", async () => {
  const id = await create();
  await update(id);
  const documents = [];
  for (let i = 0; i < 6; i++) {
    const doc = await documentFor();
    documents.push(doc);
    await db.query(
      "update employee_documents set byte_size=10485760 where id=$1",
      [doc.id],
    );
  }
  await assert.rejects(
    () => prepare(id, { documents }),
    (error) => error.code === "R0001",
  );
  assert.equal(await scalar("select count(*)::int from privacy_exports"), 0);
  await db.query(
    "insert into employee_documents(organisation_id,employee_id,title,category,visibility,origin,filename,byte_size) select $1,$2,repeat('A',160),'other','hr_only','uploaded','pending-'||n||'.pdf',5 from generate_series(1,5000) n",
    [org, employee],
  );
  await assert.rejects(
    () => prepare(id),
    (error) => error.code === "R0001",
  );
  assert.equal(await scalar("select count(*)::int from privacy_exports"), 0);
});
test("stored-history joins export only the subject's contracts, leave, benefits and lifecycle", async () => {
  const id = await create();
  await update(id);
  for (const [e, marker] of [
    [employee, "SUBJECT"],
    [colleague, "COLLEAGUE_ONLY"],
  ]) {
    await as(users.owner, () =>
      db.query(
        "insert into employment_contracts(organisation_id,employee_id,contract_number,start_date,job_title,cor_code,working_hours,workplace,gross_salary,status) values($1,$2,$3,'2025-01-01','Tester','123456',8,'Office',4000,'draft')",
        [org, e, marker],
      ),
    );
    const provider = await scalar(
      "insert into benefit_providers(organisation_id,name,adapter_key) values($1,$2,'custom') returning id",
      [org, marker],
    );
    const benefit = await scalar(
      "insert into benefits(organisation_id,provider_id,name,model,amount) values($1,$2,$3,'fixed_monthly',100) returning id",
      [org, provider, marker],
    );
    await db.query(
      "insert into employee_benefits(organisation_id,employee_id,benefit_id,starts_on) values($1,$2,$3,'2026-01-01')",
      [org, e, benefit],
    );
    const caseId = await as(users.owner, () =>
      scalar("select create_lifecycle_case($1,$2,'onboarding','2026-10-01')", [
        org,
        e,
      ]),
    );
    await db.query("update lifecycle_tasks set note=$1 where case_id=$2", [
      marker,
      caseId,
    ]);
    const leaveType = await scalar(
      "select id from leave_types where organisation_id=$1 and category='medical' limit 1",
      [org],
    );
    const leaveId = await as(users.owner, () =>
      scalar("select request_leave($1,$2,$3,'2026-01-05','2026-01-05')", [
        org,
        e,
        leaveType,
      ]),
    );
    await db.query("update leave_requests set decision_note=$1 where id=$2", [
      marker,
      leaveId,
    ]);
  }
  const payload = await prepare(id);
  assert.equal(payload.data.contracts.length, 2);
  assert.equal(payload.data.leave_requests.length, 1);
  assert.equal(payload.data.benefit_enrolments.length, 1);
  assert.equal(payload.data.lifecycle.length, 1);
  assert.ok(JSON.stringify(payload.data).includes("SUBJECT"));
  assert.ok(!JSON.stringify(payload.data).includes("COLLEAGUE_ONLY"));
});
test("calendar-month suggestions clamp month ends and reject malformed dates", () => {
  assert.equal(calendarMonthAfter("2026-01-31"), "2026-02-28");
  assert.equal(calendarMonthAfter("2024-01-31"), "2024-02-29");
  assert.equal(calendarMonthAfter("2026-12-31"), "2027-01-31");
  assert.equal(calendarMonthAfter("2026-02-31"), "");
  assert.equal(
    createPrivacySchema.safeParse({
      employee_id: employee,
      kind: "access",
      received_on: "2026-02-31",
      due_on: "2026-03-01",
      channel: "email",
      summary: "Test",
      assigned_to: users.hr,
    }).success,
    false,
  );
});
test("ZIP has a complete manifest and no storage paths; transfer and path failures never return a partial package", async () => {
  const id = await create(),
    doc = await documentFor();
  await update(id);
  const payload = await prepare(id, { documents: [doc] });
  const bytes = await buildPrivacyArchive(payload, async () =>
    new TextEncoder().encode("%PDF-"),
  );
  const files = unzipSync(bytes),
    manifest = JSON.parse(strFromU8(files["manifest.json"]));
  assert.equal(manifest.selected_documents[0].file, `documents/${doc.id}.pdf`);
  assert.equal(manifest.selected_documents[0].sha256.length, 64);
  assert.equal(
    JSON.parse(strFromU8(files["employee-data.json"])).employee.id,
    employee,
  );
  assert.ok(!strFromU8(files["manifest.json"]).includes("object_path"));
  assert.equal(manifest.review_view.file, "employee-data.html");
  const unsafe = structuredClone(payload);
  unsafe.data.employee.first_name = '<script>alert("test")</script>';
  const escaped = unzipSync(
    await buildPrivacyArchive(unsafe, async () =>
      new TextEncoder().encode("%PDF-"),
    ),
  );
  const html = strFromU8(escaped["employee-data.html"]);
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("Content-Security-Policy"));
  await assert.rejects(() =>
    buildPrivacyArchive(payload, async () => new Uint8Array(1)),
  );
  await assert.rejects(() =>
    buildPrivacyArchive(payload, async () => {
      throw new Error("Unavailable");
    }),
  );
  await assert.rejects(() =>
    buildPrivacyArchive(
      {
        ...payload,
        files: [{ ...payload.files[0], object_path: "../outside.pdf" }],
      },
      async () => {
        assert.fail("Must reject before download");
      },
    ),
  );
  await assert.rejects(() =>
    buildPrivacyArchive(
      { ...payload, files: Array(51).fill(payload.files[0]) },
      async () => new Uint8Array(5),
    ),
  );
});

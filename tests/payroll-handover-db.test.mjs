import { test, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { calculatePayroll, payrollSchema } from "../src/lib/payroll.ts";

let db,
  org,
  otherOrg,
  employee,
  colleague,
  inTest = false;
const users = Object.fromEntries(
  ["owner", "other", "employee", "manager", "hr", "platform"].map((name, i) => [
    name,
    `90000000-0000-4000-8000-00000000000${i + 1}`,
  ]),
);
const base = payrollSchema.parse({
  month: "2026-01",
  basic: 10000,
  bonus: 0,
  primary: "yes",
  dependants: 0,
  young: "no",
  children: 0,
  reduced: "no",
  standard: "on",
});
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
async function isolated(fn) {
  await db.exec("savepoint scenario");
  try {
    return await fn();
  } finally {
    await db.exec("rollback to savepoint scenario;release savepoint scenario");
  }
}
async function version(run) {
  return scalar("select version from payroll_runs where id=$1", [run]);
}
async function create(previous = null) {
  return as(users.owner, () =>
    scalar("select create_payroll_run($1,'2026-01-01',$2,$3)", [
      org,
      previous,
      previous ? "Accountant correction" : "",
    ]),
  );
}
async function save(run, e = employee, input = base) {
  const v = await version(run);
  return as(users.hr, () =>
    scalar("select save_payroll_item($1,$2,$3,$4,$5::jsonb,true)", [
      org,
      run,
      v,
      e,
      JSON.stringify(input),
    ]),
  );
}
async function approve(run) {
  const v = await version(run);
  return as(users.hr, () =>
    db.query("select approve_payroll_run($1,$2,$3,true)", [org, run, v]),
  );
}
async function approved(two = false) {
  const run = await create();
  await save(run);
  if (two) await save(run, colleague, { ...base, bonus: 123.45 });
  await approve(run);
  return run;
}
async function prepare(
  run,
  {
    actor = users.hr,
    o = org,
    v,
    locale = "ro",
    confirm = true,
    historical = false,
  } = {},
) {
  const requestedVersion = v ?? (await version(run));
  return as(actor, () =>
    scalar("select prepare_payroll_handover($1,$2,$3,$4,$5,$6)", [
      o,
      run,
      requestedVersion,
      locale,
      confirm,
      historical,
    ]),
  );
}
before(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create schema auth;grant usage on schema auth to authenticated,anon;
    create table auth.users(id uuid primary key,email text unique,raw_user_meta_data jsonb default '{}',email_confirmed_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant execute on function auth.uid() to authenticated,anon;`);
  for (const f of ["storage-fixture.sql", "mfa-fixture.sql"])
    await db.exec(await readFile(new URL(f, import.meta.url), "utf8"));
  const folder = new URL("../supabase/migrations/", import.meta.url);
  for (const f of (await readdir(folder))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(await readFile(new URL(f, folder), "utf8"));
  for (const [name, id] of Object.entries(users))
    await db.query("insert into auth.users(id,email) values($1,$2)", [
      id,
      `${name}@handover.test`,
    ]);
  await db.query("insert into private.platform_admins(user_id) values($1)", [
    users.platform,
  ]);
  org = await as(users.owner, () =>
    scalar("select create_organisation('Handover A','RO97001')"),
  );
  otherOrg = await as(users.other, () =>
    scalar("select create_organisation('Handover B','RO97002')"),
  );
  await as(users.owner, async () => {
    for (const name of ["employee", "colleague"]) {
      const e = await scalar(
        "insert into employees(organisation_id,first_name,last_name,email,job_title,department,workplace,start_date,status) values($1,$2,'Test',$3,'Engineer','Product','Office','2026-01-01','active') returning id",
        [org, name, `${name}@handover.test`],
      );
      if (name === "employee") employee = e;
      else colleague = e;
      await db.query(
        "insert into employment_contracts(organisation_id,employee_id,contract_number,start_date,job_title,cor_code,contract_type,working_hours,workplace,gross_salary,status) values($1,$2,$3,'2026-01-01','Engineer','251202','indefinite',8,'Office',10000,'active')",
        [org, e, `PAY-${name}`],
      );
    }
    for (const [name, role, e] of [
      ["hr", "hr_manager", null],
      ["manager", "manager", null],
      ["employee", "employee", employee],
    ])
      await db.query("select set_organisation_member($1,$2,$3,$4)", [
        org,
        `${name}@handover.test`,
        role,
        e,
      ]);
  });
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

test("handover uses approved saved projections after current company and employee data change", async () => {
  const run = await approved(true);
  const beforeRun = (
    await db.query("select * from payroll_runs where id=$1", [run])
  ).rows[0];
  const beforeItems = (
    await db.query(
      "select * from payroll_run_items where run_id=$1 order by id",
      [run],
    )
  ).rows;
  await as(users.hr, () =>
    db.query(
      "update employees set first_name='Changed',department='Changed' where id=$1",
      [employee],
    ),
  );
  await db.query(
    "update organisations set name='Renamed company',registered_address='New office' where id=$1",
    [org],
  );
  await db.query(
    "update employment_contracts set gross_salary=11000 where employee_id=$1",
    [employee],
  );
  const payload = await prepare(run);
  assert.deepEqual(payload.company, {
    name: "Handover A",
    cui: "RO97001",
    address: "",
  });
  assert.equal(payload.format_version, "HRConnector-accountant-v1");
  assert.equal(payload.locale, "ro");
  assert.equal(payload.items.length, 2);
  assert.equal(payload.is_historical, false);
  assert.equal(payload.has_open_correction, false);
  assert.equal(payload.latest_approved_run_id, run);
  assert.equal(payload.latest_approved_revision, 1);
  const item = payload.items.find((i) => i.employee_id === employee);
  assert.equal(item.employee_name, "employee Test");
  assert.equal(item.department, "Product");
  assert.equal(item.job_title, "Engineer");
  assert.equal(item.contract_number, "PAY-employee");
  assert.deepEqual(item.input, base);
  assert.deepEqual(item.result, calculatePayroll(base));
  assert.deepEqual(
    (await db.query("select * from payroll_runs where id=$1", [run])).rows[0],
    beforeRun,
  );
  assert.deepEqual(
    (
      await db.query(
        "select * from payroll_run_items where run_id=$1 order by id",
        [run],
      )
    ).rows,
    beforeItems,
  );
  assert.deepEqual(Object.keys(payload.run).sort(), [
    "approved_at",
    "id",
    "month",
    "previous_run_id",
    "revision",
    "version",
  ]);
  for (const secret of [
    "email",
    "workplace",
    "attendance",
    "schedule",
    "benefits",
    "source",
    "actor_id",
    "saved_by",
    users.owner,
    users.hr,
  ])
    assert.ok(!JSON.stringify(payload).includes(secret), secret);
  const history = (
    await as(users.hr, () =>
      db.query("select * from payroll_handover_exports where id=$1", [
        payload.export_id,
      ]),
    )
  ).rows[0];
  assert.equal(history.employee_count, 2);
  assert.equal(history.prepared_by, users.hr);
  assert.equal(history.run_version, beforeRun.version);
  assert.equal(history.run_id, run);
  const minimal = {
    export_id: payload.export_id,
    employee_count: 2,
    is_historical: false,
  };
  assert.deepEqual(
    await scalar(
      "select snapshot from payroll_run_events where action='handover_prepared'",
      [],
    ),
    minimal,
  );
  assert.deepEqual(
    await scalar(
      "select metadata from audit_log where action='payroll.handover_prepared'",
      [],
    ),
    minimal,
  );
});

test("handover and history enforce HR role, tenant isolation and no direct mutation", async () => {
  const run = await approved();
  await prepare(run);
  for (const actor of [
    users.employee,
    users.manager,
    users.platform,
    users.other,
  ]) {
    assert.equal(
      await as(actor, () =>
        scalar("select count(*)::int from payroll_handover_exports"),
      ),
      0,
    );
    await assert.rejects(() => prepare(run, { actor }), { code: "42501" });
  }
  await assert.rejects(
    () => prepare(run, { o: otherOrg, actor: users.other }),
    { code: "42501" },
  );
  assert.equal(
    await as(users.owner, () =>
      scalar("select count(*)::int from payroll_handover_exports"),
    ),
    1,
  );
  for (const sql of [
    "update payroll_handover_exports set employee_count=2",
    "delete from payroll_handover_exports",
    "insert into payroll_handover_exports select * from payroll_handover_exports",
  ])
    await assert.rejects(() => as(users.hr, () => db.exec(sql)), {
      code: "42501",
    });
  await assert.rejects(
    () =>
      as(users.hr, async () => {
        await db.exec("set role anon");
        return db.query(
          "select prepare_payroll_handover($1,$2,3,'ro',true,false)",
          [org, run],
        );
      }),
    { code: "42501" },
  );
});

test("approval, exact version and explicit confirmation are required with no success history on rejection", async () => {
  const run = await create();
  await save(run);
  await assert.rejects(() => prepare(run), { code: "D0001" });
  await approve(run);
  await assert.rejects(() => prepare(run, { v: 2 }), { code: "P0006" });
  for (const patch of [
    { confirm: false },
    { confirm: null },
    { locale: "de" },
    { locale: null },
    { historical: null },
  ])
    await assert.rejects(() => prepare(run, patch), { code: "22023" });
  assert.equal(
    await scalar("select count(*)::int from payroll_handover_exports"),
    0,
  );
  assert.equal(
    await scalar(
      "select count(*)::int from payroll_run_events where action='handover_prepared'",
    ),
    0,
  );
  const first = await prepare(run);
  const second = await prepare(run, { locale: "en" });
  assert.notEqual(first.export_id, second.export_id);
  assert.deepEqual(first.items, second.items);
  assert.equal(second.locale, "en");
});

test("latest approval and open corrections are captured; older revisions require historical acknowledgement", async () => {
  const original = await approved();
  const correction = await create(original);
  const pending = await prepare(original);
  assert.equal(pending.has_open_correction, true);
  assert.equal(pending.is_historical, false);
  await save(correction, employee, { ...base, bonus: 500.25 });
  await approve(correction);
  await assert.rejects(() => prepare(original), { code: "P0013" });
  const historical = await prepare(original, { historical: true });
  assert.equal(historical.is_historical, true);
  assert.equal(historical.has_open_correction, false);
  assert.equal(historical.latest_approved_run_id, correction);
  assert.equal(historical.latest_approved_revision, 2);
  assert.deepEqual(historical.items[0].result, calculatePayroll(base));
  const current = await prepare(correction);
  assert.equal(current.is_historical, false);
  assert.equal(current.run.previous_run_id, original);
  assert.deepEqual(
    current.items[0].result,
    calculatePayroll({ ...base, bonus: 500.25 }),
  );
  const next = await create(correction);
  assert.equal(
    (await prepare(original, { historical: true })).has_open_correction,
    true,
  );
  const v = await version(next);
  await as(users.hr, () =>
    db.query("select discard_payroll_run($1,$2,$3,'No correction needed')", [
      org,
      next,
      v,
    ]),
  );
  assert.equal((await prepare(correction)).has_open_correction, false);
});

test("MFA and organisation status protect preparation while suspended HR can inspect prior history", async () => {
  const run = await approved();
  await prepare(run);
  await db.query(
    "insert into auth.mfa_factors(user_id,status) values($1,'verified')",
    [users.hr],
  );
  assert.equal(
    await as(users.hr, () =>
      scalar("select count(*)::int from payroll_handover_exports"),
    ),
    0,
  );
  await assert.rejects(() => prepare(run));
  await db.exec(
    `select set_config('request.jwt.claims','{"aal":"aal2"}',false)`,
  );
  await prepare(run);
  await db.query(
    "update organisations set status='suspended',status_reason='Handover access test' where id=$1",
    [org],
  );
  assert.equal(
    await as(users.hr, () =>
      scalar("select count(*)::int from payroll_handover_exports"),
    ),
    2,
  );
  await assert.rejects(() => prepare(run));
  await db.query("update organisations set status='blocked' where id=$1", [
    org,
  ]);
  assert.equal(
    await as(users.hr, () =>
      scalar("select count(*)::int from payroll_handover_exports"),
    ),
    0,
  );
  await assert.rejects(() => prepare(run));
});

test("saved month, supported rules, required values and consistent company facts fail closed", async () => {
  const run = await approved(true);
  for (const [column, path, value] of [
    ["input", "{month}", "2026-02"],
    ["result", "{month}", "2026-02"],
    ["result", "{rules}", "unrecognized"],
    ["result", "{payable}", null],
    ["input", "{basic}", "10000"],
    ["source", "{employee,name}", null],
    ["source", "{contract,number}", null],
    ["source", "{company,name}", "Other saved name"],
    ["source", "{company,address}", null],
  ])
    await isolated(async () => {
      await db.query(
        `update payroll_run_items set ${column}=jsonb_set(${column},$1,$2::jsonb) where run_id=$3 and employee_id=$4`,
        [path, JSON.stringify(value), run, employee],
      );
      await assert.rejects(() => prepare(run), { code: "P0010" });
      assert.equal(
        await scalar("select count(*)::int from payroll_handover_exports"),
        0,
      );
    });
  await db.query(
    `update payroll_run_items set input=input||'{"internal_note":"input secret"}'::jsonb,result=result||'{"internal_note":"result secret"}'::jsonb,source=source||'{"private_notes":"source secret"}'::jsonb where run_id=$1`,
    [run],
  );
  const payload = await prepare(run);
  assert.ok(!JSON.stringify(payload).includes("secret"));
});

test("export rejects empty, over-200 and over-2-MiB snapshots without partial history", async () => {
  const run = await approved();
  await isolated(async () => {
    await db.query("delete from payroll_run_items where run_id=$1", [run]);
    await assert.rejects(() => prepare(run), { code: "P0012" });
  });
  await isolated(async () => {
    await db.query(
      `with people as (
      insert into employees(organisation_id,first_name,last_name,email,job_title,department,workplace,start_date,status)
      select $1,'Limit',n::text,'limit'||n||'@handover.test','Engineer','Product','Office','2026-01-01','active'
      from generate_series(1,200) n returning id
    ) insert into payroll_run_items(organisation_id,run_id,employee_id,input,result,source,saved_by)
      select $1,$2,p.id,i.input,i.result,i.source,$3 from people p cross join payroll_run_items i where i.run_id=$2`,
      [org, run, users.owner],
    );
    await assert.rejects(() => prepare(run), { code: "P0012" });
  });
  await isolated(async () => {
    await db.query(
      "update payroll_run_items set source=jsonb_set(source,'{employee,name}',to_jsonb(repeat('x',2097152))) where run_id=$1",
      [run],
    );
    await assert.rejects(() => prepare(run), { code: "P0012" });
  });
  assert.equal(
    await scalar("select count(*)::int from payroll_handover_exports"),
    0,
  );
  assert.equal(
    await scalar(
      "select count(*)::int from payroll_run_events where action='handover_prepared'",
    ),
    0,
  );
});

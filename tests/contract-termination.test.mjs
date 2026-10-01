import { test, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { contractSchema } from "../src/lib/validation.ts";

let db, org, otherOrg, employee, contract;
const users = Object.fromEntries(
  ["owner", "other", "employee", "hr", "manager"].map((name, i) => [
    name,
    `a1000000-0000-4000-8000-00000000000${i + 1}`,
  ]),
);
const form = {
  contract_number: "C1",
  start_date: "2026-01-01",
  end_date: "",
  job_title: "Developer",
  cor_code: "251202",
  contract_type: "indefinite",
  working_hours: 4,
  workplace: "Office",
  gross_salary: 5000,
  probation_days: 0,
  status: "active",
};
async function scalar(sql, args = []) {
  return Object.values((await db.query(sql, args)).rows[0])[0];
}
async function as(user, fn) {
  await db.exec("savepoint actor;set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  try {
    return await fn();
  } catch (error) {
    await db.exec("rollback to savepoint actor");
    throw error;
  } finally {
    await db.exec("reset role;release savepoint actor");
  }
}
async function update(date, actor = users.hr, expectedVersion = null) {
  return as(actor, () =>
    db.query(
      "update employment_contracts set termination_date=$1 where id=$2 and ($3::int is null or review_version=$3) returning review_version,status,termination_date,end_date",
      [date, contract, expectedVersion],
    ),
  );
}
async function month(value = "2026-01-01", actor = users.owner) {
  return (
    await as(actor, () =>
      db.query("select * from attendance_month($1,$2,$3)", [
        org,
        employee,
        value,
      ]),
    )
  ).rows.map((r) => ({
    ...r,
    day: (r.day instanceof Date ? r.day.toISOString() : r.day).slice(0, 10),
    planned_hours: Number(r.planned_hours),
    worked_hours: r.worked_hours === null ? null : Number(r.worked_hours),
  }));
}
before(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create schema auth;grant usage on schema auth to authenticated,anon;
    create table auth.users(id uuid primary key,email text unique,raw_user_meta_data jsonb default '{}',email_confirmed_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant execute on function auth.uid() to authenticated,anon;`);
  for (const name of ["storage-fixture.sql", "mfa-fixture.sql"])
    await db.exec(await readFile(new URL(name, import.meta.url), "utf8"));
  const folder = new URL("../supabase/migrations/", import.meta.url);
  for (const name of (await readdir(folder))
    .filter((v) => v.endsWith(".sql"))
    .sort())
    await db.exec(await readFile(new URL(name, folder), "utf8"));
  for (const [name, id] of Object.entries(users))
    await db.query("insert into auth.users(id,email) values($1,$2)", [
      id,
      `${name}@termination.test`,
    ]);
  await db.exec("begin");
  org = await as(users.owner, () =>
    scalar("select create_organisation('Termination A','RO991701')"),
  );
  otherOrg = await as(users.other, () =>
    scalar("select create_organisation('Termination B','RO991702')"),
  );
  await as(users.owner, async () => {
    employee = await scalar(
      "insert into employees(organisation_id,first_name,last_name,email,job_title,department,workplace,start_date,status) values($1,'Test','Employee','employee@termination.test','Developer','IT','Office','2026-01-01','active') returning id",
      [org],
    );
    for (const [name, role, person] of [
      ["employee", "employee", employee],
      ["hr", "hr_manager", null],
      ["manager", "manager", null],
    ])
      await db.query("select set_organisation_member($1,$2,$3,$4)", [
        org,
        `${name}@termination.test`,
        role,
        person,
      ]);
    contract = await scalar(
      "insert into employment_contracts(organisation_id,employee_id,contract_number,start_date,job_title,cor_code,workplace,gross_salary,working_hours,status) values($1,$2,'C1','2026-01-01','Developer','251202','Office',5000,4,'active') returning id",
      [org, employee],
    );
  });
  await db.exec("commit");
});
beforeEach(() => db.exec("begin"));
afterEach(() => db.exec("rollback"));
after(() => db.close());

test("contract form keeps actual last day separate from planned expiry and permits legacy blanks", () => {
  assert.equal(contractSchema.parse(form).termination_date, null);
  assert.equal(
    contractSchema.parse({ ...form, status: "terminated" }).termination_date,
    null,
  );
  const parsed = contractSchema.parse({
    ...form,
    termination_date: "2026-01-15",
  });
  assert.equal(parsed.end_date, null);
  assert.equal(parsed.termination_date, "2026-01-15");
  assert.equal(
    contractSchema.safeParse({ ...form, termination_date: "2025-12-31" })
      .success,
    false,
  );
  assert.equal(
    contractSchema.safeParse({ ...form, termination_date: "2026-02-30" })
      .success,
    false,
  );
  assert.equal(
    contractSchema.safeParse({
      ...form,
      contract_type: "fixed_term",
      end_date: "2026-01-31",
      termination_date: "2026-02-01",
    }).success,
    false,
  );
  assert.equal(
    contractSchema.safeParse({
      ...form,
      contract_type: "fixed_term",
      end_date: "2026-01-31",
      termination_date: "2026-01-31",
    }).success,
    true,
  );
});

test("HR last-day updates preserve status, audit the changed field, invalidate review and reject stale edit filters", async () => {
  await as(users.owner, () =>
    db.query("select review_contract_for_reges($1,$2,1)", [org, contract]),
  );
  const changed = await update("2026-01-15", users.hr, 1);
  assert.equal(changed.rows[0].status, "active");
  assert.equal(changed.rows[0].end_date, null);
  assert.equal(changed.rows[0].review_version, 2);
  assert.equal((await update("2026-01-16", users.owner, 1)).rows.length, 0);
  assert.equal(
    await scalar(
      "select count(*)::int from contract_reviews r join employment_contracts c on c.id=r.contract_id where r.contract_version=c.review_version and c.id=$1",
      [contract],
    ),
    0,
  );
  const fields = await scalar(
    "select metadata->'changed_fields' from audit_log where entity_id=$1 and action='contract.updated' order by created_at desc limit 1",
    [contract],
  );
  assert.ok(fields.includes("termination_date"));
  assert.equal(
    await scalar("select status from employees where id=$1", [employee]),
    "active",
  );
});

test("database date bounds apply to direct writes while blank terminated history remains valid", async () => {
  await assert.rejects(
    update("2025-12-31"),
    /contracts_termination_date_bounds/,
  );
  await as(users.hr, () =>
    db.query(
      "update employment_contracts set contract_type='fixed_term',end_date='2026-01-31',status='terminated' where id=$1",
      [contract],
    ),
  );
  await assert.rejects(
    update("2026-02-01"),
    /contracts_termination_date_bounds/,
  );
  await update("2026-01-31");
  await as(users.hr, () =>
    db.query(
      "update employment_contracts set termination_date=null where id=$1",
      [contract],
    ),
  );
  assert.equal(
    await scalar(
      "select termination_date from employment_contracts where id=$1",
      [contract],
    ),
    null,
  );
});

test("new date grants retain tenant, employee, manager, MFA and suspended-organisation restrictions", async () => {
  for (const actor of [users.employee, users.manager, users.other])
    assert.equal((await update("2026-01-15", actor)).rows.length, 0);
  await update("2026-01-15");
  assert.equal(
    await as(users.employee, () =>
      scalar(
        "select termination_date::text from employment_contracts where id=$1",
        [contract],
      ),
    ),
    "2026-01-15",
  );
  assert.equal(
    await as(users.other, () =>
      scalar("select count(*)::int from employment_contracts where id=$1", [
        contract,
      ]),
    ),
    0,
  );
  await db.query(
    "insert into auth.mfa_factors(user_id,status) values($1,'verified')",
    [users.hr],
  );
  assert.equal((await update("2026-01-16")).rows.length, 0);
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ aal: "aal2" }),
  ]);
  assert.equal((await update("2026-01-16")).rows.length, 1);
  await db.query("update organisations set status='suspended' where id=$1", [
    org,
  ]);
  assert.equal((await update("2026-01-17", users.owner)).rows.length, 0);
  await assert.rejects(
    as(users.owner, () =>
      db.query(
        "insert into employment_contracts(organisation_id,employee_id,contract_number,start_date,termination_date,job_title,cor_code,workplace,gross_salary) values($1,$2,'BLOCKED','2026-01-01','2026-01-15','Developer','251202','Office',5000)",
        [org, employee],
      ),
    ),
    /not active|row-level security/,
  );
});

test("active indefinite contract includes the last employed day and stops automatic hours and plans afterwards", async () => {
  await update("2026-01-15");
  const rows = await month();
  assert.equal(rows.find((r) => r.day === "2026-01-15").worked_hours, 4);
  assert.equal(rows.find((r) => r.day === "2026-01-15").category, "automatic");
  assert.equal(rows.find((r) => r.day === "2026-01-16").worked_hours, null);
  assert.equal(rows.find((r) => r.day === "2026-01-16").planned_hours, 0);
});

test("terminated employee or contract requires an actual dated unique contract for historical automatic work", async () => {
  await as(users.hr, () =>
    db.query("update employees set status='terminated' where id=$1", [
      employee,
    ]),
  );
  assert.equal(
    (await month()).find((r) => r.day === "2026-01-15").worked_hours,
    null,
  );
  await update("2026-01-15");
  assert.equal(
    (await month()).find((r) => r.day === "2026-01-15").worked_hours,
    4,
  );
  await as(users.hr, () =>
    db.query(
      "update employment_contracts set status='terminated' where id=$1",
      [contract],
    ),
  );
  assert.equal(
    (await month()).find((r) => r.day === "2026-01-15").worked_hours,
    4,
  );
  await as(users.hr, () =>
    db.query(
      "update employment_contracts set contract_type='fixed_term',end_date='2026-01-31',termination_date=null where id=$1",
      [contract],
    ),
  );
  assert.equal(
    (await month()).find((r) => r.day === "2026-01-15").worked_hours,
    null,
  );
});

test("an overlapping contract blocks inferred work, while an earlier actual end permits the subsequent contract", async () => {
  await update("2026-01-15");
  await as(users.hr, () =>
    db.query(
      "insert into employment_contracts(organisation_id,employee_id,contract_number,start_date,job_title,cor_code,workplace,gross_salary,working_hours,status) values($1,$2,'C2','2026-01-15','Developer','251202','Office',7000,6,'active')",
      [org, employee],
    ),
  );
  const rows = await month();
  assert.equal(rows.find((r) => r.day === "2026-01-15").worked_hours, null);
  assert.equal(rows.find((r) => r.day === "2026-01-16").worked_hours, 6);
  await as(users.hr, () =>
    db.query(
      "update employment_contracts set status='suspended' where contract_number='C2' and organisation_id=$1",
      [org],
    ),
  );
  assert.equal(
    (await month()).find((r) => r.day === "2026-01-15").worked_hours,
    null,
  );
});

test("manual attendance survives changed employment dates and calendar overrides still control automatic work", async () => {
  await as(users.hr, () =>
    db.query("select save_attendance($1,$2,'2026-01-16',4,3,'none',null)", [
      org,
      employee,
    ]),
  );
  await update("2026-01-15");
  let rows = await month();
  assert.equal(rows.find((r) => r.day === "2026-01-16").worked_hours, 3);
  assert.equal(rows.find((r) => r.day === "2026-01-16").planned_hours, 4);
  assert.equal(rows.find((r) => r.day === "2026-01-16").category, "none");
  await as(users.hr, () =>
    db.query("update employees set start_date='2026-01-20' where id=$1", [
      employee,
    ]),
  );
  rows = await month();
  assert.equal(rows.find((r) => r.day === "2026-01-16").planned_hours, 4);
  await as(users.hr, () =>
    db.query("update employees set start_date='2026-01-01' where id=$1", [
      employee,
    ]),
  );
  await db.query(
    "insert into work_calendar_days(organisation_id,day,is_working,label) values($1,'2026-01-15',false,'Company holiday')",
    [org],
  );
  assert.equal(
    (await month()).find((r) => r.day === "2026-01-15").worked_hours,
    null,
  );
});

test("date-aware attendance preserves access checks and never treats today or future days as elapsed work", async () => {
  await assert.rejects(month("2026-01-01", users.other), /access required/);
  const today = await scalar(
    "select (now() at time zone 'Europe/Bucharest')::date::text",
  );
  const rows = await month(today.slice(0, 7) + "-01");
  assert.ok(
    rows.filter((r) => r.day >= today).every((r) => r.worked_hours === null),
  );
  const future = await month("2100-01-01");
  assert.ok(future.every((r) => r.worked_hours === null));
});

test("privacy export includes the actual contract date while retaining prior sections and employee isolation", async () => {
  await update("2026-01-15");
  const data = await scalar(
    "select private.privacy_employee_data($1,$2,'2026-01-01','2026-01-31')",
    [org, employee],
  );
  assert.equal(data.contracts.length, 1);
  assert.equal(data.contracts[0].termination_date, "2026-01-15");
  assert.equal(data.contracts[0].end_date, null);
  assert.ok(Array.isArray(data.payroll_records));
  assert.ok(Array.isArray(data.payroll_history));
  assert.ok(Array.isArray(data.attendance_calculated));
  await db.exec("savepoint export_scope");
  await assert.rejects(
    scalar(
      "select private.privacy_employee_data($1,$2,'2026-01-01','2026-01-31')",
      [otherOrg, employee],
    ),
    /access required/,
  );
  await db.exec(
    "rollback to savepoint export_scope;release savepoint export_scope",
  );
  await assert.rejects(
    as(users.owner, () =>
      db.query(
        "select private.privacy_employee_data($1,$2,'2026-01-01','2026-01-31')",
        [org, employee],
      ),
    ),
    /permission denied/,
  );
});

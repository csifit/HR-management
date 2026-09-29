import { test, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  calculatePayroll,
  payrollSchema,
  floorExceptions,
} from "../src/lib/payroll.ts";

let db,
  org,
  otherOrg,
  employee,
  colleague,
  otherEmployee,
  contract,
  inTest = false;
const users = Object.fromEntries(
  ["owner", "other", "employee", "manager", "hr", "platform"].map((name, i) => [
    name,
    `80000000-0000-4000-8000-00000000000${i + 1}`,
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
async function create({
  actor = users.owner,
  o = org,
  month = "2026-01-01",
  previous = null,
  reason = "",
} = {}) {
  return as(actor, () =>
    scalar("select create_payroll_run($1,$2,$3,$4)", [
      o,
      month,
      previous,
      reason,
    ]),
  );
}
async function save(
  run,
  {
    actor = users.owner,
    o = org,
    e = employee,
    v,
    input = base,
    reviewed = true,
  } = {},
) {
  return as(actor, async () =>
    scalar("select save_payroll_item($1,$2,$3,$4,$5::jsonb,$6)", [
      o,
      run,
      v ?? (await version(run)),
      e,
      JSON.stringify(input),
      reviewed,
    ]),
  );
}
async function approve(
  run,
  { actor = users.owner, o = org, v, confirm = true } = {},
) {
  return as(actor, async () =>
    db.query("select approve_payroll_run($1,$2,$3,$4)", [
      o,
      run,
      v ?? (await version(run)),
      confirm,
    ]),
  );
}
async function remove(run, item, { actor = users.owner, o = org, v } = {}) {
  return as(actor, async () =>
    db.query("select remove_payroll_item($1,$2,$3,$4)", [
      o,
      run,
      v ?? (await version(run)),
      item,
    ]),
  );
}
async function discard(
  run,
  { actor = users.owner, o = org, v, reason = "Entered in error" } = {},
) {
  return as(actor, async () =>
    db.query("select discard_payroll_run($1,$2,$3,$4)", [
      o,
      run,
      v ?? (await version(run)),
      reason,
    ]),
  );
}
async function prepareDocument(
  item,
  { actor = users.owner, o = org, bytes = 100, locale = "en" } = {},
) {
  return as(actor, () =>
    scalar("select prepare_payroll_document($1,$2,$3,$4)", [
      o,
      item,
      bytes,
      locale,
    ]),
  );
}
async function saveAttendance(worked = 8, v = null) {
  return as(users.hr, () =>
    db.query("select save_attendance($1,$2,'2026-01-05',8,$3,'none',$4)", [
      org,
      employee,
      worked,
      v,
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
      `${name}@payroll.test`,
    ]);
  await db.query("insert into private.platform_admins(user_id) values($1)", [
    users.platform,
  ]);
  org = await as(users.owner, () =>
    scalar("select create_organisation('Payroll A','RO96001')"),
  );
  otherOrg = await as(users.other, () =>
    scalar("select create_organisation('Payroll B','RO96002')"),
  );
  const addEmployee = (o, name) =>
    scalar(
      "insert into employees(organisation_id,first_name,last_name,email,job_title,department,workplace,start_date,status) values($1,$2,'Test',$3,'Engineer','Product','Office','2026-01-01','active') returning id",
      [o, name, `${name}@payroll.test`],
    );
  await as(users.owner, async () => {
    employee = await addEmployee(org, "employee");
    colleague = await addEmployee(org, "colleague");
    for (const [name, role, e] of [
      ["hr", "hr_manager", null],
      ["manager", "manager", null],
      ["employee", "employee", employee],
    ])
      await db.query("select set_organisation_member($1,$2,$3,$4)", [
        org,
        `${name}@payroll.test`,
        role,
        e,
      ]);
    for (const [e, number] of [
      [employee, "PAY-1"],
      [colleague, "PAY-2"],
    ]) {
      const id = await scalar(
        "insert into employment_contracts(organisation_id,employee_id,contract_number,start_date,job_title,cor_code,contract_type,working_hours,workplace,gross_salary,status) values($1,$2,$3,'2026-01-01','Engineer','251202','indefinite',8,'Office',10000,'active') returning id",
        [org, e, number],
      );
      if (e === employee) contract = id;
    }
  });
  otherEmployee = await as(users.other, () => addEmployee(otherOrg, "other"));
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

test("SQL calculations match the existing calculator at deduction bands, relief caps, fractional amounts and rounding boundaries", async () => {
  const cases = [];
  for (const [month, minimum, cap] of [
    ["2026-01", 4050, 4300],
    ["2026-07", 4325, 4600],
  ]) {
    for (let dependants = 0; dependants <= 4; dependants++) {
      for (const offset of [0, 0.01, 49.99, 50, 50.01, 1999.99, 2000, 2000.01])
        cases.push({ ...base, month, basic: minimum + offset, dependants });
    }
    for (const bonus of [cap - minimum, cap - minimum + 0.01])
      cases.push({ ...base, month, basic: minimum, bonus });
    for (const floorException of floorExceptions)
      cases.push({
        ...base,
        month,
        basic: minimum / 2,
        hours: 4,
        floorException,
        evidence: "Certificate-2026",
      });
    for (const patch of [
      { primary: "no" },
      { reduced: "yes" },
      { young: "yes" },
      { dependants: 4, young: "yes", children: 20 },
      { meals: 800.15, mealsReference: "Issue-2026" },
      { advance: 500.25, advanceReference: "Bank-2026" },
    ])
      cases.push({ ...base, month, basic: minimum, ...patch });
  }
  for (const basic of [
    10001.99, 10002, 10004.99, 10005, 10008.5, 10008.51, 10199.99, 10200,
    1000000,
  ])
    cases.push({ ...base, basic });
  cases.push({
    ...base,
    basic: 10000.1,
    bonus: 0.2,
    meals: 800.15,
    mealsReference: "Issue-2026",
    advance: 500.25,
    advanceReference: "Bank-2026",
  });
  cases.push({
    ...base,
    month: "2026-09",
    basic: 2162.5,
    hours: 4,
    advance: 500.25,
    advanceReference: "Bank-2026",
  });
  for (const input of cases) {
    const normalized = payrollSchema.parse(input);
    assert.deepEqual(
      await scalar("select private.calculate_payroll_v3($1::jsonb)", [
        JSON.stringify(normalized),
      ]),
      calculatePayroll(normalized),
      JSON.stringify(normalized),
    );
  }
});

test("SQL rejects malformed or unsupported calculator input even when called outside the form", async () => {
  const cases = [
    null,
    [],
    {},
    { ...base, month: "2027-01" },
    { ...base, month: "2026-13" },
    { ...base, basic: 1000000, bonus: 0.01 },
    { ...base, basic: 1 },
    { ...base, standard: "" },
    { ...base, hours: 4.001 },
    { ...base, hours: 0 },
    { ...base, hours: 9 },
    { ...base, dependants: 5 },
    { ...base, dependants: 0.5 },
    { ...base, children: 21 },
    { ...base, primary: "no", dependants: 1 },
    { ...base, primary: "no", young: "yes" },
    { ...base, primary: "no", children: 1 },
    { ...base, floorException: "student" },
    { ...base, hours: 4, floorException: "student", evidence: "" },
    { ...base, floorException: "other" },
    { ...base, meals: 1 },
    { ...base, meals: 1, mealsReference: "Yes", primary: "no" },
    { ...base, advance: 1 },
    { ...base, advance: 5850.01, advanceReference: "Bank-01" },
    {
      ...base,
      basic: 600,
      hours: 1,
      meals: 100000,
      mealsReference: "Issue-01",
    },
    { ...base, evidence: "A".repeat(121) },
  ];
  for (const field of ["basic", "bonus", "meals", "advance"])
    for (const invalid of [-0.01, 1.001, 1000000.01, null, true, "1e4", ""])
      cases.push({ ...base, [field]: invalid });
  for (const input of cases)
    await isolated(async () =>
      assert.rejects(
        () =>
          scalar("select private.calculate_payroll_v3($1::jsonb)", [
            JSON.stringify(input),
          ]),
        undefined,
        JSON.stringify(input),
      ),
    );
});

test("payroll is HR-only and tenant isolated, including direct table writes and private helpers", async () => {
  const run = await create();
  const item = await save(run);
  for (const actor of [
    users.employee,
    users.manager,
    users.platform,
    users.other,
  ]) {
    for (const table of [
      "payroll_runs",
      "payroll_run_items",
      "payroll_run_events",
      "payroll_run_documents",
    ])
      assert.equal(
        await as(actor, () => scalar(`select count(*)::int from ${table}`)),
        0,
      );
    await assert.rejects(() => create({ actor }));
    await assert.rejects(() => save(run, { actor, v: 2 }));
    await assert.rejects(() => remove(run, item, { actor, v: 2 }));
    await assert.rejects(() => approve(run, { actor, v: 2 }));
    await assert.rejects(() => discard(run, { actor, v: 2 }));
    await assert.rejects(() => prepareDocument(item, { actor }));
  }
  assert.equal(
    await as(users.hr, () =>
      scalar("select count(*)::int from payroll_run_items"),
    ),
    1,
  );
  await assert.rejects(() => save(run, { e: otherEmployee }));
  await assert.rejects(() => save(run, { o: otherOrg }));
  for (const sql of [
    "update payroll_runs set status='approved'",
    "update payroll_run_items set result='{}'::jsonb",
    "delete from payroll_run_items",
    "delete from payroll_run_events",
    "delete from payroll_run_documents",
    "select private.calculate_payroll_v3('{}'::jsonb)",
  ])
    await assert.rejects(() => as(users.hr, () => db.exec(sql)), {
      code: "42501",
    });
  await assert.rejects(
    () =>
      as(users.hr, async () => {
        await db.exec("set role anon");
        return db.query("select create_payroll_run($1,'2026-01-01',null,'')", [
          org,
        ]);
      }),
    { code: "42501" },
  );
});

test("drafts use optimistic versions, permit explicit employee selection and preserve removal history", async () => {
  const run = await create();
  await assert.rejects(() => create());
  await assert.rejects(() => approve(run));
  await assert.rejects(() => save(run, { reviewed: false }));
  const item = await save(run);
  assert.equal(await version(run), 2);
  await assert.rejects(() => save(run, { v: 1 }), { code: "P0006" });
  await assert.rejects(() => approve(run, { v: 1 }), { code: "P0006" });
  await assert.rejects(() => remove(run, item, { v: 1 }), { code: "P0006" });
  await assert.rejects(() => approve(run, { confirm: false }));
  await save(run, { input: { ...base, bonus: 100 } });
  assert.equal(
    await scalar(
      "select count(*)::int from payroll_run_items where run_id=$1",
      [run],
    ),
    1,
  );
  const colleagueItem = await save(run, { e: colleague });
  await remove(run, colleagueItem);
  assert.equal(
    await scalar(
      "select count(*)::int from payroll_run_items where run_id=$1",
      [run],
    ),
    1,
  );
  assert.ok(
    (await scalar(
      "select count(*)::int from payroll_run_events where run_id=$1",
      [run],
    )) >= 5,
  );
  await approve(run, { actor: users.hr });
  assert.equal(
    await scalar("select status from payroll_runs where id=$1", [run]),
    "approved",
  );
  const saved = await scalar(
    "select result from payroll_run_items where id=$1",
    [item],
  );
  assert.deepEqual(saved, calculatePayroll({ ...base, bonus: 100 }));
  for (const operation of [
    () => save(run),
    () => remove(run, item),
    () => approve(run),
    () => discard(run),
  ])
    await assert.rejects(operation);
});

test("discarding a draft requires a reason and permits replacement without deleting its history", async () => {
  const run = await create();
  await save(run);
  await assert.rejects(() => discard(run, { reason: "" }));
  await assert.rejects(() => discard(run, { v: 1 }), { code: "P0006" });
  await discard(run);
  assert.equal(
    await scalar("select status from payroll_runs where id=$1", [run]),
    "discarded",
  );
  assert.equal(
    await scalar(
      "select count(*)::int from payroll_run_items where run_id=$1",
      [run],
    ),
    1,
  );
  await assert.rejects(() => save(run));
  await assert.rejects(() => approve(run));
  const replacement = await create();
  assert.notEqual(replacement, run);
  assert.ok(
    (await scalar(
      "select count(*)::int from payroll_run_events where run_id=$1",
      [run],
    )) >= 3,
  );
});

test("future months can be drafted but not approved and input month must match the run", async () => {
  const run = await create({ month: "2026-12-01" });
  await assert.rejects(() => save(run));
  await save(run, { input: { ...base, month: "2026-12" } });
  await assert.rejects(() => approve(run));
  for (const month of ["2025-12-01", "2027-01-01", "2026-01-02"])
    await assert.rejects(() => create({ month }));
});

test("source changes require HR to refresh saved payroll before approval", async () => {
  const changes = [
    [
      "contract",
      () =>
        as(users.hr, () =>
          db.query(
            "update employment_contracts set job_title='Senior engineer' where id=$1",
            [contract],
          ),
        ),
    ],
    [
      "employee",
      () =>
        as(users.hr, () =>
          db.query("update employees set department='Research' where id=$1", [
            employee,
          ]),
        ),
    ],
    [
      "company",
      () =>
        db.query(
          "update organisations set registered_address='Updated office' where id=$1",
          [org],
        ),
    ],
    ["manual attendance", () => saveAttendance()],
    [
      "calendar",
      () =>
        as(users.hr, () =>
          db.query(
            "select save_calendar_day($1,'2026-01-05',false,'Closure')",
            [org],
          ),
        ),
    ],
    [
      "schedule",
      () =>
        db.query(
          "insert into work_schedules(organisation_id,employee_id,effective_from,weekdays,updated_by) values($1,$2,'2026-01-15',array[1,2,3,4],$3)",
          [org, employee, users.owner],
        ),
    ],
    [
      "benefit",
      () =>
        as(users.hr, async () => {
          const provider = await scalar(
            "select save_benefit_provider($1,null,null,'Test provider','custom',true)",
            [org],
          );
          const benefit = await scalar(
            "select save_benefit($1,null,null,$2,'Meal vouchers','per_worked_day',45,true)",
            [org, provider],
          );
          await db.query(
            "select save_employee_benefit($1,null,null,$2,$3,'2026-01-01',null,true)",
            [org, employee, benefit],
          );
        }),
    ],
  ];
  for (const [label, change] of changes)
    await isolated(async () => {
      const run = await create();
      await save(run);
      await change();
      await assert.rejects(() => approve(run), undefined, label);
      assert.equal(
        await scalar("select status from payroll_runs where id=$1", [run]),
        "draft",
      );
    });
  const run = await create();
  await save(run);
  await as(users.hr, () =>
    db.query("update employment_contracts set gross_salary=11000 where id=$1", [
      contract,
    ]),
  );
  await assert.rejects(() => approve(run));
  await assert.rejects(() => save(run));
  await save(run, { input: { ...base, basic: 11000 } });
  await approve(run);
  assert.deepEqual(
    await scalar("select result from payroll_run_items where run_id=$1", [run]),
    calculatePayroll({ ...base, basic: 11000 }),
  );
});

test("approved leave, absences, partial employment and non-standard schedules remain outside supported payroll", async () => {
  const conditions = [
    [
      "mid-month start",
      () =>
        as(users.hr, () =>
          db.query("update employees set start_date='2026-01-02' where id=$1", [
            employee,
          ]),
        ),
    ],
    [
      "early contract end",
      () =>
        as(users.hr, () =>
          db.query(
            "update employment_contracts set contract_type='fixed_term',end_date='2026-01-30' where id=$1",
            [contract],
          ),
        ),
    ],
    [
      "suspended contract",
      () =>
        as(users.hr, () =>
          db.query(
            "update employment_contracts set status='suspended' where id=$1",
            [contract],
          ),
        ),
    ],
    [
      "absence",
      () =>
        as(users.hr, () =>
          db.query(
            "select save_attendance($1,$2,'2026-01-05',8,0,'other',null)",
            [org, employee],
          ),
        ),
    ],
    ["unannounced no-show", () => saveAttendance(0)],
    ["short day", () => saveAttendance(7)],
    ["overtime", () => saveAttendance(9)],
    [
      "approved leave",
      () =>
        as(users.hr, async () => {
          const type = await scalar(
            "select id from leave_types where organisation_id=$1 and category='medical'",
            [org],
          );
          const leave = await scalar(
            "select request_leave($1,$2,$3,'2026-01-05','2026-01-05')",
            [org, employee, type],
          );
          await db.query("select decide_leave($1,$2,1,'approved','Reviewed')", [
            org,
            leave,
          ]);
        }),
    ],
    [
      "non-standard schedule",
      () =>
        db.query(
          "insert into work_schedules(organisation_id,effective_from,weekdays,updated_by) values($1,'2026-01-01',array[1,2,3,4],$2)",
          [org, users.owner],
        ),
    ],
  ];
  for (const [label, change] of conditions)
    await isolated(async () => {
      const run = await create();
      await change();
      await assert.rejects(() => save(run), undefined, label);
      assert.equal(
        await scalar(
          "select count(*)::int from payroll_run_items where run_id=$1",
          [run],
        ),
        0,
      );
    });
});

test("approval checks only included employees, without declaring a complete company payroll", async () => {
  const run = await create();
  await save(run);
  await as(users.hr, async () => {
    await db.query(
      "update employment_contracts set gross_salary=12000 where employee_id=$1",
      [colleague],
    );
    await db.query(
      "select save_attendance($1,$2,'2026-01-05',8,0,'other',null)",
      [org, colleague],
    );
  });
  await approve(run);
  assert.deepEqual(
    (
      await db.query(
        "select employee_id from payroll_run_items where run_id=$1",
        [run],
      )
    ).rows,
    [{ employee_id: employee }],
  );
});

test("MFA, suspension and blocking protect payroll reads and every mutation", async () => {
  const run = await create();
  const item = await save(run);
  await db.query(
    "insert into auth.mfa_factors(user_id,status) values($1,'verified')",
    [users.hr],
  );
  assert.equal(
    await as(users.hr, () => scalar("select count(*)::int from payroll_runs")),
    0,
  );
  await assert.rejects(() => approve(run, { actor: users.hr, v: 2 }));
  await db.exec(
    `select set_config('request.jwt.claims','{"aal":"aal2"}',false)`,
  );
  assert.equal(
    await as(users.hr, () => scalar("select count(*)::int from payroll_runs")),
    1,
  );
  await db.query(
    "update organisations set status='suspended',status_reason='Payroll access test' where id=$1",
    [org],
  );
  assert.equal(
    await as(users.hr, () =>
      scalar("select count(*)::int from payroll_run_items"),
    ),
    1,
  );
  for (const operation of [
    () => create({ actor: users.hr, month: "2026-02-01" }),
    () => save(run, { actor: users.hr }),
    () => remove(run, item, { actor: users.hr }),
    () => approve(run, { actor: users.hr }),
    () => discard(run, { actor: users.hr }),
    () => prepareDocument(item, { actor: users.hr }),
  ])
    await assert.rejects(operation);
  await db.query("update organisations set status='blocked' where id=$1", [
    org,
  ]);
  for (const table of [
    "payroll_runs",
    "payroll_run_items",
    "payroll_run_events",
    "payroll_run_documents",
  ])
    assert.equal(
      await as(users.hr, () => scalar(`select count(*)::int from ${table}`)),
      0,
    );
  await assert.rejects(() => approve(run, { actor: users.hr, v: 2 }));
});

test("corrections copy selected entries and retain original approvals, figures and source history", async () => {
  const original = await create(),
    originalItem = await save(original);
  await approve(original);
  const before = (
    await db.query("select * from payroll_run_items where id=$1", [
      originalItem,
    ])
  ).rows[0];
  await assert.rejects(() => create());
  await assert.rejects(() => create({ previous: original }));
  await assert.rejects(() =>
    create({ month: "2026-02-01", previous: original, reason: "Wrong month" }),
  );
  const correction = await create({
    previous: original,
    reason: "Correct bonus based on accountant review",
  });
  const copied = (
    await db.query("select * from payroll_run_items where run_id=$1", [
      correction,
    ])
  ).rows[0];
  assert.notEqual(copied.id, originalItem);
  assert.deepEqual(copied.input, before.input);
  assert.deepEqual(copied.result, before.result);
  assert.deepEqual(copied.source, before.source);
  await assert.rejects(() =>
    create({ previous: original, reason: "Duplicate draft" }),
  );
  await save(correction, { input: { ...base, bonus: 123.45 } });
  await approve(correction);
  assert.deepEqual(
    (
      await db.query("select * from payroll_run_items where id=$1", [
        originalItem,
      ])
    ).rows[0],
    before,
  );
  assert.equal(
    await scalar("select status from payroll_runs where id=$1", [original]),
    "approved",
  );
  assert.equal(
    await scalar(
      "select id from payroll_runs where organisation_id=$1 and month='2026-01-01' and status='approved' order by revision desc limit 1",
      [org],
    ),
    correction,
  );
  await assert.rejects(
    () => create({ previous: original, reason: "Stale approved revision" }),
    { code: "P0006" },
  );
  const discarded = await create({
    previous: correction,
    reason: "Check another adjustment",
  });
  await discard(discarded);
  const next = await create({
    previous: correction,
    reason: "Corrected supporting evidence",
  });
  assert.equal(
    await scalar("select revision from payroll_runs where id=$1", [next]),
    4,
  );
  const general = JSON.stringify(
    (
      await db.query(
        "select metadata from audit_log where action like 'payroll.%'",
      )
    ).rows,
  );
  for (const field of ["cashGross", "basic", "payable", "source", "evidence"])
    assert.ok(!general.includes(field));
});

test("payslip preparation is approved-only, linked to its exact employee revision and privately stored", async () => {
  const run = await create(),
    item = await save(run);
  await assert.rejects(() => prepareDocument(item), { code: "D0001" });
  await approve(run);
  for (const patch of [
    { bytes: 0 },
    { bytes: 10485761 },
    { locale: "de" },
    { o: otherOrg },
  ])
    await assert.rejects(() => prepareDocument(item, patch));
  const document = await prepareDocument(item);
  const row = (
    await db.query("select * from employee_documents where id=$1", [document])
  ).rows[0];
  assert.equal(row.employee_id, employee);
  assert.equal(row.visibility, "hr_only");
  assert.equal(row.ready_at, null);
  assert.equal(row.object_path, `${org}/${document}.pdf`);
  assert.match(row.title, /2026-01 - r1$/);
  assert.deepEqual(
    (
      await db.query(
        "select run_id,item_id from payroll_run_documents where document_id=$1",
        [document],
      )
    ).rows[0],
    { run_id: run, item_id: item },
  );
  const retry = await prepareDocument(item);
  assert.notEqual(retry, document);
  assert.equal(
    await scalar("select status from payroll_runs where id=$1", [run]),
    "approved",
  );
  assert.equal(
    await as(users.employee, () =>
      scalar("select count(*)::int from employee_documents where id=$1", [
        document,
      ]),
    ),
    0,
  );
  await as(users.hr, () =>
    db.query(
      "update employees set first_name='Changed after approval' where id=$1",
      [employee],
    ),
  );
  assert.equal(
    await scalar(
      "select source->'employee'->>'name' from payroll_run_items where id=$1",
      [item],
    ),
    "employee Test",
  );
});

test("privacy exports include only this employee's payroll revisions and removed-item history", async () => {
  const run = await create(),
    item = await save(run);
  await save(run, { e: colleague, input: { ...base, bonus: 678.91 } });
  await approve(run);
  const document = await prepareDocument(item);
  const correction = await create({
    previous: run,
    reason: "Employee adjustment review",
  });
  const newItem = await scalar(
    "select id from payroll_run_items where run_id=$1 and employee_id=$2",
    [correction, employee],
  );
  await remove(correction, newItem);
  const request = await as(users.hr, () =>
    scalar(
      "select create_privacy_request($1,$2,'access','2026-02-01','2026-03-01','email','Payroll request',$3)",
      [org, employee, users.hr],
    ),
  );
  await as(users.hr, () =>
    db.query(
      "select update_privacy_request($1,$2,1,'in_review',$3,'Verified identity','2026-03-01','',null,'',null,'')",
      [org, request, users.hr],
    ),
  );
  const payload = await as(users.hr, () =>
    scalar(
      "select prepare_privacy_export($1,$2,2,'[]'::jsonb,'2026-01-01','2026-01-31',true)",
      [org, request],
    ),
  );
  assert.equal(payload.data.payroll_records.length, 1);
  assert.equal(payload.data.payroll_records[0].id, item);
  assert.deepEqual(payload.data.payroll_records[0].documents, [document]);
  assert.ok(
    payload.data.payroll_history.some(
      (event) => event.action === "item_removed",
    ),
  );
  const payroll = JSON.stringify([
    payload.data.payroll_records,
    payload.data.payroll_history,
  ]);
  for (const secret of [
    colleague,
    otherEmployee,
    users.hr,
    users.owner,
    '"source"',
    '"actor_id"',
    "678.91",
  ])
    assert.ok(!payroll.includes(secret), secret);
});

test("a full draft refuses a 201st employee without silently dropping any saved entries", async () => {
  const run = await create(),
    item = await save(run);
  // Populate trusted fixture rows directly; the checked RPC must still enforce its boundary.
  await db.query(
    `with people as (
    insert into employees(organisation_id,first_name,last_name,email,job_title,department,workplace,start_date,status)
    select $1,'Limit',n::text,'limit'||n||'@payroll.test','Engineer','Product','Office','2026-01-01','active'
    from generate_series(1,199) n returning id
  ) insert into payroll_run_items(organisation_id,run_id,employee_id,input,result,source,saved_by)
    select $1,$2,p.id,i.input,i.result,i.source,$3 from people p cross join payroll_run_items i where i.id=$4`,
    [org, run, users.owner, item],
  );
  await assert.rejects(() => save(run, { e: colleague }), { code: "P0012" });
  assert.equal(
    await scalar(
      "select count(*)::int from payroll_run_items where run_id=$1",
      [run],
    ),
    200,
  );
});

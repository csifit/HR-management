import { test, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { calculatePayroll } from "../src/lib/payroll.ts";
import { calculatePayrollRun } from "../src/lib/payroll-period.ts";
import {
  calculatePayrollEntry,
  payrollEntrySchema,
} from "../src/lib/payroll-settlement.ts";

let db,
  org,
  otherOrg,
  employee,
  contract,
  inTest = false;
const users = Object.fromEntries(
  ["owner", "other", "employee", "manager", "hr", "platform"].map((name, i) => [
    name,
    `a1000000-0000-4000-8000-00000000000${i + 1}`,
  ]),
);
const base = {
  month: "2026-01",
  basic: 10000,
  bonus: 0,
  hours: 8,
  meals: 0,
  advance: 0,
  floorException: "none",
  evidence: "",
  mealsReference: "",
  advanceReference: "",
  primary: "yes",
  dependants: 0,
  young: "no",
  children: 0,
  reduced: "no",
  standard: "on",
};
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
async function context({
  actor = users.hr,
  o = org,
  e = employee,
  month = "2026-01-01",
} = {}) {
  return as(actor, () =>
    scalar("select payroll_period_context($1,$2,$3)", [o, e, month]),
  );
}
async function input(patch = {}) {
  const c = await context();
  return {
    ...base,
    basic: c.basic,
    hours: c.hours,
    period: c.period,
    deductionEmployer: "this",
    deductionReference: "Employee declaration",
    ...patch,
  };
}
async function create(previous = null) {
  return as(users.hr, () =>
    scalar("select create_payroll_run($1,'2026-01-01',$2,$3)", [
      org,
      previous,
      previous ? "Accountant correction" : "",
    ]),
  );
}
async function version(run) {
  return scalar("select version from payroll_runs where id=$1", [run]);
}
async function save(
  run,
  value,
  { actor = users.hr, e = employee, v, reviewed = true } = {},
) {
  const expectedVersion = v ?? (await version(run));
  return as(actor, async () =>
    scalar("select save_payroll_item($1,$2,$3,$4,$5::jsonb,$6)", [
      org,
      run,
      expectedVersion,
      e,
      JSON.stringify(value),
      reviewed,
    ]),
  );
}
async function approve(run) {
  return as(users.hr, async () =>
    db.query("select approve_payroll_run($1,$2,$3,true)", [
      org,
      run,
      await version(run),
    ]),
  );
}
async function handover(run, historical = false) {
  return as(users.hr, async () =>
    scalar("select prepare_payroll_handover($1,$2,$3,'en',true,$4)", [
      org,
      run,
      await version(run),
      historical,
    ]),
  );
}
async function start(day) {
  await db.query("update employees set start_date=$1 where id=$2", [
    day,
    employee,
  ]);
}
async function terminate(day) {
  await db.query(
    "update employment_contracts set status='terminated',termination_date=$1 where id=$2",
    [day, contract],
  );
  await db.query("update employees set status='terminated' where id=$1", [
    employee,
  ]);
}
async function calculation(value) {
  return scalar("select private.calculate_payroll_saved($1::jsonb)", [
    JSON.stringify(value),
  ]);
}

const settlement = {
  days: 5.5,
  dailyGross: 250.25,
  balanceReference: "Final balance reviewed",
  rateReference: "Accountant approved rate",
  otherGross: 1000.25,
  otherReference: "Severance approval",
  confirmed: "on",
};
test("termination compensation and ordinary severance match JS/SQL with exact bani and separate components", async () => {
  await terminate("2026-01-16");
  assert.equal((await context()).settlement_allowed, true);
  const run = await create(),
    value = payrollEntrySchema.parse(
      await input({
        bonus: 100.25,
        settlement,
        advance: 100,
        advanceReference: "Advance already paid",
      }),
    );
  const item = await save(run, value),
    r = await scalar("select result from payroll_run_items where id=$1", [
      item,
    ]);
  assert.deepEqual(r, calculatePayrollEntry(value));
  assert.equal(r.settlement.unusedLeaveGross, 1376.38);
  assert.equal(r.cashGross, 7931.43); // Basic 5,454.55 + bonus 100.25 + settlement 2,376.63.
  assert.equal(r.payable, r.net - 100);
  await approve(run);
  const payload = await handover(run);
  assert.equal(payload.format_version, "HRConnector-accountant-v3");
  assert.deepEqual(payload.items[0].input, value);
  assert.deepEqual(payload.items[0].result, r);
  await db.query(
    "update leave_balances set allowance=allowance+1 where employee_id=$1",
    [employee],
  );
  await db.query(
    "update employment_contracts set termination_date='2026-01-19' where id=$1",
    [contract],
  );
  assert.deepEqual((await handover(run)).items[0].result, r);
});

test("settlement requires actual terminated status/date and rejects unresolved leave", async () => {
  const run = await create(),
    inputValue = await input({ settlement });
  assert.equal((await context()).settlement_allowed, false);
  await assert.rejects(
    () => save(run, { ...base, ...{ period: undefined }, settlement }),
    { code: "22023" },
  );
  await assert.rejects(() => save(run, inputValue), { code: "P0010" });
  await db.query(
    "update employment_contracts set termination_date='2026-01-31' where id=$1",
    [contract],
  );
  await assert.rejects(() => save(run, inputValue), { code: "P0010" });
  await terminate("2026-01-31");
  const type = await scalar(
    "select id from leave_types where organisation_id=$1 and category='annual'",
    [org],
  );
  await db.query(
    "insert into leave_balances(organisation_id,employee_id,leave_type_id,year,allowance) values($1,$2,$3,2026,21)",
    [org, employee, type],
  );
  await db.query(
    "insert into leave_requests(organisation_id,employee_id,leave_type_id,start_date,end_date,work_dates,submitted_by) values($1,$2,$3,'2026-01-15','2026-01-15',array['2026-01-15'::date],$4)",
    [org, employee, type, users.hr],
  );
  assert.equal((await context()).settlement_allowed, false);
  await assert.rejects(() => save(run, inputValue), { code: "P0010" });
  await db.query(
    "update leave_requests set status='cancelled' where employee_id=$1",
    [employee],
  );
  assert.equal((await context()).settlement_allowed, true);
  await save(run, inputValue);
});

test("leave balance and request changes require a fresh settlement save before approval", async () => {
  await terminate("2026-01-16");
  const type = await scalar(
    "select id from leave_types where organisation_id=$1 and category='annual'",
    [org],
  );
  await db.query(
    "insert into leave_balances(organisation_id,employee_id,leave_type_id,year,allowance) values($1,$2,$3,2026,21)",
    [org, employee, type],
  );
  const run = await create(),
    value = await input({ settlement });
  await save(run, value);
  await db.query(
    "update leave_balances set allowance=22 where employee_id=$1",
    [employee],
  );
  await assert.rejects(() => approve(run), { code: "P0010" });
  await save(run, value);
  await db.query(
    "insert into leave_requests(organisation_id,employee_id,leave_type_id,start_date,end_date,work_dates,submitted_by,status) values($1,$2,$3,'2025-12-15','2025-12-15',array['2025-12-15'::date],$4,'cancelled')",
    [org, employee, type, users.hr],
  );
  await assert.rejects(() => approve(run), { code: "P0010" });
  await save(run, value);
  await approve(run);
});

test("v5 parity covers part-time floors, vouchers, fractional balances and relief caps", async () => {
  const p = (await context()).period;
  for (const patch of [
    { basic: 2025, hours: 4 },
    {
      basic: 2025,
      hours: 4,
      floorException: "student",
      evidence: "Student certificate",
    },
    {
      basic: 4050,
      bonus: 0,
      settlement: {
        ...settlement,
        days: 0,
        dailyGross: 0,
        balanceReference: "",
        rateReference: "",
        otherGross: 50,
        otherReference: "Approval",
      },
    },
    {
      meals: 400.15,
      mealsReference: "Issued meal vouchers",
      young: "yes",
      children: 2,
    },
    { primary: "no", deductionEmployer: "other" },
    {
      settlement: {
        ...settlement,
        days: 0.01,
        dailyGross: 0.5,
        otherGross: 0,
        otherReference: "",
      },
    },
    {
      settlement: {
        ...settlement,
        days: 10.25,
        dailyGross: 316.78,
        otherGross: 0,
        otherReference: "",
      },
    },
  ]) {
    const value = payrollEntrySchema.parse({
      ...base,
      period: p,
      deductionEmployer: "this",
      deductionReference: "",
      settlement,
      ...patch,
    });
    assert.deepEqual(await calculation(value), calculatePayrollEntry(value));
  }
});

test("mixed v5/v3 handover uses v3 format and a correction preserves the original settlement", async () => {
  const run = await create();
  await terminate("2026-01-16");
  const originalValue = await input({ settlement }),
    id = await save(run, originalValue);
  const colleague = await scalar(
    "insert into employees(organisation_id,first_name,last_name,email,job_title,department,workplace,start_date,status) values($1,'Colleague','Person','colleague@period.test','Engineer','Product','Office','2026-01-01','active') returning id",
    [org],
  );
  await db.query(
    "insert into employment_contracts(organisation_id,employee_id,contract_number,start_date,job_title,cor_code,contract_type,working_hours,workplace,gross_salary,status) values($1,$2,'PART-2','2026-01-01','Engineer','251202','indefinite',8,'Office',10000,'active')",
    [org, colleague],
  );
  await save(run, base, { e: colleague });
  await approve(run);
  const original = await scalar(
    "select result from payroll_run_items where id=$1",
    [id],
  );
  assert.equal(
    (await handover(run)).format_version,
    "HRConnector-accountant-v3",
  );
  const correction = await create(run);
  await save(correction, {
    ...originalValue,
    settlement: { ...settlement, days: 6 },
  });
  await approve(correction);
  assert.deepEqual(
    (await handover(run, true)).items.find((i) => i.employee_id === employee)
      .result,
    original,
  );
  assert.equal((await handover(correction)).items[0].input.settlement.days, 6);
  await assert.rejects(() => save(run, originalValue), { code: "D0001" });
});

test("v5 malformed facts, components and version are rejected without export history", async () => {
  await terminate("2026-01-16");
  const run = await create(),
    value = await input({ settlement });
  for (const patch of [
    { days: -1 },
    { days: 366 },
    { dailyGross: 250.255 },
    { days: "5.5" },
    { confirmed: "" },
    { rateReference: "" },
    { otherReference: "" },
    { hidden: true },
  ])
    await assert.rejects(
      () => save(run, { ...value, settlement: { ...settlement, ...patch } }),
      { code: "22023" },
    );
  for (const actor of [
    users.other,
    users.employee,
    users.manager,
    users.platform,
  ])
    await assert.rejects(() => save(run, value, { actor }), { code: "42501" });
  await assert.rejects(() => save(run, value, { v: 99 }), { code: "P0006" });
  await save(run, value);
  await approve(run);
  for (const [path, newValue] of [
    ["{settlement,confirmed}", ""],
    ["{settlement,rateReference}", ""],
    ["{settlement}", null],
  ])
    await isolated(async () => {
      await db.query(
        "update payroll_run_items set input=jsonb_set(input,$1,$2::jsonb) where run_id=$3",
        [path, JSON.stringify(newValue), run],
      );
      const count = await scalar(
        "select count(*)::int from payroll_handover_exports",
      );
      await assert.rejects(() => handover(run), { code: "P0010" });
      assert.equal(
        await scalar("select count(*)::int from payroll_handover_exports"),
        count,
      );
    });
});

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
      `${name}@period.test`,
    ]);
  await db.query("insert into private.platform_admins(user_id) values($1)", [
    users.platform,
  ]);
  org = await as(users.owner, () =>
    scalar("select create_organisation('Period A','RO98001')"),
  );
  otherOrg = await as(users.other, () =>
    scalar("select create_organisation('Period B','RO98002')"),
  );
  await as(users.owner, async () => {
    employee = await scalar(
      "insert into employees(organisation_id,first_name,last_name,email,job_title,department,workplace,start_date,status) values($1,'Partial','Employee','employee@period.test','Engineer','Product','Office','2026-01-01','active') returning id",
      [org],
    );
    contract = await scalar(
      "insert into employment_contracts(organisation_id,employee_id,contract_number,start_date,job_title,cor_code,contract_type,working_hours,workplace,gross_salary,status) values($1,$2,'PART-1','2026-01-01','Engineer','251202','indefinite',8,'Office',10000,'active') returning id",
      [org, employee],
    );
    for (const [name, role, e] of [
      ["hr", "hr_manager", null],
      ["manager", "manager", null],
      ["employee", "employee", employee],
    ])
      await db.query("select set_organisation_member($1,$2,$3,$4)", [
        org,
        `${name}@period.test`,
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
after(async () => db?.close());

test("period uses inclusive employment boundaries and saved calendar exceptions", async () => {
  await start("2026-01-15");
  await db.query(
    "update employment_contracts set start_date='2026-01-16' where id=$1",
    [contract],
  );
  await terminate("2026-01-25");
  await as(users.hr, () =>
    db.query(
      "select save_calendar_day($1,'2026-01-19',false,'Company closure')",
      [org],
    ),
  );
  const c = await context();
  assert.deepEqual(c, {
    contract_id: contract,
    contract_number: "PART-1",
    basic: 10000,
    hours: 8,
    settlement_allowed: true,
    termination_date: "2026-01-25",
    period: {
      start: "2026-01-16",
      end: "2026-01-25",
      monthWorkingDays: 21,
      employedWorkingDays: 5,
      monthCalendarDays: 31,
      employedCalendarDays: 10,
    },
  });
  const value = await input({
    bonus: 100.25,
    meals: 100,
    mealsReference: "Benefit allocation",
    advance: 50,
    advanceReference: "Payment record",
  });
  const item = await save(await create(), value);
  const saved = await scalar(
    "select result from payroll_run_items where id=$1",
    [item],
  );
  assert.equal(saved.cashGross, 2481.2); // 10,000 * 5 / 21 = 2,380.95 earned basic.
  assert.equal(saved.contributionFloor, 893); // ROUND(3,750 * 5 / 21), whole lei.
  assert.equal(saved.meals, 100);
  assert.equal(saved.advance, 50);
  assert.deepEqual(saved, calculatePayrollRun(value));
});

test("fixed-term end and actual termination cap the period; an earlier ended contract does not overlap", async () => {
  await db.query(
    "update employment_contracts set contract_type='fixed_term',end_date='2026-01-23' where id=$1",
    [contract],
  );
  assert.equal((await context()).period.end, "2026-01-23");
  await terminate("2026-01-16");
  assert.equal((await context()).period.end, "2026-01-16");
  await db.query(
    "insert into employment_contracts(organisation_id,employee_id,contract_number,start_date,job_title,cor_code,contract_type,working_hours,workplace,gross_salary,status,termination_date) values($1,$2,'PREVIOUS','2025-01-01','Engineer','251202','indefinite',8,'Office',10000,'terminated','2025-12-31')",
    [org, employee],
  );
  assert.equal((await context()).contract_id, contract);
});

test("v4 full-month monetary results match v3, including minimum relief and part-time floors", async () => {
  const p = (await context()).period;
  for (const patch of [
    {},
    { basic: 4050 },
    { basic: 2025, hours: 4 },
    {
      basic: 5000,
      meals: 400,
      mealsReference: "Meal report",
      young: "yes",
      children: 2,
    },
  ]) {
    const legacy = { ...base, ...patch },
      v4 = {
        ...legacy,
        period: p,
        deductionEmployer: "this",
        deductionReference: "",
      };
    const actual = await calculation(v4),
      expected = calculatePayroll(legacy);
    assert.deepEqual(actual, { ...expected, rules: "RO-2026-monthly-v4" });
    assert.deepEqual(actual, calculatePayrollRun(v4));
  }
});

test("partial values match preview across pay, deductions and floor cases", async () => {
  await start("2026-01-16");
  const p = (await context()).period;
  for (const patch of [
    {},
    { basic: 5000, dependants: 4, young: "yes", children: 2 },
    { basic: 2025, hours: 4, dependants: 2 },
    {
      basic: 2025,
      hours: 4,
      floorException: "student",
      evidence: "Student certificate",
    },
    {
      basic: 4325,
      month: "2026-07",
      reduced: "yes",
      period: {
        start: "2026-07-16",
        end: "2026-07-31",
        monthWorkingDays: 23,
        employedWorkingDays: 12,
        monthCalendarDays: 31,
        employedCalendarDays: 16,
      },
    },
    { basic: 5000, deductionEmployer: "other", young: "yes", children: 2 },
    { basic: 10000, primary: "no", deductionEmployer: "other" },
  ]) {
    const value = {
      ...base,
      period: p,
      deductionEmployer: "this",
      deductionReference: "Employer declaration",
      ...patch,
    };
    assert.deepEqual(await calculation(value), calculatePayrollRun(value));
  }
  const atOther = await calculation(
    await input({
      basic: 5000,
      deductionEmployer: "other",
      young: "yes",
      children: 2,
    }),
  );
  assert.equal(
    atOther.personalDeduction +
      atOther.youngDeduction +
      atOther.childrenDeduction,
    0,
  );
});

test("partial minimum-wage relief fails closed with P0014, while other eligible payroll remains supported", async () => {
  await start("2026-01-16");
  await db.query(
    "update employment_contracts set gross_salary=4050 where id=$1",
    [contract],
  );
  const run = await create(),
    value = await input();
  await assert.rejects(() => save(run, value), { code: "P0014" });
  assert.equal(await scalar("select count(*)::int from payroll_run_items"), 0);
  await save(run, { ...value, reduced: "yes" });
});

test("server rejects forged period, missing declaration, changed salary and legacy partial requests", async () => {
  await start("2026-01-16");
  const run = await create(),
    value = await input();
  for (const [patch, code] of [
    [
      {
        period: {
          ...value.period,
          employedWorkingDays: value.period.employedWorkingDays - 1,
        },
      },
      "P0010",
    ],
    [
      {
        period: {
          ...value.period,
          start: "2026-01-15",
          employedCalendarDays: 17,
        },
      },
      "P0010",
    ],
    [{ period: { ...value.period, monthWorkingDays: 30 } }, "22023"],
    [{ period: { ...value.period, end: "2026-02-01" } }, "22023"],
    [{ period: { ...value.period, end: "2026-01-32" } }, "22023"],
    [{ period: { ...value.period, hidden: 1 } }, "22023"],
    [{ deductionReference: "" }, "22023"],
    [{ deductionEmployer: "other", deductionReference: "" }, "22023"],
    [{ primary: "no" }, "22023"],
    [{ basic: 10001 }, "P0010"],
    [{ hours: 4 }, "P0010"],
  ])
    await assert.rejects(() => save(run, { ...value, ...patch }), { code });
  await assert.rejects(() => save(run, base), { code: "P0010" });
  assert.equal(await scalar("select count(*)::int from payroll_run_items"), 0);
  await save(run, value);
});

test("unsupported status, ambiguous contracts, empty periods and nonstandard schedules fail closed", async () => {
  for (const mutate of [
    () =>
      db.query("update employees set status='suspended' where id=$1", [
        employee,
      ]),
    () =>
      db.query(
        "update employment_contracts set status='suspended' where id=$1",
        [contract],
      ),
    () =>
      db.query(
        "update employment_contracts set status='terminated' where id=$1",
        [contract],
      ),
    () =>
      db.query("update employees set status='terminated' where id=$1", [
        employee,
      ]),
    () => start("2026-02-01"),
    async () => {
      await start("2026-01-31");
    },
    () =>
      db.query(
        "insert into employment_contracts(organisation_id,employee_id,contract_number,start_date,job_title,cor_code,contract_type,working_hours,workplace,gross_salary,status) values($1,$2,'SECOND','2026-01-20','Engineer','251202','indefinite',8,'Office',10000,'active')",
        [org, employee],
      ),
    () =>
      db.query(
        "insert into work_schedules(organisation_id,employee_id,effective_from,weekdays,updated_by) values($1,$2,'2026-01-01',array[1,2,3,4],$3)",
        [org, employee, users.hr],
      ),
    () =>
      as(users.hr, () =>
        db.query(
          "select save_calendar_day($1,'2026-01-17',true,'Working weekend')",
          [org],
        ),
      ),
  ])
    await isolated(async () => {
      await mutate();
      await assert.rejects(() => context(), { code: "P0010" });
    });
});

test("manual hours and approved leave inside period reject save, positive work outside also rejects", async () => {
  await start("2026-01-16");
  for (const [day, planned, worked, absence] of [
    ["2026-01-16", 8, 0, "none"],
    ["2026-01-16", 8, 9, "none"],
    ["2026-01-16", 4, 4, "none"],
    ["2026-01-16", 8, 0, "unpaid"],
    ["2026-01-15", 8, 8, "none"],
  ])
    await isolated(async () => {
      await db.query(
        "insert into attendance(organisation_id,employee_id,day,planned_hours,worked_hours,absence,updated_by) values($1,$2,$3,$4,$5,$6,$7)",
        [org, employee, day, planned, worked, absence, users.hr],
      );
      await assert.rejects(() => context(), { code: "P0010" });
    });
  await as(users.hr, () =>
    db.query("select save_attendance($1,$2,'2026-01-16',8,8,'none',null)", [
      org,
      employee,
    ]),
  );
  await context();
  const type = await scalar(
    "select id from leave_types where organisation_id=$1 and category='medical'",
    [org],
  );
  const leave = await as(users.hr, () =>
    scalar("select request_leave($1,$2,$3,'2026-01-19','2026-01-19')", [
      org,
      employee,
      type,
    ]),
  );
  await as(users.owner, () =>
    db.query("select decide_leave($1,$2,1,'approved','Reviewed')", [
      org,
      leave,
    ]),
  );
  await assert.rejects(() => context(), { code: "P0010" });
});

test("period context and save enforce tenant, roles, MFA, organisation status and exact run version", async () => {
  const run = await create(),
    value = await input();
  for (const actor of [
    users.other,
    users.employee,
    users.manager,
    users.platform,
  ]) {
    await assert.rejects(() => context({ actor }), { code: "42501" });
    await assert.rejects(() => save(run, value, { actor }), { code: "42501" });
  }
  await assert.rejects(() => context({ actor: users.other, o: otherOrg }), {
    code: "42501",
  });
  await assert.rejects(() => context({ month: "2026-01-16" }), {
    code: "22023",
  });
  await assert.rejects(() => save(run, value, { v: 99 }), { code: "P0006" });
  await assert.rejects(() => save(run, value, { reviewed: false }), {
    code: "22023",
  });
  await assert.rejects(
    () =>
      as(users.hr, async () => {
        await db.exec("set role anon");
        await db.query("select payroll_period_context($1,$2,'2026-01-01')", [
          org,
          employee,
        ]);
      }),
    { code: "42501" },
  );
  for (const status of ["suspended", "blocked"])
    await isolated(async () => {
      await db.query(
        "update organisations set status=$1,status_reason='Access test' where id=$2",
        [status, org],
      );
      await assert.rejects(() => context());
    });
  await db.query(
    "insert into auth.mfa_factors(user_id,status) values($1,'verified')",
    [users.hr],
  );
  await assert.rejects(() => context());
  await db.exec(
    `select set_config('request.jwt.claims','{"aal":"aal2"}',false)`,
  );
  await context();
  await save(run, value);
});

test("date, calendar, contract and stable source changes require re-saving before approval", async () => {
  await start("2026-01-16");
  for (const mutate of [
    () => start("2026-01-19"),
    () => terminate("2026-01-28"),
    () =>
      db.query(
        "update employment_contracts set gross_salary=11000 where id=$1",
        [contract],
      ),
    () =>
      db.query("update organisations set name='New company name' where id=$1", [
        org,
      ]),
    () =>
      as(users.hr, () =>
        db.query(
          "select save_calendar_day($1,'2026-01-19',false,'Company closure')",
          [org],
        ),
      ),
    () =>
      as(users.hr, () =>
        db.query("select save_attendance($1,$2,'2026-01-16',8,8,'none',null)", [
          org,
          employee,
        ]),
      ),
  ])
    await isolated(async () => {
      const run = await create();
      await save(run, await input());
      await mutate();
      await assert.rejects(() => approve(run), { code: "P0010" });
      await save(run, await input());
      await approve(run);
    });
});

test("legacy requests remain v3, approved snapshots stay immutable and v4 corrections use v2 handover", async () => {
  const run = await create(),
    originalItem = await save(run, base);
  await approve(run);
  const original = await scalar(
    "select row_to_json(i)::jsonb from payroll_run_items i where id=$1",
    [originalItem],
  );
  assert.equal(original.result.rules, "RO-2026-monthly-v3");
  assert.equal(
    (await handover(run)).format_version,
    "HRConnector-accountant-v1",
  );
  const correction = await create(run);
  await terminate("2026-01-16");
  const value = await input();
  await save(correction, value);
  await approve(correction);
  const payload = await handover(correction);
  assert.equal(payload.format_version, "HRConnector-accountant-v2");
  assert.deepEqual(payload.items[0].input, value);
  assert.deepEqual(payload.items[0].result, calculatePayrollRun(value));
  assert.equal(
    await scalar(
      "select format_version from payroll_handover_exports where id=$1",
      [payload.export_id],
    ),
    "HRConnector-accountant-v2",
  );
  assert.deepEqual(
    await scalar(
      "select row_to_json(i)::jsonb from payroll_run_items i where id=$1",
      [originalItem],
    ),
    original,
  );
  assert.equal(
    (await handover(run, true)).format_version,
    "HRConnector-accountant-v1",
  );
  await assert.rejects(() => save(run, base), { code: "D0001" });
  await db.query(
    "update organisations set name='Changed after approval' where id=$1",
    [org],
  );
  assert.equal((await handover(correction)).company.name, "Period A");
});

test("mixed v3 and v4 handovers identify v2 and reject malformed saved period without creating history", async () => {
  const run = await create();
  await save(run, await input());
  const colleague = await scalar(
    "insert into employees(organisation_id,first_name,last_name,email,job_title,department,workplace,start_date,status) values($1,'Second','Person','second@period.test','Engineer','Product','Office','2026-01-01','active') returning id",
    [org],
  );
  await db.query(
    "insert into employment_contracts(organisation_id,employee_id,contract_number,start_date,job_title,cor_code,contract_type,working_hours,workplace,gross_salary,status) values($1,$2,'PART-2','2026-01-01','Engineer','251202','indefinite',8,'Office',10000,'active')",
    [org, colleague],
  );
  await save(run, base, { e: colleague });
  await approve(run);
  const payload = await handover(run);
  assert.equal(payload.format_version, "HRConnector-accountant-v2");
  assert.deepEqual(
    payload.items.find((i) => i.employee_id === colleague).input,
    base,
  );
  for (const [path, value] of [
    ["{period,start}", "2026-01-32"],
    ["{period,monthWorkingDays}", 0],
    ["{deductionEmployer}", "unknown"],
    ["{deductionReference}", null],
  ])
    await isolated(async () => {
      await db.query(
        "update payroll_run_items set input=jsonb_set(input,$1,$2::jsonb) where run_id=$3 and employee_id=$4",
        [path, JSON.stringify(value), run, employee],
      );
      const count = await scalar(
        "select count(*)::int from payroll_handover_exports",
      );
      await assert.rejects(() => handover(run), { code: "P0010" });
      assert.equal(
        await scalar("select count(*)::int from payroll_handover_exports"),
        count,
      );
    });
});

import { test, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  benefitSchema,
  enrolmentSchema,
  reviewBenefitSchema,
  prepareBenefitsSchema,
} from "../src/lib/benefit-validation.ts";
import { benefitsProvider } from "../src/lib/benefit-providers.ts";
let db,
  org,
  otherOrg,
  employee,
  otherEmployee,
  provider,
  otherProvider,
  contract,
  inTest = false;
const users = {
  owner: "30000000-0000-4000-8000-000000000001",
  other: "30000000-0000-4000-8000-000000000002",
  manager: "30000000-0000-4000-8000-000000000003",
  employee: "30000000-0000-4000-8000-000000000004",
  platform: "30000000-0000-4000-8000-000000000005",
};
const benefits = {},
  enrolments = {};
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
async function prepare(month = "2026-07-01", version = null) {
  return as(users.owner, () =>
    scalar("select public.prepare_benefit_month($1,$2,$3)", [
      org,
      month,
      version,
    ]),
  );
}
async function items(run) {
  return (
    await db.query(
      "select * from public.benefit_run_items where run_id=$1 order by model",
      [run],
    )
  ).rows;
}
async function runVersion(run) {
  return scalar("select version from public.benefit_runs where id=$1", [run]);
}
async function review(
  item,
  amount = item.final_amount,
  included = item.included,
) {
  return as(users.owner, () =>
    db.query(
      "select public.review_benefit_item($1,$2,$3,$4,$5,'Reviewed for test')",
      [org, item.id, item.version, included, amount],
    ),
  );
}
async function reviewAll(run, amounts = {}) {
  for (const i of await items(run))
    await review(i, amounts[i.model] ?? i.final_amount);
}
async function approve(run, version) {
  return as(users.owner, async () =>
    db.query("select public.approve_benefit_month($1,$2,$3)", [
      org,
      run,
      version ?? (await runVersion(run)),
    ]),
  );
}
before(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create schema auth;grant usage on schema auth to authenticated,anon;
  create table auth.users(id uuid primary key,email text unique,raw_user_meta_data jsonb default '{}',email_confirmed_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant execute on function auth.uid() to authenticated,anon;`);
  await db.exec(
    await readFile(new URL("storage-fixture.sql", import.meta.url), "utf8"),
  );
  await db.exec(
    await readFile(new URL("mfa-fixture.sql", import.meta.url), "utf8"),
  );
  const folder = new URL("../supabase/migrations/", import.meta.url);
  for (const f of (await readdir(folder))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(await readFile(new URL(f, folder), "utf8"));
  for (const [name, id] of Object.entries(users))
    await db.query("insert into auth.users(id,email) values($1,$2)", [
      id,
      `${name}@benefit.test`,
    ]);
  await db.query("insert into private.platform_admins(user_id) values($1)", [
    users.platform,
  ]);
  org = await as(users.owner, () =>
    scalar("select public.create_organisation('Benefits A','RO92001')"),
  );
  otherOrg = await as(users.other, () =>
    scalar("select public.create_organisation('Benefits B','RO92002')"),
  );
  const createEmployee = (o, email) =>
    scalar(
      "insert into public.employees(organisation_id,first_name,last_name,email,job_title,department,workplace,start_date,status) values($1,'Test','Benefits',$2,'Engineer','Product','Office','2026-01-01','active') returning id",
      [o, email],
    );
  await as(users.owner, async () => {
    employee = await createEmployee(org, "employee@benefit.test");
    await db.query(
      "select public.set_organisation_member($1,'employee@benefit.test','employee',$2)",
      [org, employee],
    );
    await db.query(
      "select public.set_organisation_member($1,'manager@benefit.test','manager',null)",
      [org],
    );
    await db.query(
      "update public.employees set manager_user_id=$1 where id=$2",
      [users.manager, employee],
    );
    contract = await scalar(
      "insert into public.employment_contracts(organisation_id,employee_id,contract_number,start_date,job_title,cor_code,workplace,gross_salary,status) values($1,$2,'BEN-1','2026-01-01','Engineer','251202','Office',10000,'active') returning id",
      [org, employee],
    );
    provider = await scalar(
      "select public.save_benefit_provider($1,null,null,'Test provider','pluxee',true)",
      [org],
    );
    for (const [model, amount] of Object.entries({
      fixed_monthly: 150,
      per_worked_day: 45,
      annual_allowance: 1200,
      flexible_budget: 600,
      non_financial: 0,
    })) {
      benefits[model] = await scalar(
        "select public.save_benefit($1,null,null,$2,$3::text,$3::text::public.benefit_model,$4,true)",
        [org, provider, model, amount],
      );
      enrolments[model] = await scalar(
        "select public.save_employee_benefit($1,null,null,$2,$3,'2026-01-01',null,true)",
        [org, employee, benefits[model]],
      );
    }
    await db.query(
      "select public.save_attendance($1,$2,'2026-07-02',8,8,'none',null)",
      [org, employee],
    );
    await db.query(
      "select public.save_attendance($1,$2,'2026-07-03',8,7.5,'none',null)",
      [org, employee],
    );
  });
  await as(users.other, async () => {
    otherEmployee = await createEmployee(otherOrg, "other@benefit.test");
    otherProvider = await scalar(
      "select public.save_benefit_provider($1,null,null,'Other provider','custom',true)",
      [otherOrg],
    );
  });
});
beforeEach(async () => {
  await db.exec("begin");
  inTest = true;
});
afterEach(async () => {
  await db.exec("rollback");
  await db.exec("reset role");
  inTest = false;
});
after(async () => db.close());

test("per-day benefits use recurring schedules and preserve manual work on otherwise non-working days", async () => {
  // Historical fixture; the public schedule RPC permits only today/future changes.
  await db.query(
    "insert into work_schedules(organisation_id,effective_from,weekdays,updated_by) values($1,'2026-07-01',array[1,2,3,4],$2)",
    [org, users.owner],
  );
  const run = await prepare();
  const daily = async () =>
    (await items(run)).find((i) => i.model === "per_worked_day");
  // The shared fixture already contains manual Friday work on July 3.
  assert.equal(Number((await daily()).worked_days), 19);
  assert.equal(Number((await daily()).suggested_amount), 855);
  await as(users.owner, () =>
    db.query("select save_attendance($1,$2,'2026-07-10',0,4,'none',null)", [
      org,
      employee,
    ]),
  );
  await prepare("2026-07-01", await runVersion(run));
  assert.equal(Number((await daily()).worked_days), 20);
  assert.equal(Number((await daily()).suggested_amount), 900);
  await db.query(
    "insert into work_schedules(organisation_id,employee_id,effective_from,weekdays,updated_by) values($1,$2,'2026-07-01',array[1,2,3,4,5,6],$3)",
    [org, employee, users.owner],
  );
  await prepare("2026-07-01", await runVersion(run));
  assert.equal(Number((await daily()).worked_days), 27);
  assert.equal(Number((await daily()).suggested_amount), 1215);
});

test("all five benefit models include automatic elapsed days and require exception review before approval", async () => {
  const run = await prepare();
  const rows = await items(run);
  assert.equal(rows.length, 5);
  assert.equal(
    Number(rows.find((i) => i.model === "per_worked_day").suggested_amount),
    1035,
  );
  assert.equal(
    Number(rows.find((i) => i.model === "fixed_monthly").suggested_amount),
    150,
  );
  assert.equal(
    Number(rows.find((i) => i.model === "annual_allowance").suggested_amount),
    0,
  );
  assert.equal(
    Number(rows.find((i) => i.model === "flexible_budget").suggested_amount),
    0,
  );
  const summary = await as(users.owner, () =>
    scalar("select public.benefit_month_summary($1,$2)", [org, run]),
  );
  assert.equal(summary.employees, 1);
  assert.equal(summary.worked_days, 23);
  assert.ok(rows.every((i) => i.flags.includes("automatic_attendance")));
  assert.equal(summary.unreviewed, 5);
  await assert.rejects(approve(run), { code: "B0003" });
  await reviewAll(run, { annual_allowance: 100, flexible_budget: 200 });
  await approve(run);
  const approved = await items(run);
  await assert.rejects(review(approved[0]), { code: "B0001" });
  await assert.rejects(prepare("2026-07-01", await runVersion(run)), {
    code: "B0001",
  });
  assert.equal(
    Number(
      await as(users.employee, () =>
        scalar("select count(*) from public.benefit_run_items"),
      ),
    ),
    5,
  );
  assert.equal(
    Number(
      await as(users.employee, () =>
        scalar("select count(*) from public.benefit_runs"),
      ),
    ),
    0,
  );
  await as(users.owner, () =>
    db.query(
      "select public.save_benefit($1,$2,1,$3,'New name','per_worked_day',55,true)",
      [org, benefits.per_worked_day, provider],
    ),
  );
  assert.equal(
    Number(
      (await items(run)).find((i) => i.model === "per_worked_day").unit_amount,
    ),
    45,
  );
  await as(users.owner, () =>
    db.query(
      "select public.save_attendance($1,$2,'2026-07-06',8,8,'none',null)",
      [org, employee],
    ),
  );
  assert.equal(
    (
      await as(users.owner, () =>
        scalar("select public.benefit_month_summary($1,$2)", [org, run]),
      )
    ).worked_days,
    23,
  );
  assert.equal(
    Number(
      await scalar(
        "select count(*) from public.audit_log where entity_id=$1 and action='benefit.month_approved'",
        [run],
      ),
    ),
    1,
  );
});
test("changed attendance invalidates draft approval, regeneration discards reviews and stale versions fail", async () => {
  const run = await prepare();
  await reviewAll(run);
  const oldVersion = await runVersion(run);
  await as(users.owner, () =>
    db.query("select public.save_attendance($1,$2,'2026-07-03',8,8,'none',1)", [
      org,
      employee,
    ]),
  );
  await assert.rejects(approve(run), { code: "B0002" });
  await prepare("2026-07-01", oldVersion);
  assert.equal(
    (await items(run)).every((i) => i.review_note === null),
    true,
  );
  await assert.rejects(approve(run, oldVersion), { code: "P0006" });
  await reviewAll(run);
  await approve(run);
});
test("annual and flexible budget limits hold across months and concurrent drafts", async () => {
  const july = await prepare();
  const august = await prepare("2026-08-01");
  await reviewAll(july, { annual_allowance: 1000, flexible_budget: 600 });
  await reviewAll(august, { annual_allowance: 1000 });
  const flex = (await items(july)).find((i) => i.model === "flexible_budget");
  await assert.rejects(review(flex, 601), { code: "B0004" });
  await approve(july);
  await assert.rejects(approve(august), { code: "B0002" });
  await prepare("2026-08-01", await runVersion(august));
  const annual = (await items(august)).find(
    (i) => i.model === "annual_allowance",
  );
  assert.equal(Number(annual.annual_used), 1000);
  await assert.rejects(review(annual, 201), { code: "B0004" });
  await reviewAll(august, { annual_allowance: 200 });
  await approve(august);
  assert.equal(
    Number(
      await scalar(
        "select sum(final_amount) from public.benefit_run_items where model='annual_allowance'",
      ),
    ),
    1200,
  );
});
test("mid-month dates retain the fixed amount for review and disabled employment defaults to exclusion", async () => {
  await as(users.owner, () =>
    db.query(
      "select public.save_employee_benefit($1,$2,1,$3,$4,'2026-07-15','2026-07-20',true)",
      [org, enrolments.fixed_monthly, employee, benefits.fixed_monthly],
    ),
  );
  const run = await prepare();
  const fixed = (await items(run)).find((i) => i.model === "fixed_monthly");
  assert.equal(Number(fixed.suggested_amount), 150);
  assert.ok(fixed.flags.includes("partial_month"));
  await as(users.owner, () =>
    db.query("update public.employees set status='suspended' where id=$1", [
      employee,
    ]),
  );
  await prepare("2026-07-01", await runVersion(run));
  assert.ok(
    (await items(run)).every(
      (i) =>
        !i.included &&
        i.flags.includes("employee_status") &&
        Number(i.final_amount) === 0,
    ),
  );
});
test("approved full-month leave produces zero worked-day amounts and an absence exception", async () => {
  await db.query("delete from public.attendance where employee_id=$1", [
    employee,
  ]);
  await as(users.owner, async () => {
    const medical = await scalar(
      "select id from public.leave_types where organisation_id=$1 and category='medical'",
      [org],
    );
    const request = await scalar(
      "select public.request_leave($1,$2,$3,'2026-07-01','2026-07-31')",
      [org, employee, medical],
    );
    await db.query("select public.decide_leave($1,$2,1,'approved','')", [
      org,
      request,
    ]);
  });
  const run = await prepare();
  const row = (await items(run)).find((i) => i.model === "per_worked_day");
  assert.equal(Number(row.suggested_amount), 0);
  assert.equal(row.missing_days, 0);
  assert.ok(row.flags.includes("full_absence"));
});
test("drafts and staff benefit amounts stay private, and every mutation and foreign key is tenant scoped", async () => {
  const run = await prepare();
  for (const user of [
    users.employee,
    users.manager,
    users.other,
    users.platform,
  ]) {
    assert.equal(
      Number(
        await as(user, () =>
          scalar("select count(*) from public.benefit_run_items"),
        ),
      ),
      0,
    );
    await assert.rejects(
      as(user, () =>
        scalar("select public.prepare_benefit_month($1,'2026-08-01',null)", [
          org,
        ]),
      ),
      { code: "42501" },
    );
    await assert.rejects(
      as(user, () =>
        scalar("select public.benefit_month_summary($1,$2)", [org, run]),
      ),
      { code: "42501" },
    );
  }
  assert.equal(
    Number(
      await as(users.manager, () =>
        scalar("select count(*) from public.employee_benefits"),
      ),
    ),
    0,
  );
  assert.equal(
    Number(
      await as(users.employee, () =>
        scalar("select count(*) from public.employee_benefits"),
      ),
    ),
    5,
  );
  assert.equal(
    Number(
      await as(users.manager, () =>
        scalar("select count(*) from public.benefits"),
      ),
    ),
    0,
  );
  await assert.rejects(
    as(users.owner, () =>
      db.query("update public.benefit_runs set status='approved' where id=$1", [
        run,
      ]),
    ),
    { code: "42501" },
  );
  await assert.rejects(
    as(users.owner, () =>
      db.query(
        "select public.save_benefit($1,null,null,$2,'Cross tenant','fixed_monthly',100,true)",
        [org, otherProvider],
      ),
    ),
    { code: "23503" },
  );
  await assert.rejects(
    as(users.owner, () =>
      db.query(
        "select public.save_employee_benefit($1,null,null,$2,$3,'2026-01-01',null,true)",
        [otherOrg, otherEmployee, benefits.fixed_monthly],
      ),
    ),
    { code: "42501" },
  );
  await assert.rejects(
    as(users.owner, () =>
      db.query("select private.benefit_sources($1,$2)", [org, "2026-07-01"]),
    ),
    { code: "42501" },
  );
  await db.exec("savepoint anon_check;set role anon");
  try {
    await assert.rejects(
      db.query("select public.prepare_benefit_month($1,'2026-07-01',null)", [
        org,
      ]),
      { code: "42501" },
    );
  } finally {
    await db.exec("rollback to savepoint anon_check;reset role");
  }
});
test("suspension retains reads but prevents writes; blocking hides benefit records and aggregates", async () => {
  const run = await prepare();
  await reviewAll(run);
  await approve(run);
  async function change(status) {
    const v = await scalar(
      "select version from public.organisations where id=$1",
      [org],
    );
    return as(users.platform, () =>
      db.query(
        "select public.platform_set_organisation_status($1,$2,$3,'Benefits access test')",
        [org, v, status],
      ),
    );
  }
  await change("suspended");
  assert.equal(
    Number(
      await as(users.employee, () =>
        scalar("select count(*) from public.benefit_run_items"),
      ),
    ),
    5,
  );
  await assert.rejects(prepare("2026-08-01"), { code: "P0004" });
  await change("blocked");
  for (const table of [
    "benefit_providers",
    "benefits",
    "employee_benefits",
    "benefit_runs",
    "benefit_run_items",
  ])
    assert.equal(
      Number(
        await as(users.owner, () =>
          scalar(`select count(*) from public.${table}`),
        ),
      ),
      0,
    );
  await assert.rejects(
    as(users.owner, () =>
      scalar("select public.benefit_month_summary($1,$2)", [org, run]),
    ),
    { code: "42501" },
  );
  await change("active");
  assert.equal(
    Number(
      await as(users.employee, () =>
        scalar("select count(*) from public.benefit_run_items"),
      ),
    ),
    5,
  );
});
test("salary-only edits do not alter preparation, while contract status changes require a new draft", async () => {
  const run = await prepare();
  await reviewAll(run);
  await as(users.owner, () =>
    db.query(
      "update public.employment_contracts set gross_salary=12000 where id=$1",
      [contract],
    ),
  );
  await approve(run);
  const next = await prepare("2026-08-01");
  await reviewAll(next);
  await as(users.owner, () =>
    db.query(
      "update public.employment_contracts set status='suspended' where id=$1",
      [contract],
    ),
  );
  await assert.rejects(approve(next), { code: "B0002" });
  await prepare("2026-08-01", await runVersion(next));
  assert.ok(
    (await items(next)).every(
      (i) => i.flags.includes("contract_status") && !i.included,
    ),
  );
});
test("benefit inputs reject invalid dates/precision and provider adapters never report a successful connection", async () => {
  const base = {
    id: "",
    version: "",
    provider_id: users.owner,
    name: "Test benefit",
    model: "fixed_monthly",
    amount: "150",
    active: "true",
  };
  assert.equal(benefitSchema.safeParse(base).success, true);
  assert.equal(benefitSchema.safeParse({ ...base, amount: "" }).success, false);
  assert.equal(
    benefitSchema.safeParse({ ...base, amount: "1.001" }).success,
    false,
  );
  assert.equal(
    benefitSchema.safeParse({ ...base, model: "non_financial" }).success,
    false,
  );
  assert.equal(
    enrolmentSchema.safeParse({
      id: "",
      version: "",
      employee_id: users.employee,
      benefit_id: users.owner,
      starts_on: "2026-02-30",
      ends_on: "",
      active: "true",
    }).success,
    false,
  );
  assert.equal(
    reviewBenefitSchema.safeParse({
      id: users.employee,
      version: "1",
      included: "true",
      amount: "0",
      note: "ok",
    }).success,
    false,
  );
  assert.equal(
    prepareBenefitsSchema.safeParse({
      month: "2026-07-01",
      version: "",
      confirm: "on",
    }).success,
    true,
  );
  for (const key of ["pluxee", "edenred", "up_romania", "custom"]) {
    assert.equal(benefitsProvider(key).status().connected, false);
    await assert.rejects(benefitsProvider(key).submit(), /not implemented/);
  }
});

test("live benefits smoke script passes and removes all temporary fixtures", async () => {
  const beforeUsers = await scalar("select count(*) from auth.users");
  const beforeOrgs = await scalar("select count(*) from public.organisations");
  const beforeAudit = await scalar("select count(*) from public.audit_log");
  // The test already has a transaction, so use a savepoint for the same rollback boundary.
  const sql = (
    await readFile(
      new URL("./live-benefits-smoke.sql", import.meta.url),
      "utf8",
    )
  )
    .replace(/^begin;$/m, "savepoint smoke;")
    .replace(
      /^rollback;$/m,
      "rollback to savepoint smoke;release savepoint smoke;",
    );
  await db.exec(sql);
  assert.equal(await scalar("select count(*) from auth.users"), beforeUsers);
  assert.equal(
    await scalar("select count(*) from public.organisations"),
    beforeOrgs,
  );
  assert.equal(
    await scalar("select count(*) from public.audit_log"),
    beforeAudit,
  );
});

import { test, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { workScheduleSchema } from "../src/lib/time-validation.ts";
let db, org, employee;
const users = Object.fromEntries(
  ["owner", "invitee", "other", "hr", "platform", "manager"].map((key, i) => [
    key,
    `50000000-0000-4000-8000-00000000000${i + 1}`,
  ]),
);
async function scalar(sql, args = []) {
  return Object.values((await db.query(sql, args)).rows[0])[0];
}
async function as(user, fn) {
  await db.exec("savepoint actor;set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  try {
    return await fn();
  } catch (e) {
    await db.exec("rollback to savepoint actor");
    throw e;
  } finally {
    await db.exec("reset role;release savepoint actor");
  }
}
before(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create schema auth;grant usage on schema auth to authenticated,anon;
 create table auth.users(id uuid primary key,email text unique,raw_user_meta_data jsonb default '{}',email_confirmed_at timestamptz default now());
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant execute on function auth.uid() to authenticated,anon;`);
  for (const f of ["storage-fixture.sql", "mfa-fixture.sql"])
    await db.exec(await readFile(new URL(f, import.meta.url), "utf8"));
  const dir = new URL("../supabase/migrations/", import.meta.url);
  for (const f of (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort())
    await db.exec(await readFile(new URL(f, dir), "utf8"));
  for (const [name, id] of Object.entries(users))
    await db.query("insert into auth.users(id,email) values($1,$2)", [
      id,
      `${name}@schedules.test`,
    ]);
  await db.query("insert into private.platform_admins(user_id) values($1)", [
    users.platform,
  ]);
  await db.exec("begin");
  org = await as(users.owner, () =>
    scalar("select create_organisation('Schedules A','RO999901')"),
  );
  await as(users.other, () =>
    scalar("select create_organisation('Schedules B','RO999902')"),
  );
  await as(users.owner, () =>
    db.query(
      "select set_organisation_member($1,'hr@schedules.test','hr_manager',null)",
      [org],
    ),
  );
  employee = await as(users.owner, () =>
    scalar(
      "insert into employees(organisation_id,first_name,last_name,email,job_title,department,workplace,start_date,status) values($1,'Invited','Employee','invitee@schedules.test','Developer','IT','Office','2026-01-01','active') returning id",
      [org],
    ),
  );
  await as(users.owner, () =>
    scalar(
      "insert into employment_contracts(organisation_id,employee_id,contract_number,start_date,job_title,cor_code,workplace,gross_salary,working_hours,status) values($1,$2,'C1','2026-01-01','Developer','251202','Office',5000,4,'active') returning id",
      [org, employee],
    ),
  );
  await db.exec("commit");
});
beforeEach(() => db.exec("begin"));
afterEach(() => db.exec("rollback"));
after(() => db.close());
async function invitation() {
  return scalar(
    "select id from employee_invitations where employee_id=$1 and status='pending'",
    [employee],
  );
}
async function month(value = "2026-07-01", actor = users.owner) {
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
    planned_hours: Number(r.planned_hours),
    worked_hours: r.worked_hours === null ? null : Number(r.worked_hours),
    day:
      r.day instanceof Date
        ? r.day.toISOString().slice(0, 10)
        : r.day.slice(0, 10),
  }));
}

async function saveSchedule(
  days,
  person = null,
  from = "2100-01-01",
  version = null,
  actor = users.owner,
) {
  return as(actor, () =>
    db.query("select save_work_schedule($1,$2,$3,$4,$5)", [
      org,
      person,
      from,
      days,
      version,
    ]),
  );
}
async function request(start = "2100-01-04", end = "2100-01-10") {
  return as(users.owner, async () =>
    scalar("select request_leave($1,$2,$3,$4,$5)", [
      org,
      employee,
      await scalar(
        "select id from leave_types where organisation_id=$1 and category='medical'",
        [org],
      ),
      start,
      end,
    ]),
  );
}

test("organisation weekdays and employee overrides apply by effective date, with an explicit return to inheritance", async () => {
  await saveSchedule([1, 2, 3, 4]);
  let rows = await month("2100-01-01");
  assert.equal(rows.find((r) => r.day === "2100-01-04").planned_hours, 4);
  assert.equal(rows.find((r) => r.day === "2100-01-08").planned_hours, 0);
  assert.equal(rows.find((r) => r.day === "2100-01-09").planned_hours, 0);
  assert.equal(
    (await month("2099-12-01")).find((r) => r.day === "2099-12-04")
      .planned_hours,
    4,
  );
  await saveSchedule([1, 2, 3, 4, 5, 6], employee);
  rows = await month("2100-01-01");
  assert.equal(rows.find((r) => r.day === "2100-01-09").planned_hours, 4);
  assert.equal(rows.find((r) => r.day === "2100-01-10").planned_hours, 0);
  await saveSchedule(null, employee, "2100-01-11");
  assert.equal(
    (await month("2100-01-01")).find((r) => r.day === "2100-01-15")
      .planned_hours,
    0,
  );
  await saveSchedule([1, 2, 3, 4, 5], null, "2100-01-18");
  rows = await month("2100-01-01");
  assert.equal(rows.find((r) => r.day === "2100-01-15").planned_hours, 0);
  assert.equal(rows.find((r) => r.day === "2100-01-22").planned_hours, 4);
});

test("requests count each employee's scheduled days; conflicting changes roll back without changing saved leave", async () => {
  await saveSchedule([1, 2, 3, 4]);
  const id = await request();
  assert.equal(
    await scalar("select days from leave_requests where id=$1", [id]),
    4,
  );
  await assert.rejects(saveSchedule([1, 2, 3, 4, 5], null, "2100-01-01", 1), {
    code: "L0002",
  });
  assert.deepEqual(
    await scalar(
      "select weekdays from work_schedules where employee_id is null",
    ),
    [1, 2, 3, 4],
  );
  assert.equal(
    await scalar(
      "select version from work_schedules where employee_id is null",
    ),
    1,
  );
  await assert.rejects(saveSchedule([1, 2, 3], employee), { code: "L0002" });
  await as(users.hr, () =>
    db.query("select decide_leave($1,$2,1,'approved','Reviewed')", [org, id]),
  );
  await assert.rejects(saveSchedule([1, 2, 3], employee), { code: "L0002" });
  await as(users.hr, () =>
    db.query("select decide_leave($1,$2,2,'cancelled','Schedule correction')", [
      org,
      id,
    ]),
  );
  await saveSchedule([1, 2, 3, 4, 5, 6], employee);
  const next = await request();
  assert.equal(
    await scalar("select days from leave_requests where id=$1", [next]),
    6,
  );
});

test("organisation changes respect personal schedules and calendar exceptions without false leave conflicts", async () => {
  await saveSchedule([1, 2, 3, 4], employee);
  await request();
  await saveSchedule([1, 2, 3, 4, 5, 6]);
  await assert.rejects(saveSchedule(null, employee, "2100-01-01", 1), {
    code: "L0002",
  });
  // Friday is off for this employee even though it is on for the organisation.
  await assert.rejects(
    as(users.hr, () =>
      db.query(
        "select save_calendar_day($1,'2100-01-08',true,'Working Friday')",
        [org],
      ),
    ),
    { code: "L0002" },
  );
  await as(users.hr, () =>
    db.query(
      "select save_calendar_day($1,'2100-01-08',false,'Company closure')",
      [org],
    ),
  );
  // Removing Friday from the organisation is neutral because the closure already wins.
  await saveSchedule([1, 2, 3, 4, 6], null, "2100-01-01", 1);
});

test("historical schedules drive automatic hours and approved leave, and manual corrections always win", async () => {
  // Historical fixture only: the public RPC deliberately refuses backdated schedules.
  await db.query(
    "insert into work_schedules(organisation_id,employee_id,effective_from,weekdays,updated_by) values($1,$2,'2026-07-01',array[1,2,3,4,6],$3)",
    [org, employee, users.owner],
  );
  let rows = await month();
  assert.equal(rows.find((r) => r.day === "2026-07-03").worked_hours, null);
  assert.equal(rows.find((r) => r.day === "2026-07-04").worked_hours, 4);
  assert.equal(rows.find((r) => r.day === "2026-07-04").recorded, true);
  const id = await request("2026-07-11", "2026-07-11");
  await as(users.hr, () =>
    db.query("select decide_leave($1,$2,1,'approved','Reviewed')", [org, id]),
  );
  await as(users.hr, () =>
    db.query("select save_attendance($1,$2,'2026-07-04',4,0,'other',null)", [
      org,
      employee,
    ]),
  );
  await as(users.hr, () =>
    db.query(
      "select save_calendar_day($1,'2026-07-18',false,'Company closure')",
      [org],
    ),
  );
  rows = await month();
  assert.equal(rows.find((r) => r.day === "2026-07-04").worked_hours, 0);
  assert.equal(rows.find((r) => r.day === "2026-07-04").category, "other");
  assert.equal(rows.find((r) => r.day === "2026-07-11").worked_hours, 0);
  assert.equal(rows.find((r) => r.day === "2026-07-11").leave_request_id, id);
  assert.equal(rows.find((r) => r.day === "2026-07-18").worked_hours, null);
});

test("schedules reject historical edits, stale writes, malformed weekdays and foreign employees", async () => {
  await assert.rejects(saveSchedule([1], null, "2000-01-01"), {
    code: "S0001",
  });
  for (const weekdays of [[], [0], [8], [1, 1], [1, null], null])
    await assert.rejects(saveSchedule(weekdays), { code: "22023" });
  await assert.rejects(saveSchedule([1], users.other), { code: "P0005" });
  await saveSchedule([5, 4, 3, 2, 1]);
  assert.deepEqual(
    await scalar("select weekdays from work_schedules"),
    [1, 2, 3, 4, 5],
  );
  await assert.rejects(saveSchedule([1, 2]), { code: "P0006" });
  await saveSchedule([1, 2, 3, 4], null, "2100-01-01", 1, users.hr);
  await assert.rejects(saveSchedule([1, 2, 3], null, "2100-01-01", 1), {
    code: "P0006",
  });
  assert.equal(
    await scalar(
      "select count(*)::int from audit_log where action='calendar.schedule_updated'",
    ),
    2,
  );
});

test("employee schedule reads are personal, writes are HR-only, and foreign/platform access cannot bypass RLS", async () => {
  await as(users.owner, () =>
    db.query(
      "select set_organisation_member($1,'manager@schedules.test','manager',null)",
      [org],
    ),
  );
  await assert.rejects(
    saveSchedule([1, 2], employee, "2100-02-01", null, users.manager),
    { code: "42501" },
  );
  const inviteId = await invitation();
  await as(users.invitee, () =>
    scalar("select accept_employee_invitation($1)", [inviteId]),
  );
  const colleague = await as(users.owner, () =>
    scalar(
      "insert into employees(organisation_id,first_name,last_name,email,job_title,department,workplace,start_date,status) values($1,'Other','Employee','colleague@schedules.test','Developer','IT','Office','2026-01-01','active') returning id",
      [org],
    ),
  );
  await saveSchedule([1, 2, 3, 4, 5]);
  await saveSchedule([1, 2, 3, 4], employee);
  await saveSchedule([2, 3, 4, 5], colleague);
  const visible = await as(users.invitee, () =>
    db.query(
      "select employee_id from work_schedules order by employee_id nulls first",
    ),
  );
  assert.deepEqual(
    visible.rows.map((r) => r.employee_id),
    [null, employee],
  );
  for (const actor of [users.invitee, users.other, users.platform]) {
    await assert.rejects(
      saveSchedule([1, 2], employee, "2100-02-01", null, actor),
      { code: "42501" },
    );
    if (actor !== users.invitee)
      assert.equal(
        await as(actor, () =>
          scalar("select count(*)::int from work_schedules"),
        ),
        0,
      );
  }
  await assert.rejects(
    as(users.owner, () =>
      db.query(
        "update work_schedules set weekdays=array[1] where organisation_id=$1",
        [org],
      ),
    ),
    { code: "42501" },
  );
  await assert.rejects(
    as(users.invitee, () =>
      db.query("select * from attendance_month($1,$2,'2100-01-01')", [
        org,
        colleague,
      ]),
    ),
    { code: "42501" },
  );
});

test("suspension preserves schedule reads but denies edits, while blocking hides schedules and MFA remains enforced", async () => {
  await saveSchedule([1, 2, 3, 4]);
  await as(users.platform, () =>
    db.query(
      "select platform_set_organisation_status($1,1,'suspended','Schedule test')",
      [org],
    ),
  );
  assert.equal(
    await as(users.hr, () =>
      scalar("select count(*)::int from work_schedules"),
    ),
    1,
  );
  await assert.rejects(saveSchedule([1, 2, 3], null, "2100-01-01", 1), {
    code: "P0004",
  });
  await as(users.platform, () =>
    db.query(
      "select platform_set_organisation_status($1,2,'blocked','Schedule test')",
      [org],
    ),
  );
  assert.equal(
    await as(users.owner, () =>
      scalar("select count(*)::int from work_schedules"),
    ),
    0,
  );
  await as(users.platform, () =>
    db.query(
      "select platform_set_organisation_status($1,3,'active','Schedule test')",
      [org],
    ),
  );
  await db.query(
    "insert into auth.mfa_factors(id,user_id,status,factor_type) values(gen_random_uuid(),$1,'verified','totp')",
    [users.owner],
  );
  assert.equal(
    await as(users.owner, () =>
      scalar("select count(*)::int from work_schedules"),
    ),
    0,
  );
  await assert.rejects(saveSchedule([1, 2, 3], null, "2100-01-01", 1), {
    code: "42501",
  });
});

test("payroll permits standard schedules only and checks the entire requested month", async () => {
  const standard = () =>
    as(users.hr, () =>
      scalar("select payroll_standard_schedule($1,$2,'2100-01-01')", [
        org,
        employee,
      ]),
    );
  assert.equal(await standard(), true);
  await saveSchedule([1, 2, 3, 4], employee, "2100-01-15");
  assert.equal(await standard(), false);
  await saveSchedule(null, employee, "2100-01-15", 1);
  assert.equal(await standard(), true);
  await saveSchedule([1, 2, 3, 4]);
  assert.equal(await standard(), false);
  await saveSchedule([1, 2, 3, 4, 5], employee, "2100-01-01");
  assert.equal(await standard(), false); // Inherits the four-day week from Jan 15.
  await saveSchedule([1, 2, 3, 4, 5], employee, "2100-01-15", 2);
  assert.equal(await standard(), true);
});

test("schedule form validation requires weekdays, rejects duplicates and permits employee inheritance only", () => {
  const base = {
    employee_id: "",
    effective_from: "2100-01-01",
    mode: "custom",
    weekdays: "1,2,3,4",
    version: "",
  };
  assert.equal(workScheduleSchema.safeParse(base).success, true);
  for (const weekdays of ["", "1,1", "0", "8", "1,NaN"])
    assert.equal(
      workScheduleSchema.safeParse({ ...base, weekdays }).success,
      false,
    );
  assert.equal(
    workScheduleSchema.safeParse({ ...base, mode: "inherit", weekdays: "" })
      .success,
    false,
  );
  assert.equal(
    workScheduleSchema.safeParse({
      ...base,
      employee_id: users.invitee,
      mode: "inherit",
      weekdays: "",
    }).success,
    true,
  );
});

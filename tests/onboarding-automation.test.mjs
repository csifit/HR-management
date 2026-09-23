import { test, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
let db, org, employee, contract;
const users = Object.fromEntries(
  ["owner", "invitee", "other", "hr", "platform"].map((key, i) => [
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
      `${name}@automation.test`,
    ]);
  await db.query("insert into private.platform_admins(user_id) values($1)", [
    users.platform,
  ]);
  await db.exec("begin");
  org = await as(users.owner, () =>
    scalar("select create_organisation('Automation A','RO999901')"),
  );
  await as(users.other, () =>
    scalar("select create_organisation('Automation B','RO999902')"),
  );
  await as(users.owner, () =>
    db.query(
      "select set_organisation_member($1,'hr@automation.test','hr_manager',null)",
      [org],
    ),
  );
  employee = await as(users.owner, () =>
    scalar(
      "insert into employees(organisation_id,first_name,last_name,email,job_title,department,workplace,start_date,status) values($1,'Invited','Employee','invitee@automation.test','Developer','IT','Office','2026-01-01','active') returning id",
      [org],
    ),
  );
  contract = await as(users.owner, () =>
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
    day:
      r.day instanceof Date
        ? r.day.toISOString().slice(0, 10)
        : r.day.slice(0, 10),
  }));
}
test("employee invitation is single-use, recipient-bound, confirmed-email only, and cannot grant HR access", async () => {
  const id = await invitation();
  assert.equal(
    (
      await as(users.invitee, () =>
        db.query("select * from my_employee_invitations()"),
      )
    ).rows.length,
    1,
  );
  await assert.rejects(
    as(users.other, () =>
      scalar("select accept_employee_invitation($1)", [id]),
    ),
    { code: "42501" },
  );
  await db.query("update auth.users set email_confirmed_at=null where id=$1", [
    users.invitee,
  ]);
  await assert.rejects(
    as(users.invitee, () =>
      scalar("select accept_employee_invitation($1)", [id]),
    ),
    { code: "42501" },
  );
  await db.query("update auth.users set email_confirmed_at=now() where id=$1", [
    users.invitee,
  ]);
  assert.equal(
    await as(users.invitee, () =>
      scalar("select accept_employee_invitation($1)", [id]),
    ),
    org,
  );
  assert.equal(
    await scalar(
      "select role from organisation_users where organisation_id=$1 and user_id=$2",
      [org, users.invitee],
    ),
    "employee",
  );
  assert.equal(
    await scalar("select user_id from employees where id=$1", [employee]),
    users.invitee,
  );
  await assert.rejects(
    as(users.invitee, () =>
      scalar("select accept_employee_invitation($1)", [id]),
    ),
    { code: "42501" },
  );
  assert.equal(
    (
      await as(users.invitee, () =>
        db.query(
          "update employees set first_name='Hacked' where id=$1 returning id",
          [employee],
        ),
      )
    ).rows.length,
    0,
  );
});
test("invitation attempts are reserved, tenant scoped, expire and revoke when employee email changes", async () => {
  for (const actor of [users.invitee, users.other, users.platform])
    await assert.rejects(
      as(actor, () =>
        scalar("select prepare_employee_invitation($1,$2,false)", [
          org,
          employee,
        ]),
      ),
      { code: "42501" },
    );
  const result = await as(users.hr, () =>
    scalar("select to_jsonb(prepare_employee_invitation($1,$2,false))", [
      org,
      employee,
    ]),
  );
  assert.equal(result.delivery_status, "sending");
  await assert.rejects(
    as(users.hr, () =>
      scalar("select prepare_employee_invitation($1,$2,false)", [
        org,
        employee,
      ]),
    ),
    { code: "I0001" },
  );
  await assert.rejects(
    as(users.owner, () =>
      db.query("select finish_employee_invitation($1,$2,1,'accepted')", [
        org,
        result.id,
      ]),
    ),
    { code: "P0006" },
  );
  await as(users.hr, () =>
    db.query("select finish_employee_invitation($1,$2,1,'failed')", [
      org,
      result.id,
    ]),
  );
  await db.query(
    "update employee_invitations set expires_at=now()-interval '1 second' where id=$1",
    [result.id],
  );
  await assert.rejects(
    as(users.invitee, () =>
      scalar("select accept_employee_invitation($1)", [result.id]),
    ),
    { code: "42501" },
  );
  await as(users.owner, () =>
    db.query(
      "update employees set email='changed@automation.test' where id=$1",
      [employee],
    ),
  );
  assert.equal(
    await scalar("select status from employee_invitations where id=$1", [
      result.id,
    ]),
    "revoked",
  );
});
test("invitation acceptance respects MFA, active organisations, existing roles and offboarding", async () => {
  const id = await invitation();
  await db.query(
    "insert into auth.mfa_factors(user_id,status) values($1,'verified')",
    [users.invitee],
  );
  await assert.rejects(
    as(users.invitee, () =>
      scalar("select accept_employee_invitation($1)", [id]),
    ),
    { code: "42501" },
  );
  await db.query("delete from auth.mfa_factors where user_id=$1", [
    users.invitee,
  ]);
  await as(users.owner, () =>
    scalar("select create_lifecycle_case($1,$2,'offboarding','2026-09-30')", [
      org,
      employee,
    ]),
  );
  await assert.rejects(
    as(users.invitee, () =>
      scalar("select accept_employee_invitation($1)", [id]),
    ),
    { code: "I0002" },
  );
  await db.query(
    "update lifecycle_cases set status='cancelled' where employee_id=$1",
    [employee],
  );
  await as(users.owner, () =>
    db.query(
      "select set_organisation_member($1,'invitee@automation.test','hr_manager',null)",
      [org],
    ),
  );
  await assert.rejects(
    as(users.invitee, () =>
      scalar("select accept_employee_invitation($1)", [id]),
    ),
    { code: "I0002" },
  );
  await db.query("update organisations set status='suspended' where id=$1", [
    org,
  ]);
  await assert.rejects(
    as(users.invitee, () =>
      scalar("select accept_employee_invitation($1)", [id]),
    ),
    { code: "42501" },
  );
});
test("automatic hours follow contract, calendar, approved leave and manual overrides without future work", async () => {
  let rows = await month();
  assert.equal(
    Number(rows.find((r) => r.day === "2026-07-01").worked_hours),
    4,
  );
  assert.equal(rows.find((r) => r.day === "2026-07-01").category, "automatic");
  assert.equal(rows.find((r) => r.day === "2026-07-04").worked_hours, null);
  await as(users.owner, () =>
    db.query("select save_calendar_day($1,'2026-07-03',false,'Holiday')", [
      org,
    ]),
  );
  assert.equal(
    (await month()).find((r) => r.day === "2026-07-03").worked_hours,
    null,
  );
  await as(users.hr, () =>
    db.query("select save_attendance($1,$2,'2026-07-02',4,2,'none',null)", [
      org,
      employee,
    ]),
  );
  const type = await scalar(
    "select id from leave_types where organisation_id=$1 and category='medical'",
    [org],
  );
  const leave = await as(users.owner, () =>
    scalar("select request_leave($1,$2,$3,'2026-07-06','2026-07-06')", [
      org,
      employee,
      type,
    ]),
  );
  await as(users.hr, () =>
    db.query("select decide_leave($1,$2,1,'approved','Reviewed')", [
      org,
      leave,
    ]),
  );
  rows = await month();
  assert.equal(
    Number(rows.find((r) => r.day === "2026-07-06").worked_hours),
    0,
  );
  assert.equal(rows.find((r) => r.day === "2026-07-06").category, "medical");
  assert.equal(
    Number(rows.find((r) => r.day === "2026-07-02").worked_hours),
    2,
  );
  await as(users.hr, () =>
    db.query("select decide_leave($1,$2,2,'cancelled','Cancelled for test')", [
      org,
      leave,
    ]),
  );
  assert.equal(
    Number((await month()).find((r) => r.day === "2026-07-06").worked_hours),
    4,
  );
  assert.ok((await month("2200-12-01")).every((r) => r.worked_hours === null));
  const today = await scalar(
    "select (now() at time zone 'Europe/Bucharest')::date::text",
  );
  assert.equal(
    (await month(today.slice(0, 7) + "-01")).find((r) => r.day === today)
      .worked_hours,
    null,
  );
  await assert.rejects(month("2026-07-01", users.other), { code: "42501" });
});
test("ambiguous and inactive contracts never create automatic worked hours", async () => {
  await as(users.owner, () =>
    db.query(
      "insert into employment_contracts(organisation_id,employee_id,contract_number,start_date,job_title,cor_code,workplace,gross_salary,working_hours,status) values($1,$2,'C2','2026-07-15','Developer','251202','Office',5000,6,'active')",
      [org, employee],
    ),
  );
  let rows = await month();
  assert.equal(
    Number(rows.find((r) => r.day === "2026-07-14").worked_hours),
    4,
  );
  assert.equal(rows.find((r) => r.day === "2026-07-15").worked_hours, null);
  await as(users.owner, () =>
    db.query(
      "update employment_contracts set status='suspended' where employee_id=$1",
      [employee],
    ),
  );
  assert.ok((await month()).every((r) => r.worked_hours === null));
});
test("contract review is HR-only, tenant scoped and becomes stale after every contract edit", async () => {
  for (const actor of [users.invitee, users.other, users.platform])
    await assert.rejects(
      as(actor, () =>
        db.query("select review_contract_for_reges($1,$2,1)", [org, contract]),
      ),
      { code: "42501" },
    );
  await as(users.hr, () =>
    db.query("select review_contract_for_reges($1,$2,1)", [org, contract]),
  );
  await as(users.owner, () =>
    db.query("update employment_contracts set gross_salary=6000 where id=$1", [
      contract,
    ]),
  );
  assert.equal(
    await scalar(
      "select review_version from employment_contracts where id=$1",
      [contract],
    ),
    2,
  );
  assert.equal(
    await scalar(
      "select contract_version from contract_reviews where contract_id=$1",
      [contract],
    ),
    1,
  );
  await assert.rejects(
    as(users.hr, () =>
      db.query("select review_contract_for_reges($1,$2,1)", [org, contract]),
    ),
    { code: "P0006" },
  );
  await as(users.hr, () =>
    db.query("select review_contract_for_reges($1,$2,2)", [org, contract]),
  );
  await assert.rejects(
    as(users.hr, () =>
      db.query("update contract_reviews set contract_version=3"),
    ),
    { code: "42501" },
  );
  assert.equal(
    await as(users.other, () =>
      scalar("select count(*) from contract_reviews"),
    ),
    0,
  );
});

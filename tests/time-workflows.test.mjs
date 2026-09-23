import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  leaveRequestSchema,
  attendanceSchema,
  timeDate,
} from "../src/lib/time-validation.ts";
import { attendanceTotals, monthDays } from "../src/lib/time.ts";
let db,
  org,
  otherOrg,
  employee,
  unassigned,
  ownerEmployee,
  otherEmployee,
  annual,
  medical,
  otherType;
const users = {
  owner: "20000000-0000-4000-8000-000000000001",
  other: "20000000-0000-4000-8000-000000000002",
  manager: "20000000-0000-4000-8000-000000000003",
  employee: "20000000-0000-4000-8000-000000000004",
  platform: "20000000-0000-4000-8000-000000000005",
};
async function scalar(sql, args = []) {
  return Object.values((await db.query(sql, args)).rows[0])[0];
}
async function as(user, fn) {
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
async function request(type, start, end = start, person = employee) {
  return scalar("select public.request_leave($1,$2,$3,$4,$5)", [
    org,
    person,
    type,
    start,
    end,
  ]);
}
async function decide(id, status, version = 1, note = "Reviewed for test") {
  return db.query("select public.decide_leave($1,$2,$3,$4,$5)", [
    org,
    id,
    version,
    status,
    note,
  ]);
}
async function allowance(days, person = employee) {
  return as(users.owner, () =>
    db.query("select public.save_leave_allowance($1,$2,$3,2026,$4)", [
      org,
      person,
      annual,
      days,
    ]),
  );
}
async function attendance(
  person,
  day,
  planned,
  worked,
  absence = "none",
  version = null,
) {
  return db.query("select public.save_attendance($1,$2,$3,$4,$5,$6,$7)", [
    org,
    person,
    day,
    planned,
    worked,
    absence,
    version,
  ]);
}
async function status(value) {
  const version = await scalar(
    "select version from public.organisations where id=$1",
    [org],
  );
  await as(users.platform, () =>
    db.query(
      "select public.platform_set_organisation_status($1,$2,$3,'Test restriction')",
      [org, version, value],
    ),
  );
}
before(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create schema auth;grant usage on schema auth to authenticated,anon;
    create table auth.users(id uuid primary key,email text unique,raw_user_meta_data jsonb default '{}',email_confirmed_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant execute on function auth.uid() to authenticated,anon;`);
  await db.exec(
    await readFile(new URL("storage-fixture.sql", import.meta.url), "utf8"),
  );
  await db.exec(
    await readFile(new URL("mfa-fixture.sql", import.meta.url), "utf8"),
  );
  const migrations = new URL("../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(migrations))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(await readFile(new URL(file, migrations), "utf8"));
  for (const [name, id] of Object.entries(users))
    await db.query("insert into auth.users(id,email) values($1,$2)", [
      id,
      `${name}@time.test`,
    ]);
  await db.query("insert into private.platform_admins(user_id) values($1)", [
    users.platform,
  ]);
  org = await as(users.owner, () =>
    scalar("select public.create_organisation('Time A','RO91001')"),
  );
  otherOrg = await as(users.other, () =>
    scalar("select public.create_organisation('Time B','RO91002')"),
  );
  async function create(o, name) {
    return scalar(
      "insert into public.employees(organisation_id,first_name,last_name,email,job_title,department,workplace,start_date,status) values($1,$2,'Test',$3,'Engineer','Product','Office','2026-01-01','active') returning id",
      [o, name, `${name}@time.test`],
    );
  }
  await as(users.owner, async () => {
    employee = await create(org, "employee");
    unassigned = await create(org, "unassigned");
    ownerEmployee = await create(org, "owner");
    await db.query(
      "select public.set_organisation_member($1,'employee@time.test','employee',$2)",
      [org, employee],
    );
    await db.query(
      "select public.set_organisation_member($1,'manager@time.test','manager',null)",
      [org],
    );
    await db.query(
      "select public.set_organisation_member($1,'owner@time.test','organisation_owner',$2)",
      [org, ownerEmployee],
    );
    await db.query(
      "update public.employees set manager_user_id=$1 where organisation_id=$2 and id in ($3,$4)",
      [users.manager, org, employee, ownerEmployee],
    );
    annual = await scalar(
      "select id from public.leave_types where organisation_id=$1 and category='annual'",
      [org],
    );
    medical = await scalar(
      "select id from public.leave_types where organisation_id=$1 and category='medical'",
      [org],
    );
    await db.query(
      "select public.save_calendar_day($1,'2026-09-22',false,'Company closure')",
      [org],
    );
  });
  await as(users.other, async () => {
    otherEmployee = await create(otherOrg, "other");
    otherType = await scalar(
      "select id from public.leave_types where organisation_id=$1 and category='annual'",
      [otherOrg],
    );
  });
  await allowance(20);
  await allowance(20, ownerEmployee);
});
after(async () => {
  await db?.close();
});

test("leave reserves workdays, approvals flow to attendance, HR cancellation releases the balance", async () => {
  const id = await as(users.employee, () =>
    request(annual, "2026-09-21", "2026-09-25"),
  );
  await as(users.employee, async () => {
    const balance = (
      await db.query("select * from public.leave_balance_summary($1,$2,2026)", [
        org,
        employee,
      ])
    ).rows[0];
    assert.equal(Number(balance.pending), 4);
    assert.equal(Number(balance.available), 16);
    assert.equal(Number(balance.used), 0);
    await assert.rejects(request(medical, "2026-09-21"), /Overlapping/);
    await assert.rejects(decide(id, "approved"), /Approver access/);
  });
  await as(users.manager, () => decide(id, "approved"));
  await as(users.employee, async () => {
    const rows = (
      await db.query(
        "select * from public.attendance_month($1,$2,'2026-09-01')",
        [org, employee],
      )
    ).rows;
    assert.equal(
      rows.find((r) => new Date(r.day).toISOString().startsWith("2026-09-21"))
        .category,
      "annual",
    );
    const closure = rows.find((r) =>
      new Date(r.day).toISOString().startsWith("2026-09-22"),
    );
    assert.equal(Number(closure.planned_hours), 0);
    assert.equal(closure.worked_hours, null);
    assert.equal(rows.filter((r) => r.category === "annual").length, 4);
    await assert.rejects(decide(id, "cancelled", 2), /Cancellation access/);
  });
  await as(users.owner, async () => {
    await assert.rejects(
      attendance(employee, "2026-09-21", 8, 8),
      /Approved leave/,
    );
    await assert.rejects(
      db.query(
        "select public.save_calendar_day($1,'2026-09-21',false,'New holiday')",
        [org],
      ),
      /Calendar date used/,
    );
    await decide(id, "cancelled", 2);
    assert.equal(
      Number(
        await scalar(
          "select available from public.leave_balance_summary($1,$2,2026)",
          [org, employee],
        ),
      ),
      20,
    );
    const events = (
      await db.query(
        "select action,metadata from public.audit_log where entity_id=$1 order by created_at",
        [id],
      )
    ).rows;
    assert.deepEqual(
      events.map((e) => e.action),
      ["leave.requested", "leave.approved", "leave.cancelled"],
    );
    assert.ok(!JSON.stringify(events).includes("Reviewed for test"));
  });
});

test("balances enforce pending reservations, missing allowances and reject stale or closed decisions", async () => {
  await allowance(3);
  await as(users.employee, () =>
    assert.rejects(request(annual, "2026-10-05", "2026-10-09"), /Insufficient/),
  );
  await as(users.owner, () =>
    assert.rejects(
      request(annual, "2026-10-05", "2026-10-09", unassigned),
      /Allowance not configured/,
    ),
  );
  await allowance(5);
  const id = await as(users.employee, () =>
    request(annual, "2026-10-05", "2026-10-09"),
  );
  await assert.rejects(allowance(4), /below reserved/);
  await as(users.manager, async () => {
    await assert.rejects(decide(id, "approved", 99), /Record changed/);
    await decide(id, "rejected");
    await assert.rejects(decide(id, "approved", 2), /already closed/);
  });
  await allowance(20);
});

test("owners cannot self-approve and managers cannot decide requests outside their assigned staff", async () => {
  const own = await as(users.owner, () =>
    request(medical, "2026-10-12", "2026-10-12", ownerEmployee),
  );
  await as(users.owner, () =>
    assert.rejects(decide(own, "approved"), /no self approval/),
  );
  await as(users.manager, () => decide(own, "approved"));
  const unrelated = await as(users.owner, () =>
    request(medical, "2026-10-13", "2026-10-13", unassigned),
  );
  await as(users.manager, () =>
    assert.rejects(decide(unrelated, "approved"), /Approver access/),
  );
  await as(users.employee, () =>
    assert.rejects(
      request(medical, "2026-10-14", "2026-10-14", unassigned),
      /Employee or HR access/,
    ),
  );
  await as(users.owner, () => decide(unrelated, "rejected"));
});

test("attendance requires HR or assigned manager, detects stale edits and conflicts with approval", async () => {
  await as(users.manager, async () => {
    await attendance(employee, "2026-09-28", 8, 7.5);
    await assert.rejects(
      attendance(employee, "2026-09-28", 8, 8),
      /Record changed/,
    );
    await assert.rejects(
      attendance(unassigned, "2026-09-28", 8, 8),
      /assigned manager/,
    );
  });
  await as(users.employee, () =>
    assert.rejects(
      attendance(employee, "2026-09-29", 8, 8),
      /assigned manager/,
    ),
  );
  const leave = await as(users.employee, () => request(medical, "2026-09-28"));
  await as(users.owner, async () => {
    await assert.rejects(decide(leave, "approved"), /Attendance conflicts/);
    await attendance(employee, "2026-09-28", 8, 0, "none", 1);
    await decide(leave, "approved");
    await decide(leave, "cancelled", 2);
    await assert.rejects(
      attendance(employee, "2026-09-29", 8, 25),
      /check constraint/,
    );
    await assert.rejects(
      attendance(employee, "2026-09-29", 8, 4, "medical"),
      /check constraint/,
    );
    await assert.rejects(attendance(employee, "2025-12-31", 8, 8), /predates/);
  });
});

test("all new tables and RPCs retain tenant isolation and deny raw writes and platform HR bypass", async () => {
  await as(users.employee, async () => {
    assert.equal(
      Number(
        await scalar(
          "select count(*) from public.leave_types where organisation_id=$1",
          [otherOrg],
        ),
      ),
      0,
    );
    await assert.rejects(
      db.query("select public.attendance_month($1,$2,'2026-09-01')", [
        otherOrg,
        otherEmployee,
      ]),
      /access required/,
    );
    await assert.rejects(request(otherType, "2026-10-20"), /Record not found/);
    for (const table of [
      "leave_types",
      "leave_balances",
      "work_calendar_days",
      "leave_requests",
      "attendance",
    ])
      await assert.rejects(
        db.query(`delete from public.${table}`),
        /permission denied/,
      );
    await assert.rejects(
      db.query("update public.leave_requests set status='approved'"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select public.save_leave_allowance($1,$2,$3,2026,99)", [
        org,
        employee,
        annual,
      ]),
      /HR access/,
    );
  });
  await as(users.platform, async () => {
    assert.equal(
      Number(await scalar("select count(*) from public.leave_requests")),
      0,
    );
    assert.equal(
      Number(await scalar("select count(*) from public.attendance")),
      0,
    );
    await assert.rejects(request(medical, "2026-10-21"), /Organisation access/);
  });
  await db.exec("set role anon");
  try {
    await assert.rejects(
      db.query("select public.attendance_month($1,$2,'2026-09-01')", [
        org,
        employee,
      ]),
      /permission denied/,
    );
  } finally {
    await db.exec("reset role");
  }
});

test("suspended tenants retain reads only; blocking hides leave, balances, calendars and attendance", async () => {
  await status("suspended");
  try {
    await as(users.employee, async () => {
      assert.ok(
        Number(await scalar("select count(*) from public.leave_requests")) > 0,
      );
      await assert.rejects(request(medical, "2026-11-02"), /not active/);
    });
    await as(users.owner, async () => {
      await assert.rejects(
        attendance(employee, "2026-11-02", 8, 8),
        /not active/,
      );
      await assert.rejects(
        db.query(
          "select public.save_calendar_day($1,'2026-11-02',false,'Closure')",
          [org],
        ),
        /not active/,
      );
    });
    await status("blocked");
    await as(users.owner, async () => {
      for (const table of [
        "leave_types",
        "leave_balances",
        "work_calendar_days",
        "leave_requests",
        "attendance",
      ])
        assert.equal(
          Number(await scalar(`select count(*) from public.${table}`)),
          0,
        );
      await assert.rejects(
        db.query("select public.attendance_month($1,$2,'2026-09-01')", [
          org,
          employee,
        ]),
        /access required/,
      );
      assert.equal(
        (
          await db.query(
            "select * from public.leave_balance_summary($1,$2,2026)",
            [org, employee],
          )
        ).rows.length,
        0,
      );
      assert.equal(
        Number(
          await scalar(
            "select sum(approved+pending) from public.leave_calendar($1,'2026-09-01',null)",
            [org],
          ),
        ),
        0,
      );
    });
  } finally {
    await status("active");
  }
});

test("calendar exceptions, archived types and invalid ranges cannot silently change leave", async () => {
  await as(users.employee, async () => {
    await assert.rejects(
      request(medical, "2026-09-26", "2026-09-27"),
      /No working days/,
    );
    await assert.rejects(
      request(medical, "2026-12-31", "2027-01-02"),
      /one calendar year/,
    );
  });
  await as(users.owner, async () => {
    await db.query(
      "select public.save_calendar_day($1,'2026-09-26',true,'Working Saturday')",
      [org],
    );
    const id = await request(medical, "2026-09-26");
    assert.equal(
      Number(
        await scalar("select days from public.leave_requests where id=$1", [
          id,
        ]),
      ),
      1,
    );
    await db.query(
      "select public.save_leave_type($1,$2,'Medical','other',true,false)",
      [org, medical],
    );
    assert.equal(
      await scalar("select category from public.leave_types where id=$1", [
        medical,
      ]),
      "medical",
    );
    await assert.rejects(request(medical, "2026-11-03"), /Record not found/);
    await decide(id, "approved");
    assert.equal(
      Number(
        await scalar(
          "select approved from public.leave_calendar($1,'2026-09-01',$2) where day='2026-09-26'",
          [org, employee],
        ),
      ),
      1,
    );
  });
});

test("date validation and attendance totals distinguish unrecorded days from zero work", () => {
  assert.equal(timeDate.safeParse("2026-02-30").success, false);
  assert.equal(monthDays("2028-02").length, 29);
  assert.equal(
    leaveRequestSchema.safeParse({
      employee_id: users.employee,
      leave_type_id: users.owner,
      start_date: "2026-12-31",
      end_date: "2027-01-02",
    }).success,
    false,
  );
  assert.equal(
    attendanceSchema.safeParse({
      employee_id: users.employee,
      day: "2026-09-21",
      planned_hours: "8",
      worked_hours: "4",
      absence: "medical",
      version: "",
    }).success,
    false,
  );
  const totals = attendanceTotals([
    {
      day: "2026-09-21",
      planned_hours: 8,
      worked_hours: null,
      category: "unrecorded",
      recorded: false,
      version: null,
      leave_request_id: null,
    },
    {
      day: "2026-09-22",
      planned_hours: 8,
      worked_hours: 0,
      category: "annual",
      recorded: true,
      version: null,
      leave_request_id: "leave",
    },
  ]);
  assert.equal(totals.working, 2);
  assert.equal(totals.worked, 0);
  assert.equal(totals.annual, 1);
  assert.equal(totals.missing, 1);
});

test("live time smoke script passes and rolls back every fixture", async () => {
  const usersBefore = await scalar("select count(*) from auth.users");
  const organisationsBefore = await scalar(
    "select count(*) from public.organisations",
  );
  const auditBefore = await scalar("select count(*) from public.audit_log");
  await db.exec(
    await readFile(new URL("./live-time-smoke.sql", import.meta.url), "utf8"),
  );
  assert.equal(await scalar("select count(*) from auth.users"), usersBefore);
  assert.equal(
    await scalar("select count(*) from public.organisations"),
    organisationsBefore,
  );
  assert.equal(
    await scalar("select count(*) from public.audit_log"),
    auditBefore,
  );
});

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

let db;
const users = {
  ownerA: "10000000-0000-4000-8000-000000000001",
  ownerB: "10000000-0000-4000-8000-000000000002",
  hr: "10000000-0000-4000-8000-000000000003",
  manager: "10000000-0000-4000-8000-000000000004",
  employee: "10000000-0000-4000-8000-000000000005",
  other: "10000000-0000-4000-8000-000000000006",
  platform: "10000000-0000-4000-8000-000000000007",
};
let orgA, orgB, employeeA, employeeB, unassigned, contractA;
async function as(user, fn) {
  await db.exec(`set role authenticated`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [
    user,
  ]);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
async function scalar(sql, args = []) {
  return Object.values((await db.query(sql, args)).rows[0])[0];
}
async function createEmployee(org, email, firstName = "Test") {
  return scalar(
    `insert into public.employees(organisation_id,first_name,last_name,email,job_title,department,workplace,start_date,status) values($1,$2,'Employee',$3,'Developer','Engineering','București','2026-09-01','active') returning id`,
    [org, firstName, email],
  );
}
before(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated;
    create schema auth; grant usage on schema auth to authenticated, anon;
    create table auth.users(id uuid primary key, email text unique, raw_user_meta_data jsonb default '{}'::jsonb, email_confirmed_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant execute on function auth.uid() to authenticated, anon;`);
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202609200001_core_hr.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202609200002_directory_details.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  for (const [name, id] of Object.entries(users))
    await db.query("insert into auth.users(id,email) values($1,$2)", [
      id,
      `${name}@example.test`,
    ]);
  orgA = await as(users.ownerA, () =>
    scalar(`select public.create_organisation('Company A','RO123456')`),
  );
  orgB = await as(users.ownerB, () =>
    scalar(`select public.create_organisation('Company B','RO234567')`),
  );
  employeeA = await as(users.ownerA, () =>
    createEmployee(orgA, "employee@example.test"),
  );
  unassigned = await as(users.ownerA, () =>
    createEmployee(orgA, "unassigned@example.test"),
  );
  employeeB = await as(users.ownerB, () =>
    createEmployee(orgB, "employee-b@example.test"),
  );
  await as(users.ownerA, async () => {
    for (const [name, role] of [
      ["hr", "hr_manager"],
      ["manager", "manager"],
      ["employee", "employee"],
    ])
      await db.query(`select public.set_organisation_member($1,$2,$3,$4)`, [
        orgA,
        `${name}@example.test`,
        role,
        name === "employee" ? employeeA : null,
      ]);
    await db.query(
      `update public.employees set manager_user_id=$1 where id=$2`,
      [users.manager, employeeA],
    );
    contractA = await scalar(
      `insert into public.employment_contracts(organisation_id,employee_id,contract_number,start_date,job_title,cor_code,workplace,gross_salary) values($1,$2,'C-001','2026-09-01','Developer','251202','București',10000) returning id`,
      [orgA, employeeA],
    );
  });
});
after(async () => {
  await db?.close();
});

test("owners see only their organisation through direct SQL/RLS", async () => {
  await as(users.ownerA, async () => {
    assert.equal(
      await scalar("select count(*)::int from public.organisations"),
      1,
    );
    assert.equal(await scalar("select count(*)::int from public.employees"), 2);
    assert.equal(
      await scalar("select count(*)::int from public.employees where id=$1", [
        employeeB,
      ]),
      0,
    );
    assert.equal(
      await scalar(
        "select count(*)::int from public.audit_log where organisation_id=$1",
        [orgB],
      ),
      0,
    );
    assert.equal(
      (await scalar("select public.dashboard_summary($1)", [orgB])).total,
      0,
    );
  });
});
test("cross-tenant writes and references are rejected", async () => {
  await as(users.ownerA, async () => {
    await assert.rejects(
      createEmployee(orgB, "intruder@example.test"),
      /row-level security/i,
    );
    assert.equal(
      (
        await db.query(
          `update public.employees set first_name='Wrong' where id=$1 returning id`,
          [employeeB],
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.query("update public.employees set organisation_id=$1 where id=$2", [
        orgB,
        employeeA,
      ]),
      /permission denied/i,
    );
    await assert.rejects(
      db.query("update public.employees set manager_user_id=$1 where id=$2", [
        users.ownerB,
        employeeA,
      ]),
      /foreign key/i,
    );
    await assert.rejects(
      db.query(
        `insert into public.employment_contracts(organisation_id,employee_id,contract_number,start_date,job_title,cor_code,workplace,gross_salary) values($1,$2,'BAD','2026-09-01','Developer','251202','București',10000)`,
        [orgA, employeeB],
      ),
      /foreign key/i,
    );
  });
});
test("employees see their own profile and salary, but cannot edit either", async () => {
  await as(users.employee, async () => {
    assert.deepEqual((await db.query("select id from public.employees")).rows, [
      { id: employeeA },
    ]);
    assert.equal(
      await scalar("select gross_salary from public.employment_contracts"),
      "10000.00",
    );
    assert.equal(
      (
        await db.query(
          `update public.employees set first_name='Wrong' where id=$1 returning id`,
          [employeeA],
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          `update public.employment_contracts set gross_salary=1 returning id`,
        )
      ).rows.length,
      0,
    );
    assert.equal(await scalar("select count(*)::int from public.audit_log"), 0);
  });
});
test("managers see only assigned employees, never their salary records", async () => {
  await as(users.manager, async () => {
    assert.deepEqual((await db.query("select id from public.employees")).rows, [
      { id: employeeA },
    ]);
    assert.equal(
      await scalar("select count(*)::int from public.employment_contracts"),
      0,
    );
    assert.equal(
      (
        await db.query(
          `update public.employees set status='terminated' returning id`,
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.query(
        `select public.set_organisation_member($1,'manager@example.test','organisation_owner',null)`,
        [orgA],
      ),
      /Owner access required/,
    );
  });
});
test("directory details expose contract types but no salary or unassigned employees", async () => {
  await as(users.manager, async () => {
    const rows = (
      await db.query("select * from public.employee_directory_details($1,$2)", [
        orgA,
        [employeeA, unassigned, employeeB],
      ])
    ).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].employee_id, employeeA);
    assert.equal(rows[0].contract_type, "indefinite");
    assert.deepEqual(Object.keys(rows[0]).sort(), [
      "contract_type",
      "employee_id",
      "manager_name",
    ]);
    assert.equal(
      (
        await db.query(
          "select * from public.employee_directory_details($1,$2)",
          [orgB, [employeeB]],
        )
      ).rows.length,
      0,
    );
  });
});
test("HR can edit employee and salary records but cannot grant roles", async () => {
  await as(users.hr, async () => {
    await db.query(
      `update public.employees set department='Product' where id=$1`,
      [employeeA],
    );
    await db.query(
      `update public.employment_contracts set gross_salary=11000 where id=$1`,
      [contractA],
    );
    assert.equal(
      await scalar(
        `select count(*)::int from public.audit_log where action='salary.changed'`,
      ),
      1,
    );
    const metadata = await scalar(
      `select metadata from public.audit_log where action='salary.changed'`,
    );
    assert.ok(metadata.changed_fields.includes("gross_salary"));
    assert.ok(!JSON.stringify(metadata).includes("11000"));
    await assert.rejects(
      db.query(
        `select public.set_organisation_member($1,'hr@example.test','organisation_owner',null)`,
        [orgA],
      ),
      /Owner access required/,
    );
  });
});
test("membership self-promotion, forged ownership, and audit tampering are blocked", async () => {
  await as(users.employee, async () => {
    await assert.rejects(
      db.query(
        `update public.organisation_users set role='organisation_owner' where user_id=$1`,
        [users.employee],
      ),
      /permission denied/i,
    );
    await assert.rejects(
      db.query(
        `insert into public.organisations(name,cui) values('Bypass','RO1234')`,
      ),
      /permission denied/i,
    );
    await assert.rejects(
      db.query(
        `insert into public.audit_log(organisation_id,action,entity,entity_id) values($1,'fake','employees',$2)`,
        [orgA, employeeA],
      ),
      /permission denied/i,
    );
    await assert.rejects(
      db.query(`delete from public.audit_log`),
      /permission denied/i,
    );
  });
  await as(users.ownerA, async () => {
    await assert.rejects(
      db.query(
        `select public.set_organisation_member($1,'ownerA@example.test','employee',null)`,
        [orgA],
      ),
      /needs an owner/,
    );
    await assert.rejects(
      db.query(`update public.employees set user_id=$1 where id=$2`, [
        users.ownerA,
        employeeA,
      ]),
      /permission denied/i,
    );
  });
});
test("employee account links are scoped and cannot be silently reassigned", async () => {
  await as(users.ownerA, async () => {
    await assert.rejects(
      db.query(
        `select public.set_organisation_member($1,'other@example.test','employee',$2)`,
        [orgA, employeeB],
      ),
      /cannot be linked/,
    );
    assert.equal(
      await scalar(
        `select count(*)::int from public.organisation_users where user_id=$1`,
        [users.other],
      ),
      0,
    );
    await assert.rejects(
      db.query(
        `select public.set_organisation_member($1,'other@example.test','employee',$2)`,
        [orgA, employeeA],
      ),
      /cannot be linked/,
    );
  });
});
test("anonymous callers have no access and cannot create an organisation", async () => {
  await db.exec("set role anon");
  try {
    await assert.rejects(
      db.query("select * from public.employees"),
      /permission denied/i,
    );
    await assert.rejects(
      db.query(`select public.create_organisation('Anonymous','RO9999')`),
      /permission denied/i,
    );
  } finally {
    await db.exec("reset role");
  }
});
test("platform administrators see organisation metadata without bypassing tenant HR rules", async () => {
  await db.query("insert into private.platform_admins(user_id) values($1)", [
    users.platform,
  ]);
  await as(users.platform, async () => {
    assert.equal(await scalar("select public.is_platform_admin()"), true);
    assert.equal(
      (await db.query("select * from public.platform_organisations()")).rows
        .length,
      2,
    );
    assert.equal(await scalar("select count(*)::int from public.employees"), 0);
    await assert.rejects(
      db.query("insert into private.platform_admins(user_id) values($1)", [
        users.ownerA,
      ]),
      /permission denied/i,
    );
  });
  await as(users.ownerA, async () => {
    await assert.rejects(
      db.query("select * from public.platform_organisations()"),
      /Platform access required/,
    );
  });
});
test("invalid dates, salaries, and same-employee addendum constraints are enforced", async () => {
  await as(users.ownerA, async () => {
    await assert.rejects(
      db.query(
        `update public.employment_contracts set gross_salary=-1 where id=$1`,
        [contractA],
      ),
      /check constraint/i,
    );
    await assert.rejects(
      db.query(
        `update public.employment_contracts set contract_type='fixed_term' where id=$1`,
        [contractA],
      ),
      /check constraint/i,
    );
    await assert.rejects(
      db.query(
        `insert into public.employment_contracts(organisation_id,employee_id,parent_contract_id,contract_number,start_date,job_title,cor_code,workplace,gross_salary) values($1,$2,$3,'BAD-ADDENDUM','2026-09-01','Developer','251202','București',10000)`,
        [orgA, unassigned, contractA],
      ),
      /foreign key/i,
    );
  });
});

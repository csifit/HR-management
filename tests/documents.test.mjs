import { test, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  uploadDocumentSchema,
  generateDocumentSchema,
  lifecycleSchema,
  taskSchema,
  revokeSchema,
} from "../src/lib/document-validation.ts";
import { documentSignatureProvider } from "../src/lib/document-signatures.ts";
let db,
  org,
  otherOrg,
  employee,
  otherEmployee,
  managerEmployee,
  ownerEmployee,
  inTest = false;
const bucket = "hrconnector-employee-documents";
const users = Object.fromEntries(
  ["owner", "other", "employee", "manager", "hr", "platform"].map((v, i) => [
    v,
    `40000000-0000-4000-8000-00000000000${i + 1}`,
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
  } catch (e) {
    if (inTest) await db.exec("rollback to savepoint actor");
    throw e;
  } finally {
    await db.exec("reset role");
    if (inTest) await db.exec("release savepoint actor");
  }
}
async function doc({
  actor = users.owner,
  o = org,
  e = employee,
  visibility = "hr_only",
  bytes = 200,
  origin = "uploaded",
} = {}) {
  return as(actor, () =>
    scalar(
      "select public.prepare_employee_document($1,$2,'Test PDF','employment',$3,$4,'test.pdf',$5)",
      [o, e, visibility, origin, bytes],
    ),
  );
}
async function object(id, actor = users.owner, bytes = 200) {
  const name = await scalar(
    "select object_path from employee_documents where id=$1",
    [id],
  );
  return as(actor, () =>
    db.query(
      "insert into storage.objects(bucket_id,name,metadata) values($1,$2,jsonb_build_object('mimetype','application/pdf','size',$3::integer))",
      [bucket, name, bytes],
    ),
  );
}
async function ready(id) {
  await object(id);
  await as(users.owner, () =>
    db.query("select complete_employee_document($1,$2,1)", [org, id]),
  );
}
async function change(id, version, action, visibility = "hr_only") {
  return as(users.owner, () =>
    db.query("select update_employee_document($1,$2,$3,$4,$5)", [
      org,
      id,
      version,
      action,
      visibility,
    ]),
  );
}
async function start(kind = "onboarding", e = employee) {
  return as(users.owner, () =>
    scalar("select create_lifecycle_case($1,$2,$3,'2026-10-01')", [
      org,
      e,
      kind,
    ]),
  );
}
async function tasks(id) {
  return (
    await db.query(
      "select * from lifecycle_tasks where case_id=$1 order by position",
      [id],
    )
  ).rows;
}
async function finishTasks(id) {
  for (const t of await tasks(id))
    if (t.task_key !== "revoke_access")
      await as(users.hr, () =>
        db.query("select update_lifecycle_task($1,$2,$3,'done','Reviewed')", [
          org,
          t.id,
          t.version,
        ]),
      );
}
async function close(id, status = "completed", note = "") {
  return as(users.owner, async () =>
    db.query("select close_lifecycle_case($1,$2,$3,$4,$5)", [
      org,
      id,
      await scalar("select version from lifecycle_cases where id=$1", [id]),
      status,
      note,
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
      `${name}@docs.test`,
    ]);
  await db.query("insert into private.platform_admins values($1,now())", [
    users.platform,
  ]);
  org = await as(users.owner, () =>
    scalar("select create_organisation('Documents A','RO93001')"),
  );
  otherOrg = await as(users.other, () =>
    scalar("select create_organisation('Documents B','RO93002')"),
  );
  const add = (o, name) =>
    scalar(
      "insert into employees(organisation_id,first_name,last_name,email,job_title,department,workplace,start_date,status) values($1,$2,'Test',$3,'Engineer','Product','Office','2026-01-01','active') returning id",
      [o, name, `${name}@docs.test`],
    );
  await as(users.owner, async () => {
    employee = await add(org, "employee");
    managerEmployee = await add(org, "manager");
    ownerEmployee = await add(org, "owner");
    for (const [name, role, e] of [
      ["employee", "employee", employee],
      ["manager", "manager", managerEmployee],
      ["owner", "organisation_owner", ownerEmployee],
      ["hr", "hr_manager", null],
    ])
      await db.query("select set_organisation_member($1,$2,$3,$4)", [
        org,
        `${name}@docs.test`,
        role,
        e,
      ]);
    await db.query("update employees set manager_user_id=$1 where id=$2", [
      users.manager,
      employee,
    ]);
  });
  await as(users.other, async () => {
    otherEmployee = await add(otherOrg, "other");
    await db.query(
      "select set_organisation_member($1,'employee@docs.test','employee',null)",
      [otherOrg],
    );
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
test("live document smoke script passes and rolls back all synthetic users and records", async () => {
  const counts = async () =>
    Promise.all(
      [
        "auth.users",
        "public.organisations",
        "public.audit_log",
        "public.employee_documents",
        "public.lifecycle_cases",
      ].map((table) => scalar(`select count(*) from ${table}`)),
    );
  const previous = await counts();
  const sql = (
    await readFile(new URL("live-documents-smoke.sql", import.meta.url), "utf8")
  )
    .replace(/^begin;$/m, "savepoint smoke;")
    .replace(
      /^rollback;$/m,
      "rollback to savepoint smoke;release savepoint smoke;",
    );
  await db.exec(sql);
  assert.deepEqual(await counts(), previous);
});
test("documents and private files follow visibility, readiness, own-employee access and archive rules", async () => {
  const privateId = await doc(),
    shared = await doc({ visibility: "employee" }),
    own = await doc({ e: managerEmployee, visibility: "employee" });
  await ready(privateId);
  await ready(own);
  const count = (actor) =>
    as(actor, () => scalar("select count(*)::int from employee_documents"));
  assert.equal(await count(users.employee), 0);
  await ready(shared);
  assert.equal(await count(users.employee), 1);
  assert.equal(await count(users.manager), 1);
  assert.equal(await count(users.hr), 3);
  assert.equal(await count(users.other), 0);
  assert.equal(await count(users.platform), 0);
  assert.equal(
    await as(users.employee, () =>
      scalar("select count(*)::int from storage.objects"),
    ),
    1,
  );
  assert.equal(
    await as(users.manager, () =>
      scalar("select count(*)::int from storage.objects"),
    ),
    1,
  );
  await change(shared, 2, "visibility", "hr_only");
  assert.equal(await count(users.employee), 0);
  await change(shared, 3, "visibility", "employee");
  await change(shared, 4, "signed");
  assert.equal(
    await scalar("select signed_by from employee_documents where id=$1", [
      shared,
    ]),
    users.owner,
  );
  await change(shared, 5, "archive");
  assert.equal(await count(users.employee), 0);
  assert.equal(
    await as(users.owner, () =>
      scalar("select count(*)::int from storage.objects"),
    ),
    3,
  );
  await assert.rejects(
    change(shared, 6, "visibility", "employee"),
    (e) => e.code === "D0001",
  );
});
test("uploads reject wrong tenants, forbidden roles, missing or mismatched objects and stale updates", async () => {
  for (const actor of [
    users.employee,
    users.manager,
    users.other,
    users.platform,
  ])
    await assert.rejects(doc({ actor }), (e) => e.code === "42501");
  await assert.rejects(doc({ e: otherEmployee }), (e) => e.code === "23503");
  await assert.rejects(doc({ bytes: 10485761 }), (e) => e.code === "23514");
  const id = await doc();
  await assert.rejects(
    as(users.owner, () =>
      db.query("select complete_employee_document($1,$2,1)", [org, id]),
    ),
    (e) => e.code === "D0002",
  );
  await object(id, users.owner, 199);
  await assert.rejects(
    as(users.owner, () =>
      db.query("select complete_employee_document($1,$2,1)", [org, id]),
    ),
    (e) => e.code === "D0002",
  );
  await assert.rejects(change(id, 2, "archive"), (e) => e.code === "P0006");
  await assert.rejects(
    as(users.hr, () =>
      db.query(
        "update employee_documents set visibility='employee' where id=$1",
        [id],
      ),
    ),
    (e) => e.code === "42501",
  );
  await assert.rejects(
    as(users.other, () =>
      db.query("select update_employee_document($1,$2,1,'archive','hr_only')", [
        otherOrg,
        id,
      ]),
    ),
    (e) => e.code === "42501",
  );
  await change(id, 1, "archive");
});
test("restrictive storage guards survive broad bucket policies and prohibit overwrite, move and deletion", async () => {
  await db.exec(
    "create policy broad_storage on storage.objects for all to authenticated,anon using(true) with check(true)",
  );
  const id = await doc();
  await assert.rejects(object(id, users.hr), (e) => e.code === "42501"); // only the uploader can finish writing a pending object
  await ready(id);
  for (const actor of [
    users.employee,
    users.manager,
    users.other,
    users.platform,
  ])
    assert.equal(
      await as(actor, () =>
        scalar("select count(*)::int from storage.objects"),
      ),
      0,
    );
  await as(users.owner, async () => {
    assert.equal(
      (await db.query("delete from storage.objects returning id")).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          "update storage.objects set name='moved.pdf' returning id",
        )
      ).rows.length,
      0,
    );
  });
  await assert.rejects(object(id), (e) => ["42501", "23505"].includes(e.code));
  await db.exec("set role anon");
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  assert.equal(await scalar("select count(*)::int from storage.objects"), 0);
  await db.exec("reset role");
});
test("suspension prevents metadata and object writes; blocking hides files and checklists", async () => {
  const id = await doc({ visibility: "employee" }),
    pending = await doc();
  await ready(id);
  await start();
  await db.query("update organisations set status='suspended' where id=$1", [
    org,
  ]);
  assert.equal(
    await as(users.employee, () =>
      scalar("select count(*)::int from employee_documents"),
    ),
    1,
  );
  await assert.rejects(doc(), (e) => e.code === "P0004");
  await assert.rejects(object(pending), (e) => e.code === "42501");
  await assert.rejects(change(id, 2, "archive"), (e) => e.code === "P0004");
  await db.query("update organisations set status='blocked' where id=$1", [
    org,
  ]);
  for (const actor of [users.owner, users.hr, users.employee])
    await as(actor, async () => {
      for (const table of [
        "employee_documents",
        "storage.objects",
        "lifecycle_cases",
        "lifecycle_tasks",
      ])
        assert.equal(await scalar(`select count(*)::int from ${table}`), 0);
    });
});
test("checklists enforce roles, duplicate prevention, versions, skip reasons and immutable closure", async () => {
  const id = await start();
  await assert.rejects(start(), (e) => e.code === "23505");
  for (const actor of [
    users.employee,
    users.manager,
    users.platform,
    users.other,
  ])
    await as(actor, async () => {
      assert.equal(
        await scalar("select count(*)::int from lifecycle_cases"),
        0,
      );
      assert.equal(
        await scalar("select count(*)::int from lifecycle_tasks"),
        0,
      );
    });
  await assert.rejects(
    as(users.other, () =>
      db.query(
        "select create_lifecycle_case($1,$2,'onboarding','2026-10-01')",
        [otherOrg, employee],
      ),
    ),
    (e) => e.code === "23503",
  );
  await assert.rejects(close(id), (e) => e.code === "D0005");
  const t = (await tasks(id))[0];
  await assert.rejects(
    as(users.owner, () =>
      db.query("select update_lifecycle_task($1,$2,1,'skipped','')", [
        org,
        t.id,
      ]),
    ),
    (e) => e.code === "22023",
  );
  await as(users.hr, () =>
    db.query(
      "select update_lifecycle_task($1,$2,1,'skipped','Already checked')",
      [org, t.id],
    ),
  );
  await assert.rejects(
    as(users.hr, () =>
      db.query("select update_lifecycle_task($1,$2,1,'done','')", [org, t.id]),
    ),
    (e) => e.code === "P0006",
  );
  await assert.rejects(
    as(users.hr, () =>
      db.query("select add_lifecycle_task($1,$2,1,'Extra check')", [org, id]),
    ),
    (e) => e.code === "P0006",
  );
  await finishTasks(id);
  await close(id);
  await assert.rejects(
    as(users.hr, () =>
      db.query("select update_lifecycle_task($1,$2,3,'todo','')", [org, t.id]),
    ),
    (e) => e.code === "D0001",
  );
  assert.equal(
    (await scalar("select count(*)::int from audit_log where entity_id=$1", [
      id,
    ])) > 0,
    true,
  );
});
test("offboarding revokes only this company's membership, denies HR/self action and blocks regrant before closure", async () => {
  const id = await start("offboarding"),
    t = (await tasks(id)).find((t) => t.task_key === "revoke_access");
  for (const actor of [users.hr, users.manager, users.employee])
    await assert.rejects(
      as(actor, () =>
        db.query(
          "select revoke_lifecycle_access($1,$2,1,$3,'Leaving company')",
          [org, t.id, users.employee],
        ),
      ),
      (e) => e.code === "42501",
    );
  await assert.rejects(
    as(users.owner, () =>
      db.query("select update_lifecycle_task($1,$2,1,'done','Reviewed')", [
        org,
        t.id,
      ]),
    ),
    (e) => e.code === "42501",
  );
  await assert.rejects(
    as(users.owner, () =>
      db.query(
        "select revoke_lifecycle_access($1,$2,1,null,'Leaving company')",
        [org, t.id],
      ),
    ),
    (e) => e.code === "P0006",
  );
  const docId = await doc({ visibility: "employee" });
  await ready(docId);
  await as(users.owner, () =>
    db.query("select revoke_lifecycle_access($1,$2,1,$3,'Leaving company')", [
      org,
      t.id,
      users.employee,
    ]),
  );
  assert.equal(
    await scalar("select user_id from employees where id=$1", [employee]),
    null,
  );
  assert.equal(
    await as(users.employee, () =>
      scalar("select count(*)::int from employee_documents"),
    ),
    0,
  );
  assert.equal(
    await as(users.employee, () =>
      scalar("select count(*)::int from storage.objects"),
    ),
    0,
  );
  assert.equal(
    await scalar(
      "select count(*)::int from organisation_users where organisation_id=$1 and user_id=$2",
      [otherOrg, users.employee],
    ),
    1,
  );
  assert.equal(
    await scalar("select count(*)::int from auth.users where id=$1", [
      users.employee,
    ]),
    1,
  );
  await finishTasks(id);
  await as(users.owner, () =>
    db.query(
      "select set_organisation_member($1,'employee@docs.test','employee',null)",
      [org],
    ),
  );
  await assert.rejects(close(id), (e) => e.code === "D0004");
  await assert.rejects(
    as(users.owner, () =>
      db.query(
        "select revoke_lifecycle_access($1,$2,2,null,'Leaving company')",
        [org, t.id],
      ),
    ),
    (e) => e.code === "D0004",
  );
  await as(users.owner, () =>
    db.query(
      "select set_organisation_member($1,'employee@docs.test','employee',$2)",
      [org, employee],
    ),
  );
  await as(users.owner, () =>
    db.query("select revoke_lifecycle_access($1,$2,2,$3,'Leaving company')", [
      org,
      t.id,
      users.employee,
    ]),
  );
  await close(id);
  const ownId = await start("offboarding", ownerEmployee),
    ownTask = (await tasks(ownId)).find((t) => t.task_key === "revoke_access");
  await assert.rejects(
    as(users.owner, () =>
      db.query("select revoke_lifecycle_access($1,$2,1,$3,'Leaving company')", [
        org,
        ownTask.id,
        users.owner,
      ]),
    ),
    (e) => e.code === "D0003",
  );
});
test("manager offboarding clears assignments and custom tasks retain history", async () => {
  const id = await start("offboarding", managerEmployee),
    t = (await tasks(id)).find((t) => t.task_key === "revoke_access");
  await as(users.owner, () =>
    db.query("select add_lifecycle_task($1,$2,1,'Return access card')", [
      org,
      id,
    ]),
  );
  assert.equal((await tasks(id)).at(-1).title, "Return access card");
  await as(users.owner, () =>
    db.query("select revoke_lifecycle_access($1,$2,1,$3,'Leaving company')", [
      org,
      t.id,
      users.manager,
    ]),
  );
  assert.equal(
    await scalar("select manager_user_id from employees where id=$1", [
      employee,
    ]),
    null,
  );
  await close(id, "cancelled", "Departure postponed");
  assert.equal(
    await scalar("select count(*)::int from lifecycle_tasks where case_id=$1", [
      id,
    ]),
    8,
  );
  assert.equal(
    await scalar(
      "select count(*)::int from organisation_users where organisation_id=$1 and user_id=$2",
      [org, users.manager],
    ),
    0,
  );
});
test("document and checklist inputs reject malformed values and electronic signing remains unavailable", async () => {
  const values = {
    employee_id: users.employee,
    title: "Test",
    category: "employment",
    visibility: "hr_only",
    filename: "test.pdf",
    byte_size: "200",
  };
  assert.equal(uploadDocumentSchema.safeParse(values).success, true);
  for (const patch of [
    { filename: "../x.pdf" },
    { filename: "bad\nname.pdf" },
    { byte_size: "10485761" },
    { visibility: "public" },
  ])
    assert.equal(
      uploadDocumentSchema.safeParse({ ...values, ...patch }).success,
      false,
    );
  assert.equal(
    generateDocumentSchema.safeParse({
      ...values,
      template: "letter",
      body: "",
    }).success,
    false,
  );
  assert.equal(
    lifecycleSchema.safeParse({
      employee_id: users.employee,
      kind: "offboarding",
      target_date: "2026-02-30",
    }).success,
    false,
  );
  assert.equal(
    taskSchema.safeParse({
      id: users.employee,
      version: "1",
      status: "skipped",
      note: "",
    }).success,
    false,
  );
  assert.equal(
    revokeSchema.safeParse({
      id: users.employee,
      version: "1",
      user_id: "",
      note: "Leaving",
    }).success,
    false,
  );
  assert.equal(documentSignatureProvider.available, false);
  await assert.rejects(documentSignatureProvider.requestSignature("id"));
});
test("optional MFA gates tenant RPCs, platform access and private files after enrollment", async () => {
  const id = await doc({ visibility: "employee" });
  await ready(id);
  await db.query(
    "insert into auth.mfa_factors(user_id,status) values($1,'verified'),($2,'verified'),($3,'verified')",
    [users.owner, users.employee, users.platform],
  );
  for (const actor of [users.owner, users.employee])
    await as(actor, async () => {
      for (const table of [
        "employees",
        "employment_contracts",
        "organisation_users",
        "employee_documents",
        "storage.objects",
      ])
        assert.equal(await scalar(`select count(*)::int from ${table}`), 0);
    });
  await assert.rejects(doc(), (e) => e.code === "42501");
  await assert.rejects(
    as(users.owner, () =>
      scalar("select create_organisation('MFA blocked','RO93099')"),
    ),
    (e) => e.code === "42501",
  );
  assert.equal(
    await as(users.platform, () => scalar("select is_platform_admin()")),
    false,
  );
  await db.query(
    "select set_config('request.jwt.claims','{\"aal\":\"aal2\"}',false)",
  );
  assert.equal(
    await as(users.owner, () =>
      scalar("select count(*)::int from employee_documents"),
    ),
    1,
  );
  assert.equal(
    await as(users.employee, () =>
      scalar("select count(*)::int from storage.objects"),
    ),
    1,
  );
  assert.equal(
    await as(users.platform, () => scalar("select is_platform_admin()")),
    true,
  );
  await db.query(
    "select set_config('request.jwt.claims','{\"aal\":\"aal1\"}',false)",
  );
  await db.query("update auth.mfa_factors set status='unverified'");
  assert.equal(
    await as(users.owner, () =>
      scalar("select count(*)::int from employee_documents"),
    ),
    1,
  );
});
test("REGES identifiers are owner-managed, tenant-private, versioned and MFA-gated", async () => {
  await as(users.owner, () =>
    db.query("select save_reges_identifiers($1,null,$2,$3)", [
      org,
      users.owner,
      users.employee,
    ]),
  );
  for (const actor of [
    users.employee,
    users.manager,
    users.other,
    users.platform,
  ])
    assert.equal(
      await as(actor, () =>
        scalar("select count(*)::int from reges_connections"),
      ),
      0,
    );
  assert.equal(
    await as(users.hr, () =>
      scalar("select count(*)::int from reges_connections"),
    ),
    1,
  );
  await assert.rejects(
    as(users.hr, () =>
      db.query("select save_reges_identifiers($1,1,null,null)", [org]),
    ),
    (e) => e.code === "42501",
  );
  await assert.rejects(
    as(users.owner, () =>
      db.query("select save_reges_identifiers($1,null,null,null)", [org]),
    ),
    (e) => e.code === "P0006",
  );
  await as(users.owner, () =>
    db.query("select save_reges_identifiers($1,1,null,null)", [org]),
  );
  assert.equal(
    await scalar(
      "select employer_id from reges_connections where organisation_id=$1",
      [org],
    ),
    null,
  );
  await db.query(
    "insert into auth.mfa_factors(user_id,status) values($1,'verified')",
    [users.owner],
  );
  assert.equal(
    await as(users.owner, () =>
      scalar("select count(*)::int from reges_connections"),
    ),
    0,
  );
});
test("document email locks recipients, visibility, tenant and attempts without sending any mail", async () => {
  const id = await doc();
  await ready(id);
  const send = (
    actor = users.owner,
    email = "employee@docs.test",
    version = 2,
  ) =>
    as(actor, () =>
      scalar("select prepare_document_email($1,$2,$3,$4)", [
        org,
        id,
        version,
        email,
      ]),
    );
  await assert.rejects(send(), (e) => e.code === "D0001");
  await change(id, 2, "visibility", "employee");
  await assert.rejects(
    send(users.employee, "employee@docs.test", 3),
    (e) => e.code === "42501",
  );
  await assert.rejects(
    send(users.owner, "other@docs.test", 3),
    (e) => e.code === "P0006",
  );
  const attempt = await send(users.owner, "employee@docs.test", 3);
  await assert.rejects(
    send(users.owner, "employee@docs.test", 3),
    (e) => e.code === "23505",
  );
  await assert.rejects(
    as(users.hr, () =>
      db.query("select finish_document_email($1,$2,'accepted')", [
        org,
        attempt,
      ]),
    ),
    (e) => e.code === "42501",
  );
  await as(users.owner, () =>
    db.query("select finish_document_email($1,$2,'failed')", [org, attempt]),
  );
  const retry = await send(users.owner, "employee@docs.test", 3);
  await as(users.owner, () =>
    db.query("select finish_document_email($1,$2,'uncertain')", [org, retry]),
  );
  await assert.rejects(
    send(users.owner, "employee@docs.test", 3),
    (e) => e.code === "23505",
  );
  for (const actor of [users.employee, users.other, users.platform])
    assert.equal(
      await as(actor, () =>
        scalar("select count(*)::int from document_deliveries"),
      ),
      0,
    );
});

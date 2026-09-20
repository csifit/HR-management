import { test } from "node:test";
import assert from "node:assert/strict";
import {
  employeeSchema,
  contractSchema,
  organisationSchema,
} from "../src/lib/validation.ts";
const employee = {
  first_name: "Ana",
  last_name: "Popescu",
  email: "ana@example.test",
  phone: "",
  job_title: "Developer",
  department: "Product",
  workplace: "București",
  start_date: "2026-09-01",
  status: "active",
  manager_user_id: "",
};
const contract = {
  contract_number: "123",
  start_date: "2026-09-01",
  end_date: "",
  job_title: "Developer",
  cor_code: "251202",
  contract_type: "indefinite",
  working_hours: "8",
  workplace: "București",
  gross_salary: "10000",
  probation_days: "90",
  status: "draft",
};
test("employee validation rejects impossible dates and arbitrary roles/statuses", () => {
  assert.equal(employeeSchema.safeParse(employee).success, true);
  assert.equal(
    employeeSchema.safeParse({ ...employee, start_date: "2026-02-30" }).success,
    false,
  );
  assert.equal(
    employeeSchema.safeParse({ ...employee, status: "owner" }).success,
    false,
  );
  assert.equal(
    employeeSchema.parse({
      ...employee,
      organisation_id: "spoofed",
      user_id: "spoofed",
    }).organisation_id,
    undefined,
  );
});
test("fixed-term contracts require ordered dates and positive salary", () => {
  assert.equal(contractSchema.safeParse(contract).success, true);
  assert.equal(
    contractSchema.safeParse({ ...contract, contract_type: "fixed_term" })
      .success,
    false,
  );
  assert.equal(
    contractSchema.safeParse({
      ...contract,
      contract_type: "fixed_term",
      end_date: "2026-08-01",
    }).success,
    false,
  );
  assert.equal(
    contractSchema.safeParse({ ...contract, gross_salary: "-1" }).success,
    false,
  );
  assert.equal(
    contractSchema.safeParse({ ...contract, cor_code: "ABCDEF" }).success,
    false,
  );
});
test("organisation validation normalizes CUI and rejects malformed identifiers", () => {
  assert.equal(
    organisationSchema.parse({ name: " Company ", cui: "ro123456" }).cui,
    "RO123456",
  );
  assert.equal(
    organisationSchema.safeParse({ name: "X", cui: "invalid" }).success,
    false,
  );
});

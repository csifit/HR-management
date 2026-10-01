import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculatePayrollAdjusted,
  payrollWithUnpaidSchema,
  payrollUnpaidFromForm,
  UnpaidPayrollReview,
} from "../src/lib/payroll-unpaid.ts";
import { calculatePayrollWithLeave } from "../src/lib/payroll-annual-leave.ts";
const unpaid = {
  requests: [
    {
      id: "b1000000-0000-4000-8000-000000000001",
      dates: ["2026-01-05", "2026-01-06"],
    },
  ],
  absences: [],
  suspendedDates: [],
  reviewReference: "Reviewed unpaid classification",
  suspensionReference: "",
  confirmed: "on",
};
const base = {
  month: "2026-01",
  basic: 10000,
  bonus: 0,
  hours: 8,
  meals: 0,
  advance: 0,
  primary: "yes",
  dependants: 0,
  young: "no",
  children: 0,
  reduced: "no",
  standard: "on",
  period: {
    start: "2026-01-01",
    end: "2026-01-31",
    monthWorkingDays: 22,
    employedWorkingDays: 22,
    monthCalendarDays: 31,
    employedCalendarDays: 31,
  },
  deductionEmployer: "this",
  deductionReference: "",
  unpaid,
};
test("unpaid days reduce earned basic once while unsuspended dates retain the active contribution floor", () => {
  const r = calculatePayrollAdjusted(base);
  assert.deepEqual(r.unpaid, {
    workedBasic: 9090.91,
    unpaidBasic: 909.09,
    activeWorkingDays: 22,
  });
  assert.equal(r.cashGross, 9090.91);
  assert.equal(r.contributionFloor, 3750);
  assert.equal(r.rules, "RO-2026-monthly-v7");
  const part = calculatePayrollAdjusted({ ...base, basic: 2025, hours: 4 });
  assert.equal(part.employerCas, 478);
  assert.equal(part.employerCass, 191);
});
test("formal suspension affects the floor without changing the already-excluded salary", () => {
  const v = {
    ...base,
    basic: 2025,
    hours: 4,
    unpaid: {
      ...unpaid,
      suspendedDates: ["2026-01-05", "2026-01-06"],
      suspensionReference: "Suspension record",
    },
  };
  const r = calculatePayrollAdjusted(v);
  assert.equal(r.contributionFloor, 3409);
  assert.equal(r.unpaid.activeWorkingDays, 20);
  assert.equal(r.cashGross, 1840.91);
  const exception = calculatePayrollAdjusted({
    ...v,
    floorException: "student",
    evidence: "Current certificate",
  });
  assert.equal(exception.employerCas, 0);
});
test("annual leave, unpaid dates, settlement, vouchers and advance coexist without double deduction", () => {
  const v = {
    ...base,
    unpaid: { ...unpaid, requests: [], absences: ["2026-01-07", "2026-01-08"] },
    annualLeave: {
      confirmed: "on",
      requests: [
        {
          ...unpaid.requests[0],
          dailyGross: 500.25,
          rateReference: "Annual approved rate",
        },
      ],
    },
    bonus: 100.25,
    meals: 200.15,
    mealsReference: "Issued vouchers",
    advance: 150.5,
    advanceReference: "Paid advance",
    settlement: {
      days: 2.5,
      dailyGross: 200.25,
      balanceReference: "Final balance",
      rateReference: "Final rate",
      otherGross: 100.25,
      otherReference: "Other approved cash",
      confirmed: "on",
    },
  };
  const r = calculatePayrollAdjusted(v);
  assert.deepEqual(r.annualLeave, { workedBasic: 8181.82, leaveGross: 1000.5 });
  assert.equal(r.unpaid.unpaidBasic, 909.09);
  assert.equal(r.cashGross, 9883.45);
  assert.equal(r.payable, Math.round((r.net - 150.5) * 100) / 100);
  assert.equal(r.meals, 200.15);
});
test("all-month confirmed suspension has zero salary and floor; unresolved zero-cash active dates fail closed", () => {
  const dates = Array.from(
    { length: 31 },
    (_, i) => `2026-01-${String(i + 1).padStart(2, "0")}`,
  ).filter((d) => ![0, 6].includes(new Date(d).getUTCDay()));
  const u = {
    ...unpaid,
    requests: [],
    absences: dates,
    suspendedDates: dates,
    suspensionReference: "Full month suspension",
  };
  const r = calculatePayrollAdjusted({ ...base, unpaid: u });
  assert.equal(r.cashGross, 0);
  assert.equal(r.payable, 0);
  assert.equal(r.contributionFloor, 0);
  assert.equal(r.unpaid.unpaidBasic, 10000);
  assert.throws(
    () =>
      calculatePayrollAdjusted({
        ...base,
        unpaid: { ...u, suspendedDates: [], suspensionReference: "" },
      }),
    UnpaidPayrollReview,
  );
});
test("bounds, duplicates, overlap with annual leave and missing suspension/classification evidence reject", () => {
  for (const patch of [
    { confirmed: "" },
    { reviewReference: "x" },
    { requests: [], absences: [] },
    {
      requests: [
        { ...unpaid.requests[0], dates: ["2026-01-05", "2026-01-05"] },
      ],
    },
    { absences: ["2026-01-05"] },
    { absences: ["2026-01-03"] },
    { absences: ["2026-02-30"] },
    { absences: ["2026-02-02"] },
    { absences: ["2026-01-08", "2026-01-07"] },
    { suspendedDates: ["2026-01-07"], suspensionReference: "Record" },
    { suspendedDates: ["2026-01-05"] },
    { suspensionReference: "Extraneous record" },
    { unknown: "unsafe" },
  ])
    assert.throws(() =>
      calculatePayrollAdjusted({ ...base, unpaid: { ...unpaid, ...patch } }),
    );
  assert.throws(() =>
    calculatePayrollAdjusted({
      ...base,
      annualLeave: {
        confirmed: "on",
        requests: [
          { ...unpaid.requests[0], dailyGross: 500, rateReference: "Approved" },
        ],
      },
    }),
  );
  assert.throws(() => calculatePayrollAdjusted({ ...base, period: undefined }));
});
test("minimum-wage relief with unpaid days is blocked instead of applying a full-month allowance", () => {
  assert.throws(
    () => calculatePayrollAdjusted({ ...base, basic: 4050 }),
    UnpaidPayrollReview,
  );
  assert.equal(
    calculatePayrollAdjusted({ ...base, basic: 4050, bonus: 1000 }).relief,
    0,
  );
});
test("partial employment retains exact bani and separate active days", () => {
  const r = calculatePayrollAdjusted({
    ...base,
    period: {
      ...base.period,
      end: "2026-01-16",
      employedWorkingDays: 12,
      employedCalendarDays: 16,
    },
    deductionReference: "First employer declaration",
    unpaid: {
      ...unpaid,
      suspendedDates: ["2026-01-05"],
      suspensionReference: "Suspension day",
    },
  });
  assert.equal(r.cashGross, 4545.45);
  assert.equal(r.unpaid.activeWorkingDays, 11);
  assert.equal(r.contributionFloor, 1875);
});
test("no-unpaid dispatch preserves previous calculators and form conversion never infers suspension", () => {
  const ordinary = { ...base };
  delete ordinary.unpaid;
  assert.deepEqual(
    calculatePayrollAdjusted(ordinary),
    calculatePayrollWithLeave(ordinary),
  );
  const facts = { requests: unpaid.requests, absences: ["2026-01-07"] };
  const u = payrollUnpaidFromForm({
    unpaidFacts: JSON.stringify(facts),
    unpaidReference: "Reviewed",
    unpaidConfirmed: "on",
  });
  assert.deepEqual(u.suspendedDates, []);
  const reviewed = payrollUnpaidFromForm({
    unpaidFacts: JSON.stringify(facts),
    unpaidSuspended1: "on",
    unpaidReference: "Reviewed",
    suspensionReference: "Verified record",
    unpaidConfirmed: "on",
  });
  assert.deepEqual(
    payrollWithUnpaidSchema.parse({ ...base, unpaid: reviewed }).unpaid
      .suspendedDates,
    ["2026-01-06"],
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculatePayrollWithLeave,
  payrollWithAnnualSchema,
  payrollAnnualFromForm,
} from "../src/lib/payroll-annual-leave.ts";
import { calculatePayrollEntry } from "../src/lib/payroll-settlement.ts";
import { PartialPayrollReliefReview } from "../src/lib/payroll-period.ts";
const request = {
  id: "b1000000-0000-4000-8000-000000000001",
  dates: ["2026-01-05", "2026-01-06"],
  dailyGross: 500.25,
  rateReference: "Accountant rate approval",
};
const base = {
  month: "2026-01",
  basic: 10000,
  bonus: 100.25,
  hours: 8,
  meals: 0,
  advance: 100,
  advanceReference: "Paid advance",
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
  annualLeave: { requests: [request], confirmed: "on" },
};
test("annual pay replaces worked basic for approved dates rather than being added to full salary", () => {
  const r = calculatePayrollWithLeave(base);
  assert.deepEqual(r.annualLeave, { workedBasic: 9090.91, leaveGross: 1000.5 });
  assert.equal(r.cashGross, 10191.66);
  assert.equal(r.payable, r.net - 100);
  assert.equal(r.rules, "RO-2026-monthly-v6");
});
test("separate request rates and all-month leave retain exact amounts", () => {
  const r = calculatePayrollWithLeave({
    ...base,
    annualLeave: {
      confirmed: "on",
      requests: [
        request,
        {
          ...request,
          id: "b1000000-0000-4000-8000-000000000002",
          dates: ["2026-01-07"],
          dailyGross: 600.5,
        },
      ],
    },
  });
  assert.deepEqual(r.annualLeave, { workedBasic: 8636.36, leaveGross: 1601 });
  const dates = Array.from(
    { length: 31 },
    (_, i) => `2026-01-${String(i + 1).padStart(2, "0")}`,
  ).filter((v) => ![0, 6].includes(new Date(v).getUTCDay()));
  assert.deepEqual(
    calculatePayrollWithLeave({
      ...base,
      annualLeave: { confirmed: "on", requests: [{ ...request, dates }] },
    }).annualLeave,
    { workedBasic: 0, leaveGross: 11005.5 },
  );
});
test("unknown, duplicate, unordered, invalid and out-of-period dates or missing approvals reject", () => {
  for (const patch of [
    { dates: [] },
    { dates: ["2026-01-32"] },
    { dates: ["2026-02-02"] },
    { dates: ["2026-01-03"] },
    { dates: ["2026-01-06", "2026-01-05"] },
    { dates: ["2026-01-05", "2026-01-05"] },
    { dailyGross: 0 },
    { dailyGross: 500.255 },
    { dailyGross: "5e2" },
    { rateReference: "" },
    { hidden: 1 },
  ])
    assert.throws(() =>
      calculatePayrollWithLeave({
        ...base,
        annualLeave: { confirmed: "on", requests: [{ ...request, ...patch }] },
      }),
    );
  assert.throws(() =>
    calculatePayrollWithLeave({
      ...base,
      annualLeave: { confirmed: "", requests: [request] },
    }),
  );
  assert.throws(() =>
    calculatePayrollWithLeave({
      ...base,
      annualLeave: { confirmed: "on", requests: [request, request] },
    }),
  );
  assert.throws(() =>
    calculatePayrollWithLeave({ ...base, period: undefined }),
  );
});
test("current basic minimum is checked without guessing permanent pay components", () => {
  assert.throws(
    () =>
      calculatePayrollWithLeave({
        ...base,
        annualLeave: {
          confirmed: "on",
          requests: [{ ...request, dailyGross: 454.54 }],
        },
      }),
    /minimum/,
  );
  assert.equal(
    calculatePayrollWithLeave({
      ...base,
      annualLeave: {
        confirmed: "on",
        requests: [{ ...request, dailyGross: 454.55 }],
      },
    }).annualLeave.leaveGross,
    909.1,
  );
  assert.throws(
    () =>
      calculatePayrollWithLeave({
        ...base,
        annualLeave: {
          confirmed: "on",
          requests: [{ ...request, dailyGross: 1000000 }],
        },
      }),
    /Gross limit/,
  );
});
test("part-month leave retains employed contribution floor, settlement and advance once", () => {
  const s = {
    days: 1.5,
    dailyGross: 500,
    balanceReference: "Final balance",
    rateReference: "Approved rate",
    otherGross: 250.25,
    otherReference: "Approved compensation",
    confirmed: "on",
  };
  const r = calculatePayrollWithLeave({
    ...base,
    period: {
      ...base.period,
      end: "2026-01-16",
      employedWorkingDays: 12,
      employedCalendarDays: 16,
    },
    deductionReference: "First employer",
    settlement: s,
  });
  assert.deepEqual(r.annualLeave, { workedBasic: 4545.45, leaveGross: 1000.5 });
  assert.equal(r.cashGross, 6646.45);
  assert.equal(r.contributionFloor, 2045);
  assert.deepEqual(r.settlement, { unusedLeaveGross: 750, otherGross: 250.25 });
  assert.equal(r.payable, r.net - 100);
});
test("full-month relief considers total pay and unresolved partial relief still fails closed", () => {
  const min = {
    ...base,
    basic: 4050,
    bonus: 0,
    advance: 0,
    advanceReference: "",
    annualLeave: {
      confirmed: "on",
      requests: [{ ...request, dailyGross: 184.1 }],
    },
  };
  assert.equal(calculatePayrollWithLeave(min).relief, 300);
  assert.throws(
    () =>
      calculatePayrollWithLeave({
        ...min,
        period: {
          ...base.period,
          end: "2026-01-16",
          employedWorkingDays: 12,
          employedCalendarDays: 16,
        },
        deductionReference: "Employer declaration",
      }),
    PartialPayrollReliefReview,
  );
});
test("v3-v5 dispatch remains unchanged and form conversion never invents approved dates", () => {
  const ordinary = { ...base };
  delete ordinary.annualLeave;
  assert.deepEqual(
    calculatePayrollWithLeave(ordinary),
    calculatePayrollEntry(ordinary),
  );
  assert.equal(payrollAnnualFromForm({}), undefined);
  const a = payrollAnnualFromForm({
    annualRequests: JSON.stringify([{ id: request.id, dates: request.dates }]),
    annualRate0: "500,25",
    annualReference0: request.rateReference,
    annualConfirmed: "on",
  });
  assert.deepEqual(
    payrollWithAnnualSchema.parse({ ...base, annualLeave: a }).annualLeave,
    base.annualLeave,
  );
  assert.throws(() => payrollAnnualFromForm({ annualRequests: "broken" }));
});

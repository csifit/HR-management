import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculatePayrollRun,
  PartialPayrollReliefReview,
} from "../src/lib/payroll-period.ts";
import {
  calculatePayrollEntry,
  payrollEntrySchema,
  unusedLeaveGross,
  payrollSettlementFromForm,
} from "../src/lib/payroll-settlement.ts";
const settlement = {
  days: 5.5,
  dailyGross: 250.25,
  balanceReference: "HR balance",
  rateReference: "Accountant rate",
  otherGross: 1000.25,
  otherReference: "Compensation approval",
  confirmed: "on",
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
    end: "2026-01-16",
    monthWorkingDays: 22,
    employedWorkingDays: 12,
    monthCalendarDays: 31,
    employedCalendarDays: 16,
  },
  deductionEmployer: "this",
  deductionReference: "First employer declaration",
};
test("confirmed days times approved rate use exact bani including a half-ban", () => {
  assert.equal(unusedLeaveGross(5.5, 250.25), 1376.38);
  assert.equal(unusedLeaveGross(0.01, 0.49), 0);
  assert.equal(unusedLeaveGross(0.01, 0.5), 0.01);
  assert.equal(unusedLeaveGross(365, 1000000), 365000000);
});
test("settlement joins taxable gross exactly once and preserves original bonus", () => {
  const input = payrollEntrySchema.parse({ ...base, settlement }),
    r = calculatePayrollEntry(input);
  const expected = calculatePayrollRun({ ...base, bonus: 2476.88 });
  assert.deepEqual(r, {
    ...expected,
    rules: "RO-2026-monthly-v5",
    settlement: { unusedLeaveGross: 1376.38, otherGross: 1000.25 },
  });
  assert.equal(input.bonus, 100.25);
  assert.equal(r.cashGross, 7931.43);
  assert.equal(r.payable, r.net - 100);
});
test("unused leave alone and other ordinary termination pay alone are supported", () => {
  assert.equal(
    calculatePayrollEntry({
      ...base,
      settlement: { ...settlement, otherGross: 0, otherReference: "" },
    }).settlement.unusedLeaveGross,
    1376.38,
  );
  assert.deepEqual(
    calculatePayrollEntry({
      ...base,
      settlement: {
        ...settlement,
        days: 0,
        dailyGross: 0,
        balanceReference: "",
        rateReference: "",
      },
    }).settlement,
    { unusedLeaveGross: 0, otherGross: 1000.25 },
  );
});
test("references, confirmation, normalized precision and positive settlement are required", () => {
  for (const patch of [
    { days: -1 },
    { days: 366 },
    { days: 1.001 },
    { dailyGross: 250.255 },
    { dailyGross: 0 },
    { rateReference: "" },
    { balanceReference: "" },
    { otherReference: "" },
    { confirmed: undefined },
    { hidden: "x" },
    { days: 0 },
    { otherGross: 0 },
    {
      days: 0,
      dailyGross: 0,
      balanceReference: "",
      rateReference: "",
      otherGross: 0,
      otherReference: "",
    },
  ])
    assert.throws(() =>
      calculatePayrollEntry({
        ...base,
        settlement: { ...settlement, ...patch },
      }),
    );
  assert.throws(() =>
    calculatePayrollEntry({ ...base, period: undefined, settlement }),
  );
  assert.throws(() =>
    calculatePayrollEntry({
      ...base,
      settlement: { ...settlement, days: 365, dailyGross: 1000000 },
    }),
  );
});
test("comma decimals parse without accepting exponent input and extra pay uses actual amounts", () => {
  const input = payrollEntrySchema.parse({
    ...base,
    settlement: {
      ...settlement,
      days: "5,50",
      dailyGross: "250,25",
      otherGross: "1000,25",
    },
  });
  assert.deepEqual(input.settlement, settlement);
  assert.throws(() =>
    payrollEntrySchema.parse({
      ...base,
      settlement: { ...settlement, dailyGross: "2.5e2" },
    }),
  );
});
test("minimum relief guard considers combined cash; no eligibility bypass for partial months", () => {
  const min = {
    ...base,
    basic: 4050,
    bonus: 0,
    advance: 0,
    advanceReference: "",
  };
  assert.throws(
    () =>
      calculatePayrollEntry({
        ...min,
        settlement: {
          ...settlement,
          days: 1,
          dailyGross: 10,
          otherGross: 0,
          otherReference: "",
        },
      }),
    PartialPayrollReliefReview,
  );
  assert.equal(
    calculatePayrollEntry({
      ...min,
      settlement: {
        ...settlement,
        days: 10,
        dailyGross: 250,
        otherGross: 0,
        otherReference: "",
      },
    }).relief,
    0,
  );
});
test("v3/v4 dispatch remains identical when settlement is omitted; unchecked form omits old values", () => {
  assert.deepEqual(calculatePayrollEntry(base), calculatePayrollRun(base));
  assert.equal(payrollSettlementFromForm({ settlementDays: "5" }), undefined);
  const legacy = { ...base };
  delete legacy.period;
  delete legacy.deductionEmployer;
  delete legacy.deductionReference;
  assert.deepEqual(calculatePayrollEntry(legacy), calculatePayrollRun(legacy));
});

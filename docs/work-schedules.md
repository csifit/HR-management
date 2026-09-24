# Recurring work schedules

HR and owners manage schedules at **Attendance → Work schedules** (`/attendance/settings`). Employees retain their read-only calendar. Managers retain attendance correction rights but cannot change recurring schedules.

## Behaviour

- Select working weekdays, not just a number of days. Monday–Friday is the fallback before any configured schedule.
- An employee override replaces organisation weekdays. A later **Follow organisation schedule** entry restores inheritance, including later company changes.
- Each entry continues from its effective date until the next entry for that organisation/employee. New entries and edits start today or later (Europe/Bucharest). Earlier entries are read-only. To cancel an upcoming pattern, edit it to the desired weekdays or restore inheritance.
- Company date exceptions override both patterns for everyone. Configure holidays/exceptional working dates under Leave settings; public holidays are not imported automatically.
- Daily hours still come from the contract. Completed eligible days count as recorded; today/future days remain planned. Saved manual attendance takes precedence, including work on an otherwise non-working day. Approved leave supplies zero work.
- New leave requests count the employee's effective working dates. Changes affecting a pending/approved request are rejected atomically; HR must cancel and resubmit affected requests. Saved leave dates/balances are not silently recalculated.
- Benefit drafts use this attendance. Approved benefit snapshots remain unchanged. Payslip generation refuses months containing a non-Monday–Friday recurring pattern because the current payroll rules assume that pattern.

No rotating shifts, different hours per weekday, automatic holiday import or retrospective schedule editing. Existing contract/calendar-date edits can still change derived attendance history; this is not an immutable monthly ledger or employment-law validation.

## Release

Apply **`202609240013_recurring_work_schedules.sql`** after 001–012, then deploy. Existing organisations retain Monday–Friday; there is no backfill or email send. Check remote history before applying; do not blindly reapply migrations or push the root localhost Auth config.

The remote migration-status check returned CLI HTTP 403. Migration 013 was tested locally and was not applied to production by the assistant. The user manages their development server and deployment.

## Manual checks

Use an existing employee with a valid contract in a test organisation.

1. Schedule Monday–Thursday from today/a future date. Earlier calendar dates should remain unchanged and later Fridays should be off.
2. Set the employee to Monday–Saturday, then schedule a return to inheritance. Check both effective dates and history.
3. Set an upcoming scheduled Saturday as non-working in the company date exceptions; confirm its planned hours are zero.
4. Request leave across a configured week. Check its day count and that a conflicting schedule change is refused. Cancel before applying the change.
5. Confirm saved attendance corrections survive schedule changes and employees have no schedule/edit controls.
6. Check RO/EN, date/weekday validation, two-tab stale-update protection, pagination and narrow-screen layout. After an eligible day ends, contract hours should appear automatically unless overridden by leave/manual attendance.

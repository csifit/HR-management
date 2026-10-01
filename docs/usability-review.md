# Usability review — 1 October 2026

Source review and read-only inspection of the deployed dashboard, employee directory, attendance and payroll found repeated help text, equally weighted totals and unavailable navigation. No live HR records were changed. The owner subsequently reported migration 019 applied and the updates deployed on 1 October 2026. Signed-in screen checks remain separate from that release report.

## Implemented in this pass

- Group payroll entry into contract/period facts, earnings, tax declarations, optional settlement and required review. Keep required confirmations visible. Put explanatory scope/evidence text in expandable guidance. Show a clear calculate → review → save progression; changes invalidate the preview.
- Highlight cash gross, net, remaining cash and employer cost. Retain all tax figures in expandable details, including saved results and monthly totals. No totals are removed or recalculated differently for this display change.
- Reduce attendance from eight equally weighted cards to four principal totals and a compact, always-visible absence summary. Preserve every count and the employee read-only calendar.
- Remove the disabled sidebar placeholder; retain REGES preparation. Fix security/team/settings current-page labels and mobile menu closure. Use a clearer organisation-switch label and slightly tighter spacing.
- Hide unavailable contract/salary/activity tabs on employee profiles according to existing roles and ownership. A requested unavailable tab falls back to employment; database access rules are unchanged.
- Print settlement components and approval references in a dedicated accountant table, with concise payslip lines that retain all facts.

## Suggested follow-ups, in priority order

1. **Accountant validation and payroll coverage:** annual leave at accountant-approved rates is implemented locally in migration 020. Compare representative outputs with SAGA, then address medical/unpaid leave, rate history and remaining final-settlement cases as independently reviewed versioned rules.
2. **Actionable dashboard:** one concise work queue for leave awaiting decisions, contract review, onboarding and payroll drafts. Link each count to the relevant filtered list and preserve employee-only scope.
3. **Filters and empty states:** remember month/employee context across related modules; distinguish no records from no search results; offer context-appropriate next actions. Keep query-based links shareable and avoid automatic submission on text typing.
4. **Profile navigation:** related-module links still share space with profile tabs. A separate compact related-records section would make the hierarchy clearer on phones.
5. **Documents:** show visibility/recipient/delivery state together and help HR identify the current approved payslip when several revisions exist. Preserve explicit sending and recipient review.
6. **Responsive checks:** owner should verify RO/EN at narrow and wide widths, keyboard focus, expanded tables, long names and form errors after deploying. No local server was started, so the edited pages have not received signed-in browser verification.

Billing, REGES connection, GDPR execution procedures and real email delivery retain their separate roadmap requirements. SAP remains paused.

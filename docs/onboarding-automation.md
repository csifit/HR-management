# Employee onboarding and attendance rollout

Implemented locally on 23 September 2026. No production migrations, emails or deployment were performed by this change.

## Deploy in order

1. Check the existing remote migration/schema state. The user reported 008–010 applied; do not reapply them or repair history blindly. Apply **011 employee invitations**, then **012 attendance and contract review**, before deploying the updated frontend.
2. In Supabase Auth → URL configuration, allow `https://www.mkdir.space/auth/confirm?next=/join`. For local tests also allow `http://localhost:3000/auth/confirm?next=/join`. The separate production config includes both; never push the root localhost auth config to production.
3. Confirm Vercel has the app's SMTP settings and `NEXT_PUBLIC_SITE_URL=https://www.mkdir.space`. Local MXroute TLS/login passed; Vercel and actual delivery are separate checks. Supabase's registration-confirmation email service is configured separately from app invitations.
4. Deploy and check the screens using the user's own dev server or deployed site. No server should be started or stopped by the assistant.

## Manual acceptance checks

Use a dedicated test company and an email address you control. Creating a test employee through the app will now send a real invitation; do not use a real employee as an unannounced test recipient.

- Logged out: `/` shows the product overview and €2/employee/month price. Logged in: `/` continues to the dashboard. The separate discovery page still has no inbound navigation link.
- Add an active/onboarding employee. Confirm the profile displays an onboarding checklist, invitation result and expiry. Mail failure must leave the employee intact. The send-new-invitation action replaces the previous invitation; revocation prevents acceptance. Do not repeatedly resend uncertain sends without checking the provider.
- Open the invitation; register/sign in with the same verified email, accept it, and confirm only employee privileges and own records are available. A different or unconfirmed email, expired/revoked invitation, active offboarding or conflicting elevated role must not join. Existing MFA remains enforced.
- In the compact checklist, complete/reopen a task; verify the full checklist agrees. Completion is an HR attestation, not government transmission or a payroll action.
- Add one applicable contract, for example four hours/day. Completed working weekdays before today in Europe/Bucharest automatically show four worked hours. Today/future days remain planned. A configured holiday has no automatic work. Save a manual two-hour correction and verify it remains two.
- Approve leave on an automatic day: worked hours become zero and link to the request. HR cancellation restores automatic hours. Existing conflicting manual records still need correction first; approved-leave days are corrected through the leave workflow.
- Review the current contract in the employee's Contract tab. Edit salary/hours or any other contract field; HR review must become required again. The REGES connector still cannot send.
- Prepare benefits: automatic days count, appear as a review flag, and changes invalidate draft approval. Previously approved months keep their saved totals.

## Operational boundaries

Automatic attendance is a read-time calculation, not a clock event or immutable attendance ledger. It needs a unique applicable active contract, or a dated terminated contract for historical work, and eligible employee status. Suspensions and historical changes are not reconstructed. HR must correct unrecorded absences; contract/calendar edits can change unoverridden history. No time zone other than Europe/Bucharest determines the elapsed-day cutoff. Without a unique contract the legacy planning fallback is eight hours, but no automatic worked hours are assumed.

New employee invitations are attempted once in the app creation action. The database queues invitations even for direct API inserts, but no background SMTP worker exists. Interrupted/failed sends stay visible for explicit HR action. The invitation UUID alone grants nothing: the database checks the current verified email, expiry, pending status, MFA, organisation/employee status, membership conflicts and offboarding before creating employee-only access. No service-role key is required or exposed. The migration does not email existing staff.

Contract review approves the displayed contract revision only. Future REGES queue creation must enforce a current review and separately freeze/review all mapped employee/employer payload fields. Review is not proof of legal validity, transmission or REGES acceptance.

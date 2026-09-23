# Subscription proposal — no live billing yet

Recommended: one Stripe customer and monthly subscription per organisation, billed at **€2 × billable employee count**, with a 30-day trial. Collect one company payment, not one charge per employee. Use hosted Checkout to collect a card and the customer portal for payment-method changes and cancellation. Card data stays with Stripe. Larger customers can later use a supported invoice/bank-payment workflow.

**User decision, 23 September 2026: SAGA issues the official customer invoices. Stripe collects payments.** No SAGA integration/export format or account has been configured by this change.

## Different organisations and monthly totals

Create one recurring price, EUR 2 per employee per month, and one subscription for each organisation. A subscription item has a quantity. Organisation A with 10 billable employees owes EUR 20; B with 35 owes EUR 70. If A has 14 billable employees for the next cycle, its next subtotal becomes EUR 28. These examples exclude tax, discounts and fees; they are not configured live prices.

HRConnector determines the count from an agreed rule and stores an immutable period snapshot. Stripe does not query the HR database or discover new employees. A server process sets or schedules the quantity for the intended next billing period and checks the resulting invoice before collection. Updating quantity normally creates prorations; use the agreed no-proration behavior for the user's full-month rule. Do not rely on a midnight best-effort update that can race invoice creation: implement a durable schedule/reconciliation process and test the invoice lifecycle.

At renewal Stripe creates the billing record and attempts the saved payment method under the customer's recurring-payment authorisation. It can still fail or require bank authentication; HRConnector must handle those events and payment confirmation securely. Only verified payment events mark a period paid, never a browser redirect or quantity update. Stripe payouts to Cozumel's bank may aggregate multiple collections and subtract fees; a payout is not the same record as one customer's invoice payment.

## SAGA and Stripe reconciliation

Stripe Billing creates internal invoice objects even when SAGA is used for the official invoice. Keep Stripe invoice email/PDF presentation and portal invoice history configured consistently with the SAGA workflow; keep payment-failure/authentication notifications available. Do not enable customer quantity editing: billable counts belong to HRConnector. Use a payment-method/cancellation portal and present official SAGA invoices through the chosen invoicing process.

For each period retain organisation ID, billable-count snapshot, unit price, service period, tax/currency/rounding amounts, SAGA series/number, Stripe customer/subscription/invoice/payment IDs and status. Reconcile the gross customer payment to the SAGA invoice; book processing fees and payout settlements separately. Coordinate credit notes, refunds, disputes and failed payments without issuing duplicate revenue invoices.

Agree whether the €2 price includes VAT and whether customers are charged EUR or RON. If SAGA computes tax/conversion, Stripe's collectible total must match the approved SAGA total; avoid independent competing tax calculations. Exact SAGA import/API capabilities and Romanian invoicing/e-Factura treatment need verification with the user's setup/accountant. This document makes no claim that hiding a Stripe PDF alone determines its legal/accounting status.

An alternative is Stripe Payments with individually created PaymentIntents against SAGA-approved totals, avoiding Stripe Billing invoices. That requires HRConnector to own recurring scheduling, saved-payment consent, reminders/retries and subscription state; it is more application work. Choose that architecture if eliminating Stripe Billing invoice objects is a firm requirement.

Preserve the user's full-month rule: an employee added during September first becomes billable in October. Snapshot the billable population at each monthly boundary, retain it with the invoice and change quantity without mid-month proration. Before implementation, confirm whether staff count means active employees only, how suspended/leaving staff count, the first paid invoice after trial, currency/VAT treatment, any minimum monthly invoice and the grace period for failed payments. These are business decisions, not defaults already accepted.

Use verified webhooks, idempotency keys and a durable subscription/invoice ledger. Do not trust a Checkout success redirect as proof of payment. Failed payment should trigger a documented grace/read-only policy, never automatic deletion of HR data. Subscription cancellation, company blocking and legal data retention remain separate actions.

SAGA remains responsible for the user's official invoicing workflow, with the accountant confirming applicable Romanian/RO e-Factura obligations. Stripe receipts alone should not be assumed to satisfy every local invoicing obligation. Payment fees, VAT and invoicing integration costs affect the €2 price; verify actual account pricing before launch.

References: [Stripe subscription quantities](https://docs.stripe.com/billing/subscriptions/quantities), [prorations](https://docs.stripe.com/billing/subscriptions/prorations), [customer portal](https://docs.stripe.com/customer-management).

Further implementation references: [subscription lifecycle](https://docs.stripe.com/billing/subscriptions/overview), [webhooks](https://docs.stripe.com/billing/subscriptions/webhooks), [portal quantity/invoice-history controls](https://docs.stripe.com/customer-management/configure-portal), [payment-failure/authentication emails](https://docs.stripe.com/billing/revenue-recovery/customer-emails).

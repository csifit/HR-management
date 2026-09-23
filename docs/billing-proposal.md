# Subscription proposal — no live billing yet

Recommended: one Stripe customer and monthly subscription per organisation, billed at **€2 × billable employee count**, with a 30-day trial. Collect one company payment, not one charge per employee. Use hosted Checkout to collect a card and the customer portal for payment-method changes, invoices and cancellation. Card data stays with Stripe. Larger customers can later use a supported invoice/bank-payment workflow.

Preserve the user's full-month rule: an employee added during September first becomes billable in October. Snapshot the billable population at each monthly boundary, retain it with the invoice and change quantity without mid-month proration. Before implementation, confirm whether staff count means active employees only, how suspended/leaving staff count, the first paid invoice after trial, currency/VAT treatment, any minimum monthly invoice and the grace period for failed payments. These are business decisions, not defaults already accepted.

Use verified webhooks, idempotency keys and a durable subscription/invoice ledger. Do not trust a Checkout success redirect as proof of payment. Failed payment should trigger a documented grace/read-only policy, never automatic deletion of HR data. Subscription cancellation, company blocking and legal data retention remain separate actions.

Ask the accountant how Romanian invoicing/RO e-Factura obligations apply to the operating company. Stripe receipts alone should not be assumed to satisfy every local invoicing obligation. Payment fees, VAT and invoicing integration costs affect the €2 price; verify the actual Stripe account pricing before launch.

References: [Stripe subscription quantities](https://docs.stripe.com/billing/subscriptions/quantities), [prorations](https://docs.stripe.com/billing/subscriptions/prorations), [customer portal](https://docs.stripe.com/customer-management).

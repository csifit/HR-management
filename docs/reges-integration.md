# REGES preparation

Reviewed 23 September 2026. `/integrations/reges` lets a company owner save the employer and user/author UUIDs copied from REGES. HR can read them; other roles cannot. Both identifiers must be provided or cleared together. These are identifiers, not credentials; no access token is accepted or stored and no connection/submission is claimed.

The [official employer guide](https://reges.inspectiamuncii.ro/ajutor/ghid-utilizare-aplicatie-angajator/setari-angajator/setari-angajator-utile/) describes obtaining identifiers and external-system credentials. The [developer repository](https://github.com/reges-ro/integrare) describes company-scoped access, queued messages, initial receipts and later processing results. A receipt must never be displayed as final acceptance.

Before enabling a production adapter:

1. Pin and validate the official schema and nomenclatures; assess required employee/contract fields missing from the current HR model. Do not manufacture CNP, address, employment or occupation data.
2. Implement server-only envelope encryption, key rotation, credential replacement/revocation and an audit trail before accepting tokens. No credentials in browser bundles, public environment variables or plain table columns.
3. Verify authorised company access in the official test environment. Keep endpoint allowlists and test/production credentials separate; no arbitrary destination URLs.
4. Use a tenant-scoped PostgreSQL outbox with immutable reviewed payloads, unique message IDs, ordered submission, bounded retries and receipt/result correlation. Resolve unknown submission outcomes before retrying.
5. Reconcile external employee/contract IDs and asynchronous results, including related results. Expose failures with redacted messages and preserve audit history.

The adapter currently rejects submission. No mock success, live government transmission or token exchange is implemented.

Migration 012 adds HR contract review in the employee's Contract tab. The database records the reviewer, time and `review_version`; every contract edit increments that version and makes the old review stale. Only owners/HR can approve, including through direct RPC calls. Review is not transmission or REGES acceptance. When building the outbox, require a current review inside the same transaction that freezes the outgoing payload; changes to any mapped employee/employer data must also invalidate payload approval. Do not rely on a hidden button or this contract-only review to approve a future payload containing additional data.

# Sales receipt evidence — Step 1

## What is retained
`parse-receipt` captures the original parsed AI field values on the server before client normalization, together with the SHA-256 of the input file, model/version, MIME type, actor and extraction timestamp. Binary files are not stored in these tables. Scan IDs are ephemeral client metadata; financial payloads stay unchanged.

After a successful sales insert, a background call binds that scan to the saved row ID. The service-only `capture_sales_scan_example` RPC atomically reads the actual saved row, copies its original receipt storage reference, and computes all field differences (including dates, venue, totals and delivery tenders). Snapshot creation is tenant/venue scoped, requires the scan's actor and the existing admin/manager sales-write role, and is idempotent per scan + saved row. All three evidence tables are append-only. No production financial rows are changed or backfilled.

## Trust
- `human_saved_unverified`: the user pressed Save; this is NOT proof of document support or proof of human authorship. Differences can also arise from normalization, arithmetic or accepted Bani suggestions.
- `missing_reference`, `upload_unavailable`, `hash_mismatch`: audit-only examples with absent or unusable source links.
- `hash_matched`: uploaded bytes match scanned bytes, but extracted/saved values are still NOT independently verified.
- `independently_verified`: retrieval-only derived state; requires a separate source attestation by someone other than the saver, matching values and field-specific document evidence for every saved field, matching source hash, and a currently available unchanged receipt. No client, model or Step 1 endpoint can write attestations or promote trust.

`retrieveSalesEvidence` returns at most three usable examples from a bounded pool of twenty recent independently attested candidates within the same tenant and venue. A discernible report structure is preferred when supplied; the current extractor supplies no reliable structure descriptor, so it remains null. Retrieved examples carry document paths, extraction metadata and verification provenance, never substitution rules. The helper is exposed by explicit `retrieve_evidence`, but is NOT called by scan/review prompts in Step 1. Legacy learned rules and Bani notes remain untouched.

## Limits and rollback
Capture is best-effort and does not fail Save; a failed extraction audit yields a null scan ID, and failed post-save capture has no durable retry queue. Abandoned scans retain extraction-only provenance, inaccessible to client reads. Later edits of saved sales do not rewrite the immutable snapshot. Existing attachment replacement/deletion can invalidate a source link; retrieval rechecks its bytes and excludes it. Step 1 does not harden the legacy receipt bucket's broad authenticated access policy or retrofit tenant-prefixed historical paths; new evidence endpoints never return another tenant's references.

No independent verification workflow, reliable POS/layout detection, prompt opt-in, historical backfill, batch scan, posting or autonomous corrections is implemented. Roll back application integrations and function deployment to stop capture; additive unused evidence tables can remain without affecting existing flows. Removing append-only data/schema requires a separately approved retention migration.
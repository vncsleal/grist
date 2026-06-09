---
"@vncsleal/quillby": patch
---

Fix: SSRF protection — replace raw http.get with safeFetch for content extraction, pass URL to Readability.
Fix: orphan job concurrency — seed activeJobCounts from recovered jobs on restart.
Fix: fire-and-forget generation — catch sync errors, mark job failed on crash.
Fix: remove billing.ts from local mode tsconfig (false dependency on database packages).
Fix: fix readonly mutation workaround in ProviderRouter (private readonly → private opts).
Fix: billing type error (row.plan cast to union) and cloud app build no-op (empty stub).
Fix: ssrf test message mismatch.
Site: fix 4 astro check errors (z import path, dynamic translation keys, unused import, content component types).
Site: add Umami analytics with privacy-first cookie notice compliance.

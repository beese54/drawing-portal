# Security Audit — Schematic Drawing Portal

Audit type: static, read-only source code review (Pattern E protocol). No
exploit payloads were run; nothing was executed against the live
`wsi-drawing-portal.pub.gov.sg` deployment. Every verdict below cites a
`file:line` or an explicit statement of what could not be checked from the
repo alone.

## Phase 0 — Scope, Assets, Trust Boundaries

**Scope:** the full `drawing-portal` repo as of this session — `backend/app/`
(FastAPI: routers, services, schemas, models, compliance-check agents),
`frontend/src/` (React/Vite/Konva), `Dockerfile`, `docker-compose.yml`,
`k8s/`, `.github/workflows/docker-publish.yml`, `backend/airbase.json`,
`frontend/airbase.json`, `.env.example` files.

**Assets an attacker would want:**
- **Availability of the single running instance** — the app is hard-locked
  to `replicas: 1` (`k8s/storage/persistentvolumeclaim.yaml` is
  `ReadWriteOnce`), so there is no redundancy to fall back on.
- **Integrity of the shared custom-symbol library** — a `ReadWriteOnce` PVC
  (`k8s/app/deployment.yaml:34-36`) all users share; no per-user ownership
  concept exists.
- **The GHCR image / build pipeline** — a supply-chain asset; the image is
  publicly, anonymously pullable.
- **User-submitted feedback text and uploaded schematic images** — low
  sensitivity by design (no accounts, no PII fields), but free-text fields
  could incidentally contain PII, and schematics describe premises' water
  infrastructure for a national utility.
- Notably **absent** as assets: there is no database, no user-account
  system, no stored credentials, and no payment/financial data anywhere in
  this app — this materially shrinks the usual blast radius.

**Trust boundaries (numbered — referenced by number in later phases):**

| # | Boundary | Direction |
|---|----------|-----------|
| 1 | `POST /api/evaluate` — `metadata_json` + optional JPEG upload | public → backend |
| 2 | `POST /api/export/docx` — `manifest_json` + multiple crop uploads | public → backend |
| 3 | `POST /api/feedback` — JSON body | public → backend |
| 4 | `GET /api/symbols` — manifest read | public → backend |
| 5 | `GET /api/symbols/{id}/image` — file read | public → backend |
| 6 | `POST /api/symbols` — file upload (SVG/PNG) + name | public → backend → shared PVC |
| 7 | `PATCH /api/symbols/{id}` — rename | public → backend → shared PVC |
| 8 | `DELETE /api/symbols/{id}` — delete | public → backend → shared PVC |
| 9 | `GET /api/health` — liveness/readiness | public → backend |
| 10 | Static file mount at `/` (built frontend) | public → backend |
| 11 | Backend → Slack webhook (`feedback.py`) | backend → third party (URL is admin-configured, not user-controlled) |
| 12 | Client-side `.json` schematic import (`useJsonImport.ts`) | local file → browser only, no network hop |
| 13 | GitHub Actions → GHCR publish (`docker-publish.yml`) | CI → registry (supply chain) |
| 14 | GHCR → GovPaaS/Northflank image pull | registry → runtime (supply chain) |

## Phase 1 — Requirements Traceability Matrix

No security spec/ticket exists for this project. **[ASSUMED BASELINE]**
generated for a publicly-exposed FastAPI+React app handling file uploads for
a government agency — proceeding with it per protocol rather than blocking,
but it needs sign-off.

| Req ID | Requirement | Enforced where | Evidence | Status |
|---|---|---|---|---|
| R1 | State-changing endpoints require authn/authz | — | No `Depends()` auth guard anywhere in `backend/app/routers/*.py`; no auth middleware in `main.py` | **MISSING** |
| R2 | File uploads validated before persistence | `symbol_service.py:32-50` | Extension/MIME/size/script-blocklist checks on `POST /api/symbols` only | **PARTIAL** — `export.py:34` crops and `evaluate.py:85` schematic image have zero validation |
| R3 | No hardcoded secrets / secrets not logged | `Dockerfile:28-29` | Grep for `API_KEY\|SECRET\|password\|token` across `backend/` found only placeholder values in `.env.example`; Dockerfile comment confirms runtime injection | **ENFORCED** |
| R4 | CORS restricts cross-origin access | `main.py:12-32` | `allow_origins=["*"]` (line 14) plus a second `force_cors` middleware (lines 26-32) that unconditionally overwrites the header to `*` — `settings.origins_list` (`config.py:39-40`) is defined but never referenced anywhere | **MISSING** |
| R5 | Rate limiting protects write/compute endpoints | — | No rate-limiting library in `requirements.txt`; no throttling code found | **MISSING** |
| R6 | Input size/array-length limits prevent algorithmic/memory DoS | `evaluate.py:41-59` | `_validate_metadata` checks shape (is-list, has `id`) but not length; `export.py:34` crops list uncapped | **MISSING** |
| R7 | Uploaded content can't execute script when served back | `symbol_service.py:46-50` | Blocklist regex for `<script`, `on\w+=`, `javascript:` — not an allowlist; `<foreignObject>`/external `<use href>` vectors untested | **PARTIAL** |
| R8 | Filename/path handling prevents traversal | `symbol_service.py:20-28,94-105` | `symbol_id` resolves via manifest lookup (`find_symbol`), never a raw filesystem join from user input; stored filenames are server-generated (`slug_uuid.ext`, lines 52-56) | **ENFORCED** |
| R9 | Errors don't leak stack traces/internals to clients | whole app | No `debug=True` on `FastAPI()` (`main.py:10`); no custom exception handler found that would echo internals; default Starlette behavior returns a generic 500 | **ENFORCED** |
| R10 | Container runs as non-root | `Dockerfile:32-34` | `groupadd`/`useradd --system` + `USER app` before `CMD` | **ENFORCED** |
| R11 | Dependencies tracked/scanned for CVEs | — | `requirements.txt` exact-pins mid-2024 versions (`fastapi==0.111.0`, `python-multipart==0.0.9`); `.github/workflows/docker-publish.yml` has no SCA/audit step; no Dependabot config found | **MISSING** |
| R12 | Health endpoint doesn't leak sensitive info | `health.py:7-9` | Returns only `{"status","version"}`, no dependency/secret data | **ENFORCED** (version disclosure noted as trivial, see F7) |
| R13 | Audit logging exists for state-changing actions | — | No request logging middleware; no identity concept exists to log in the first place | **MISSING** |
| R14 | Transport encrypted end-to-end (TLS) | outside repo | TLS terminates at GovPaaS/Cloudflare edge — not represented in source | **N/A** — cannot verify from this repo, see Residual Risk |
| R15 | Service tolerates a crash without irrecoverable data/availability loss | `k8s/app/deployment.yaml:27-33`, `k8s/storage/persistentvolumeclaim.yaml` | `replicas: 1` hard-constrained by the RWO PVC; 256Mi memory limit; a crash/OOM = full outage until pod restarts, though on-disk manifest/PVC data itself survives a restart | **PARTIAL** |

**Disposition column intentionally left blank** — every MISSING/PARTIAL row
needs either a fix or an explicit written risk acceptance from you before
this audit can be considered closed. No row should be silently left open.

## Phase 2 — Boundary Sweep

For each boundary: injection · authn · authz · deserialization · SSRF/open
redirect · secrets · sensitive-data exposure.

**#1 `POST /api/evaluate`**
- Injection: clean — no SQL/shell/template use; JSON parsed via `json.loads`, dict access only.
- Authn: **MISSING** — no caller identity established.
- Authz: N/A — no per-resource ownership model exists to check.
- Deserialization: clean — plain `json.loads` into dicts, no `pickle`/`yaml.load`/custom deserializers.
- SSRF/redirect: clean — no URLs accepted from this input.
- Secrets: clean — nothing secret handled here.
- Sensitive-data exposure: clean on response; **but see F2** — no size/length cap on `metadata_json`'s `elements`/`pipes` arrays (`evaluate.py:41-59`), and `build_adjacency` (`graph_utils.py`) is O(n²) over them.

**#2 `POST /api/export/docx`**
- Injection: clean — `python-docx` API calls only, no shell/template injection.
- Authn: **MISSING**.
- Authz: N/A — nothing persisted server-side (`export.py`'s own docstring confirms this by design).
- Deserialization: clean — `json.loads` into a list of dicts, type-checked (`export.py:37-41`).
- SSRF/redirect: clean.
- Secrets: clean.
- Sensitive-data exposure: **PARTIAL** — `crops: list[UploadFile] = File(default=[])` (line 34) has no count or per-file size cap; every crop is read fully into memory (line 43) before any check.

**#3 `POST /api/feedback`**
- Injection: clean — Pydantic-validated fields (`FeedbackSubmission`, `feedback.py:27-32`), only used in an f-string sent to Slack and `print()`.
- Authn: **MISSING** (low impact here — this endpoint is meant to be open).
- Authz: N/A.
- Deserialization: clean — Pydantic model.
- SSRF/redirect: clean — the Slack webhook URL is admin-configured (`settings.slack_feedback_webhook_url`), not attacker-controlled, so this is not an SSRF vector.
- Secrets: clean — webhook URL itself isn't echoed back or logged.
- Sensitive-data exposure: low — free-text fields (`confusion`, `wished_features`) are printed to stdout and posted to Slack verbatim; if a submitter pastes PII, it lands in both places. Whether the Slack workspace/log stream has adequate access control is outside repo visibility (Residual Risk).

**#4/#5 `GET /api/symbols`, `GET /api/symbols/{id}/image`**
- Injection/path traversal: clean — `symbol_id` is resolved through `find_symbol()` against the manifest, never joined raw into a filesystem path.
- Authn/authz: **MISSING**, but this is read-only public data by design (symbol library is meant to be visible) — low severity here specifically.
- Deserialization: clean.
- SSRF/redirect: clean.
- Secrets: clean.
- Sensitive-data exposure: **the endpoint's `media_type` is driven by the file's own extension** (`symbols.py:42-43`), served as `image/svg+xml` for SVGs — this is what makes F4 (stored XSS) reachable by direct navigation.

**#6/#7/#8 `POST/PATCH/DELETE /api/symbols/{id}`**
- Injection: clean.
- Authn: **MISSING** — zero authentication on any of the three.
- Authz: **MISSING** — no ownership model exists, so any caller can rename or delete any custom symbol; only the `category == "default"` check (`symbol_service.py:99-100`) prevents deleting the built-in set. This is the highest-severity finding (F1).
- Deserialization: clean — `UploadFile`/Pydantic models only.
- SSRF/redirect: clean.
- Secrets: clean.
- Sensitive-data exposure: clean beyond F4.

**#9 `GET /api/health`** — clean on every category except trivial version disclosure (F7).

**#10 Static mount `/`** — clean; `StaticFiles` serves only the built `dist/`, mounted last so it can't shadow `/api/*` (`main.py:40-45`).

**#11 Backend → Slack webhook** — see #3; not attacker-reachable as an SSRF vector since the URL is server-configured.

**#12 Client-side JSON import** — browser-local only; malformed files are caught (`useJsonImport.ts:129-131`) and only affect the importing user's own session — clean from a server-trust-boundary perspective.

**#13/#14 CI/CD → GHCR → GovPaaS** — `docker-publish.yml` permissions are minimally scoped (`contents: read`, `packages: write`, line 9-11) and uses the ephemeral `GITHUB_TOKEN`, not a long-lived PAT — clean. The image itself being anonymously public (F-adjacent, not scored as a standalone finding — see Residual Risk) is a supply-chain exposure worth a decision, not a code defect.

**Cross-cutting checks:**
- **Crypto usage:** none in this app — no password hashing, no signing, no custom crypto to review. Clean by absence.
- **Dependency risk:** requirements.txt and package.json versions were read but **not** checked against a live CVE database in this pass (see Residual Risk) — treat R11/F6 as the actionable item here, not a specific CVE claim.
- **Unsafe defaults:** wildcard CORS (F3) is the standout; no debug flags found; container runs non-root (good).

## Phase 3 — Adversarial Trace

**Scenario A — Unauthenticated wipe of the shared symbol library**
`GET /api/symbols` (no auth) enumerates every symbol ID → for each non-default
ID, `DELETE /api/symbols/{id}` (no auth) → `symbol_service.delete_symbol`
(`symbol_service.py:94-109`) unlinks the file and rewrites `manifest.json`
with zero ownership or rate check. **Not stopped anywhere.** Fully
scriptable, would take seconds to empty the shared custom library for every
user of the portal, with no log of who did it (F5).

**Scenario B — Stored XSS via a crafted custom SVG**
`POST /api/symbols` with a `.svg` payload crafted to avoid the literal
strings `<script`, `javascript:`, and the `on\w+=` regex (e.g. via
`<foreignObject>`/CSS `@import`, or whitespace/case tricks) →
`symbol_service.create_symbol`'s blocklist (`symbol_service.py:46-50`) is
the only gate → if it doesn't match, the file is written and served at
`GET /api/symbols/{id}/image` as `image/svg+xml` → **anyone who navigates
directly to that URL** (not just the Konva `<img>` rasterization path the
app itself uses) would execute the payload in the app's own origin. This
trace is **plausible, not proven** — no bypass payload was constructed or
tested, per the no-exploit rule. Flagging as a real gap in the sanitization
approach (blocklist vs. allowlist) regardless of whether a working bypass
exists today.

**Scenario C — Single-replica DoS via unbounded compute requests**
`POST /api/evaluate` with a `metadata_json` containing tens of thousands of
synthetic `elements`/`pipes` entries (each only needs a non-empty `id` to
pass `_validate_metadata`, `evaluate.py:50-59`) → `build_adjacency`
(`graph_utils.py`) and each of the 8 compliance-check agents iterate the
same lists → CPU/memory spike on the sole instance (`0.5 vCPU` / `256Mi`
limit, `k8s/app/deployment.yaml:27-33`) → OOM-kill → readiness probe fails
→ full outage, since `replicas: 1` is a hard requirement of the RWO PVC and
there is no fallback instance. **Stopped nowhere in application code** —
only the platform resource limit exists, and it bounds the blast radius to
"this pod crashes" rather than preventing the crash. Trivially repeatable,
no auth or rate limit required.

## Phase 4 — Report & Gate

### Findings, ranked by severity

**Current status (refreshed 2026-10-13).** The list below is the original
2026-07-31 audit text. Here is where each finding stands now; details are in
the Remediation Log further down.

| Finding | Status |
|---|---|
| F1: no auth on destructive endpoints | **Resolved.** An admin key was added (2026-07-31), then the symbol write API was removed entirely (`01c1265`). No state-changing endpoint remains. |
| F2: unbounded compute endpoints (DoS) | **Mitigated.** Request, field, image, crop and row-count caps (`c73cd7e`, `1e55132`), the pre-parse size cap (R-01), F9–F13. Rate limiting is still platform-side and not configured. |
| F3: open CORS, dead config | **Fixed in 1.1.2.** Cross-origin access is off unless `ALLOWED_ORIGINS` lists an origin, the `*` fallback is deleted, and methods are limited to GET/POST. Browser-verified. |
| F4: SVG upload blocklist sanitiser | **Moot.** The upload API was removed (`01c1265`); symbols ship in the image. `nosniff` still guards a future committed SVG. |
| F5: no audit logging / identity model | **Open, reduced.** No state-changing actions remain to attribute. Access logging is uvicorn's default only. |
| F6: no dependency scanning in CI | **Fixed.** `deps:audit` on every push and weekly (R11 closed), plus container scanning of OS and Python packages. |
| F7: version disclosed on `/api/health` | **Accepted**, and extended with the commit (the repo is public). |
| F8: dead API-key references in `.env.example` | **Fixed.** Removed (`d5094e7`); none remain. |
| F9–F13 | **Fixed** (see the Remediation Log). |

**CRITICAL**
- **F1 — No authentication/authorization on any endpoint, including destructive ones.** Category: authn/authz. Files: `backend/app/routers/symbols.py:47-79`, `backend/app/main.py` (no auth middleware anywhere). Attack scenario: A. Remediation: add an auth layer (API key, JWT, or SSO depending on intended users) in front of at minimum `POST/PATCH/DELETE /api/symbols`, enforced via FastAPI `Depends()`; alternatively use a GovPaaS/Northflank path-based access policy restricting just those methods/path (this exact fix was already identified in an earlier session and never implemented).

**HIGH**
- **F2 — Unbounded, unauthenticated compute endpoints enable trivial single-replica DoS.** Category: unsafe defaults / missing limits. Files: `backend/app/routers/evaluate.py:41-59`, `backend/app/routers/export.py:33-43`, `backend/app/agents/graph_utils.py`, `k8s/app/deployment.yaml:27-33`. Attack scenario: C. Remediation: cap array lengths in `_validate_metadata` and crop counts/sizes in `export.py`; add per-IP rate limiting (app-level via e.g. `slowapi`, or platform-level).
- **F3 — CORS is fully open and a config setting for it is dead code.** Category: unsafe defaults. Files: `backend/app/main.py:12-32`, `backend/app/config.py:14,39-40`. Remediation: wire `CORSMiddleware` to `settings.origins_list` instead of `"*"`; scope `force_cors` down to only the symbol-image path its own comment says it's for.

**MEDIUM**
- **F4 — SVG upload sanitization is a blocklist, not an allowlist.** Category: input validation / stored content risk. Files: `backend/app/services/symbol_service.py:46-50`, `backend/app/routers/symbols.py:39-44`. Attack scenario: B (unverified). Remediation: use a real SVG sanitizer or server-side re-render instead of pattern matching; consider `Content-Disposition: attachment` on the image endpoint.
- **F5 — No audit logging or identity model for any state-changing action.** Category: accountability. Files: whole backend. Remediation: log source IP + timestamp + action minimum; becomes natural once F1 is fixed.
- **F6 — No dependency-vulnerability scanning in CI.** Category: dependency risk. Files: `.github/workflows/docker-publish.yml`, `backend/requirements.txt`. Remediation: add `pip-audit`/Dependabot and `npm audit` to CI.

**LOW**
- **F7 — `/api/health` discloses app version to unauthenticated callers.** File: `backend/app/routers/health.py:9`. Remediation: optional, low value target.
- **F8 — Dead `OPENAI_API_KEY`/`TOGETHER_API_KEY` references in `.env.example` for features not present in code.** File: `backend/.env.example:6,10`. Remediation: remove until actually implemented; avoid provisioning unnecessary secrets.

### Traceability matrix
See Phase 1 above — 15 rows, 6 with open MISSING/PARTIAL status needing a
Disposition (fix or explicit risk acceptance) before this audit can close.

### Residual risk — what this audit could NOT verify

This is a **source-code-only** review. The following are real, material gaps
that need to be covered by someone with access to the live system/platform —
not by static code reading:

1. **Live network/TLS posture** of `wsi-drawing-portal.pub.gov.sg` (cipher
   suites, HSTS, certificate configuration) — set at the GovPaaS/Cloudflare
   edge, invisible from this repo.
2. **GovPaaS/Northflank platform-level access controls** — IP allowlisting,
   WAF, DDoS protection, whether the public-expose setting has any
   additional gating — configured in the platform UI, not in source.
3. **Cloudflare zone configuration** for the delegated
   `wsi-drawing-portal.pub.gov.sg` subzone (WAF rules, edge rate limiting,
   bot management) — outside this repo and outside this user's own admin
   access (delegated to PUB's WOG DNS liaison).
4. **GHCR registry access policy** — the image is currently anonymously
   public; whether that's acceptable long-term for a gov deployment is a
   decision, not a code defect.
5. **Runtime secrets management** on the actual GovPaaS platform — how
   `SLACK_FEEDBACK_WEBHOOK_URL` etc. are stored/rotated at runtime; the
   Dockerfile comment states they're "injected at runtime" but the
   mechanism itself isn't visible from source.
6. **Actual dependency CVE status** — `requirements.txt`/`package.json`
   versions were read, but not checked against a live CVE feed as part of
   this pass (see F6). *Update 2026-10-09: backend Python deps audited and
   fixed (see Remediation Log, F6 / R11); `package.json` still unaudited.*
7. *Update 2026-10-09: automated DAST and property-based fuzzing now exist
   (see Remediation Log, "Dynamic security testing"); the rest of this item
   stands.* **Dynamic/runtime behavior** — no fuzzing, no live scanning, and no
   exploit attempts (including the plausible-but-unverified SVG XSS bypass
   in F4/Scenario B) were performed against the running deployment. Real
   penetration testing of a `pub.gov.sg` asset should go through a
   CSA-licensed PT provider per Singapore's Cybersecurity Act, and/or PUB's
   own VAPT process — not an AI code review.
8. **Physical/organizational security, incident response process, and
   backup/DR posture** for the PVC-backed symbol data — not represented in
   code at all.
9. **Container sandboxing beyond what's requested in the k8s manifests**
   (gVisor, seccomp profiles, etc.) — depends on what GovPaaS's own node
   configuration actually provides.

## Remediation Log

### F1 / R1 — FIXED (2026-07-31)
Added `require_symbols_admin_key` (`backend/app/routers/symbols.py:13-18`), a
`Depends()` guard checking an `X-Admin-Key` header against a new
`SYMBOLS_ADMIN_KEY` env var (`backend/app/config.py:17`), applied to
`POST`/`PATCH`/`DELETE /api/symbols*` only — `GET` endpoints stay
unauthenticated by design (public read-only symbol library). **Fails
closed**: with no key configured, the endpoints return 401 unconditionally
rather than defaulting open. Confirmed no frontend code calls the three
mutated endpoints (`frontend/src/api/client.ts`'s `symbolsApi` only exposes
`list`/`getImageUrl`) — this feature had no UI, so gating it has zero
user-facing impact. Verified locally: `GET` unauthenticated → 200;
`DELETE`/`POST`/`PATCH` with no key, wrong key, and no key configured at
all → 401; `DELETE` with the correct key → passes the gate (404 on a
nonexistent id, proving it reached the handler). `SYMBOLS_ADMIN_KEY` still
needs to be set in the GovPaaS console's env vars for the live deployment —
not yet done as of this log entry.

Scenario A (Phase 3) is now stopped at this dependency. R1 status upgraded
from MISSING to **ENFORCED** for the three mutating symbol routes; the
other MISSING/PARTIAL rows (R2, R4, R5, R6, R7, R11, R13, R15) remain open
pending fixes or explicit risk acceptance.

### F9 — Unhandled exceptions on type-confused input — FIXED (2026-10-09)
**New finding, not in the original audit.** `_validate_metadata` checked the
top-level shape and the size caps, but not the types of nested fields. A
document that is valid JSON with a wrong nested type (`"ports": "xy"`, an id
given as a list, text where a number belongs) reached the compliance checks,
which index, hash, compare and do arithmetic on those fields without guards,
and returned **500**. Found in two steps: a hand probe found 5 such inputs on
`POST /api/evaluate`. Property-based fuzzing (5,000 mutations of realistic
documents per endpoint) then found **31 distinct crash sites**: 30 across
`graph_utils.py` and the compliance checks, and 1 in `POST /api/export/docx`,
where a control character in a row's text crashed python-docx. Severity Low:
responses never leak a stack trace (see R9), and one failed request does not
affect others. But any manual VAPT would find it in minutes.

Fix:
- `backend/app/services/metadata_schema.py`: a strict Pydantic schema of
  every field the checks read. It validates only, with no coercion, so the
  checks receive exactly the document that passed. Unread fields pass
  through. Numbers are finite and bounded.
- `evaluate.py` returns **422** on a type error, after the existing size caps.
- `export.py` strips XML-illegal characters before writing.

Verified:
- `backend/tests/test_fuzz_inputs.py`: the 5 regression cases, plus
  property tests asserting that no mutated document returns 5xx.
- Without the fix, 7 of its tests fail.
- After the fix, the exploration finds 0 crash sites in 5,000 fresh
  mutations per endpoint, run on the pre-upgrade dependency set.
- The CI fuzz tests (300 deterministic mutations per endpoint) also pass on
  the upgraded set (F6 / R11 below).
- A larger 20,000-mutation run was attempted but stopped before finishing
  (the host ran low on memory). Its result is not claimed.
- The schema does not reject real drawings: a payload built by the
  frontend's own `metadataBuilder.ts` (all 64 symbols plus dual-supply
  variants, every optional property filled) is kept as a test fixture and
  must return 200. Regenerate it with
  `tasks/repro/frontend_metadata_fixture.mjs`.

### F10 — Unhandled JSON parser errors — FIXED (2026-10-12)
**New finding, not in the original audit.** Found while planning black-box
fuzzing of the two POST endpoints. Both routers caught only
`json.JSONDecodeError` around `json.loads`. Two inputs raise something else:
- an integer literal over 4,300 digits: Python >= 3.11 raises a plain
  `ValueError` (the int-string conversion limit)
- nesting deeper than the decoder's recursion limit: `RecursionError`.
  The limit depends on the platform. Windows CPython 3.12 fails at 3,000
  levels; the production image (Linux, Python 3.12) still parses 8,000 and
  fails by 20,000. So in production this needs roughly 10k+ levels, which
  is about 20 KB of `[` and `]`.

Each returned **500** on both `POST /api/evaluate` and
`POST /api/export/docx`. Severity Low: both fail fast in the parser (no
resource exhaustion), no stack trace is returned, and other requests are
unaffected. F9's fuzzing missed it because its documents go through
`json.dumps`, which never produces either input.

Fix: both routers now catch `(ValueError, RecursionError)`, which covers
JSONDecodeError (a ValueError subclass), and return **422**.

Verified: 4 regression tests in `backend/tests/test_fuzz_inputs.py`
(2 inputs x 2 endpoints, sent as raw text). They fail without the fix and
pass with it. The full suite is 156/156.

### F11 — Lone surrogate echoed into the response — FIXED (2026-10-12)
**New finding.** Found by the new black-box suite (`test_blackbox_http.py`)
on a random 2,000-example run against a local server. An element's
`symbol_name` set to `"\ud800"` is valid JSON but not valid Unicode. It passed
validation, was echoed back in a compliance check's detail text, and the
response then failed UTF-8 encoding: **500** on `POST /api/evaluate`.
`/api/export/docx` was not affected: `_xml_safe` already strips surrogates.
F9's fuzzing missed it because Hypothesis's default text strategy never
generates surrogates. Severity Low (same reasoning as F9).

Fix: `evaluate.py` re-encodes the parsed document as UTF-8 right after
`json.loads`. A lone surrogate raises `UnicodeEncodeError` (a `ValueError`),
which the F10 handler turns into **422**. A valid escaped pair
(`😀`) decodes to one character and is still accepted (tested).
Cost: one extra serialisation of the already size-capped document.

### F12 — Infinite canvas dimension — FIXED (2026-10-12)
**New finding.** Found by the black-box suite in the simulated CI job,
against an image built from the F10/F11-fixed code. `"canvas": {"width_px":
1e999}` decodes to `inf`. `_safe_dimension` calls `int()` on it and caught
`TypeError`/`ValueError` but not `OverflowError`: **500**. The F9 schema
bounds element numbers but does not cover `canvas`. Severity Low.

Fix: `_safe_dimension` also catches `OverflowError` and falls back to the
default, as it already did for text and `NaN`.

Verified (F11 + F12): `test_fuzz_inputs.py` has 11 new regression tests.
8 of them fail without the fixes. The other 3 (a valid surrogate pair, and
`NaN` for each dimension) pass either way; they guard against the fix
over-rejecting. All 11 pass with the fixes. The black-box suite then passed 7/7
at 2,000 examples per test, with 0 server errors in the container log,
against an image built from the fixed tree.

### F7 — Version disclosure on `/api/health` — ACCEPTED, and extended (2026-10-12)
Release versioning (`docs/RELEASING.md`) needs the running pod to say which
build it is. `/api/health` now returns the release version *and* the git
commit. Accepted because:
- the repository is public, so the version and commit map to code anyone
  can already read
- dependency versions are pinned in that same public `requirements.txt`
- an operator being able to prove what is deployed is worth more here than
  hiding it

Revisit if the repository is made private.

### F6 / R11 — Dependency CVEs — FIXED for runtime Python deps (2026-10-09); CI gate still open
`pip-audit` (in a clean `python:3.12-slim`) against the pinned
`backend/requirements.txt` found **14 known vulnerabilities**, all in the two
packages that parse the public POST endpoints' form bodies:
- starlette 0.37.2: 7 vulnerabilities, including CVE-2024-47874 (unbounded
  in-memory form fields) and CVE-2025-54121.
- python-multipart 0.0.9: 7 vulnerabilities, including CVE-2024-53981.

Most are denial-of-service. Fixed by upgrading:
- fastapi 0.111.0 → 0.143.0
- starlette → 1.7.0, now pinned directly
- python-multipart → 0.0.32

`pip-audit` now reports *No known vulnerabilities found*. Pillow,
python-docx, uvicorn and pydantic were clean.

Upgrade side effect, handled: Starlette ≥ 0.40 caps each form field at 1 MB
by default. `metadata_json` legitimately exceeds that (base64 title-block
stamps, allowed up to 20 MB).
- `backend/app/services/form_limits.py` raises the cap to the largest app
  limit + 1 MB, so the app's own 413s still apply.
- A field larger than that is refused while it is still streaming.
- Tests cover both directions. The large-drawing test fails if the route
  class is removed.

~~**Still open (R11 stays PARTIAL):** no CI step re-runs `pip-audit` or
`npm audit`, so new advisories will not surface until someone runs them by
hand. Frontend `package.json` not audited in this pass.~~

**Update 2026-10-12: R11 CLOSED.**
- **Frontend audited.** 4 advisories were in runtime (browser-shipped)
  deps: axios and form-data (high), follow-redirects and dompurify
  (moderate). All fixed in range with `npm audit fix`: runtime audit is 0.
- **Dev/build-only advisories remain, reported but not blocking.** There
  are 11 packages, in vite 5 and typescript-eslint 7, which need major
  upgrades; tracked as their own task.
- **CI gate `deps:audit` on every push and weekly** (`ci/audit_gate.py`):
  - any pip-audit finding blocks
  - npm high or critical in runtime deps blocks
  - waivers need a reason and expiry date (`ci/audit-exceptions.json`)
  - a tool error fails the job instead of reading as clean
- **Verified to fail:** against the pre-fix lockfile it blocked on 13
  advisories.
- **Related: `symbolId` is now URL-encoded** in symbol image requests
  (`client.ts`). This came from triaging the SAST SSRF false positive.

### Secret detection and container scanning (2026-10-12)
- **`secret_detection`** runs on every push. A gate job fails the
  pipeline on any finding, because a secret on `main` is already public.
  Verified: 0 findings on the repo; a planted fake GitHub token is caught
  as Critical. GitHub push protection is the preventive control.
- **`container_scanning`** (Trivy) scans the GHCR image weekly, and is
  advisory. The first scan of 1.1.0 found 166 CVEs, all in Debian
  base-image packages (44 High), with a fix available for only one
  (liblzma5). No findings in Python packages.
  - A blocking gate would be permanently red, so findings are triaged in
    the Vulnerability Report.
  - Picking up base-image fixes needs a rebuild on a refreshed
    `python:3.12-slim`, or an `apt-get upgrade` layer. Not yet decided.
  - *Correction, 2026-10-13: "No findings in Python packages" was wrong.*
    GitLab's scanner skips installed Python packages by default. With
    `CS_DISABLE_LANGUAGE_VULNERABILITY_SCAN: "false"` the 1.1.0 image shows
    172, including 6 in the base image's own `pip` 25.0.1. pip-audit missed
    them because it only checks `requirements.txt`.

### Container CVEs resolved in 1.1.1 (2026-10-13)
- **Cause:**
  - All 166 OS findings come from `python:3.12-slim`; bare `slim` scores
    exactly 166.
  - The alternatives were measured with GitLab's Trivy and DB:
    `3.13-slim` 166, distroless (Debian 13) 166, `3.12-alpine` 1,
    Chainguard 0. Chainguard was rejected: its free tier is `:latest` only.
- **Fix:**
  - The runtime is `python:3.12-alpine`, pinned by digest, with
    `apk upgrade`.
  - `pip` is uninstalled after the dependency install.
  - The candidate image scans at **0** (OS and Python packages), via
    GitLab's analyzer as uid 65533 and a direct Trivy cross-check.
- **Equivalence:**
  - The 1.1.0 and Alpine images gave identical answers on 803 request
    pairs: the all-symbols fixture, the seeds, type mutations, attack
    strings, and parser extremes.
  - The UI and symbol images are served by both.
  - Peak memory was 138 MiB (Alpine) vs 148 MiB under that load.
  - The black-box suite passed 7/7 at 2,000 examples, with 0 server errors.
- **Gate:**
  - `container_scanning:gate` fails when a fix exists and the severity is
    High, Critical or Unknown.
  - Verified: it fails on 1.1.0 (2 fixable liblzma5, Unknown), passes on
    the candidate, and fails on a missing report.
  - Dependabot proposes base-image digest bumps weekly.

### F3 — Open CORS — FIXED in 1.1.2 (2026-10-13)
- **Two problems:**
  - `CORSMiddleware(allow_origins=["*"])`
  - a fallback in the security-headers middleware that re-added
    `Access-Control-Allow-Origin: *` to every response without one. That
    included the very origins CORSMiddleware refused, so narrowing the
    allowlist alone would have been a no-op.
- **Why it was low-risk but worth fixing:**
  - **Low-risk:** no cookies or logins, so CORS protected no session.
  - **Abuse:** any website could still make its visitors' browsers drive
    heavy evaluations (distributed load).
  - **A trap for the future:** a hazard the moment authentication is
    added.
  - **A VAPT finding.**
- **Fix:**
  - `allow_origins=settings.origins_list` from `ALLOWED_ORIGINS`, empty by
    default, so no cross-origin access; `origins_list` drops blanks
  - the fallback is deleted
  - methods are limited to GET and POST
  - the production Dockerfile no longer sets localhost origins
- **Nothing current is cross-origin:**
  - production serves the page and the API from one origin
  - development proxies `/api` through Vite
  - the legacy split compose stack (unused, already broken) is marked for
    removal
- **Verified:**
  - `tests/test_cors.py` (7 tests, all failing before the fix):
    - another origin gets no ACAO on GET and POST
    - its preflight gets 400
    - same-origin requests need no headers
    - a listed origin is echoed exactly, never `*`, and can preflight only
      GET and POST
  - **in Chrome** against the built image:
    - the app loads, all 66 symbol images render, and there are no
      console errors
    - the `crossOrigin='anonymous'` image path is not tainted
    - the PDF-export SVG fetch, evaluate and the DOCX export all return
      200
  - from another origin's page, a `fetch()` of 1.1.2 is **blocked** by the
    browser, while the same fetch of 1.1.1 **reads** the response

### App code immutable at runtime — 1.1.2 (2026-10-13)
A read-only root filesystem is not mandated by GovPaaS, but its main benefit
can be had from the image alone.
- **The problem:** `docker diff` on 1.1.1 under the fuzz suite showed the
  app writes only `__pycache__` and `/tmp`. Yet `/app` was owned by the app
  user, which could rewrite its own code (a backdoor after any
  code-execution bug).
- **Fix:**
  - the code stays root-owned (no `chown`)
  - bytecode is precompiled at build
  - `PYTHONDONTWRITEBYTECODE=1`
- **Verified:**
  - as `app`, writing `main.py` or creating a new file gives *Permission
    denied*
  - `docker diff` after the fuzz suite and a 2.3 MB upload: **no
    changes**
  - fuzz 7/7
- **Full read-only rootfs** is proven compatible if `/tmp` is writable;
  whether to enable it is pending GovPaaS (see
  govpaas_configuration_helper).

### F13 — Worker-thread stack overflow on Alpine — FIXED before release (2026-10-13)
**New finding, introduced by the Alpine move and caught before release.**
- **What happens:** musl gives a new thread a 128 KiB stack; glibc gives
  8 MiB. JSON nested 100,000 deep, parsed in a worker thread, overflows the
  C stack before CPython's recursion guard trips. The result is a
  **segfault of the whole process**, not `RecursionError`.
- **How it was found:** the backend suite in `python:3.12-alpine` died
  mid-run (the test client runs the app in a thread).
- **Production was not affected:** every endpoint is `async`, so request
  handling runs on the main thread. The candidate image answered 422 at
  nesting depths from 20,000 to 1,000,000.
- **The latent risk:** anything run in Starlette's threadpool, such as a
  future `def` endpoint, would turn one request into a server crash (DoS).

Fix: `app/main.py` sets `threading.stack_size(8 MiB)` before any worker
thread exists.

Verified:
- `tests/test_thread_stack.py` runs the probe in a subprocess, so a crash
  fails the test rather than the whole run
- without the fix it fails with exit -11 (SIGSEGV)
- with the fix the full suite passes 174/174 on Alpine, Debian slim and
  Windows
- CI now runs the suite on Alpine, so a platform difference like this one
  surfaces in CI, not production

### Dynamic security testing — coverage and known gap (2026-10-09)
Automated dynamic testing now in place, and what it does **not** reach:

- **GitLab DAST** (browser-based, v6, active checks; `.gitlab-ci.yml` job
  `dast`, opt-in via `ENABLE_DAST`, weekly schedule). It scans a disposable
  copy of the deployed image inside the CI job, never the live host. It
  covers the SPA and every GET route the UI calls. First run: one Info
  finding (CSP missing `object-src`), fixed in `63c8993` and resolved in
  GitLab's Vulnerability Report.
- **GitLab API Security Testing**: trialled, **not adopted**.
  - From `/openapi.json` it loads 0 operations. FastAPI emits OpenAPI 3.1,
    and the optional upload `UploadFile | None` becomes
    `anyOf[binary, null]`, which api-security 6.16 rejects.
  - From a recorded HAR it ran, but every payload was injected into
    `metadata_json` as one opaque string. That broke the JSON, so requests
    were rejected at `json.loads` and never reached the logic.
  - "0 server errors" from that run was **not** evidence of robustness: F9
    above was present at the time.
- **Known gap.** No automated *black-box* scanner reaches the logic behind
  `POST /api/evaluate` and `POST /api/export/docx`. Both take a JSON
  document inside a multipart form field.
  - *Update 2026-10-12: partly closed by our own black-box suite.*
    `backend/tests/test_blackbox_http.py`, GitLab job `fuzz:blackbox`,
    opt-in via `ENABLE_BLACKBOX_FUZZ`, weekly schedule. It runs against the
    same disposable sidecar copy of the image as DAST and sends realistic
    documents with hostile values *inside* them:
    - wrong types
    - attack strings: XSS, Office-XML breakers, control characters,
      surrogates, bidi, format strings, template injection, path traversal
    - parser extremes: huge integers, deep nesting, `1e999`, `NaN`,
      duplicate keys

    It fails on any 5xx, any response over 10 s, a missing `nosniff`, a
    corrupt `.docx`, or export text that does not round-trip exactly.
    Before it went into CI it found F11 and F12, and it catches F10 on the
    pre-fix GHCR image.
  - *Still uncovered:* authenticated or multi-step abuse, timing and
    resource attacks beyond the 10 s bound, `schematic_image` and crop
    payloads (fixed valid PNG only), and anything a human tester would
    chain. The VAPT scope note below stands.
- **Changing the API format to suit a scanner was considered and rejected.**
  - A JSON request body still emits the same OpenAPI 3.1 nullable construct
    for any optional field.
  - FastAPI parses a JSON body before handler code runs, which would remove
    the pre-parse 20 MB cap (R-01).
  - Export carries binary image files, so it must stay multipart.
- **Compensating controls:**
  - strict typed validation (F9)
  - property-based fuzz tests that feed mutated documents straight to both
    endpoints on every pipeline (`backend/tests/test_fuzz_inputs.py`)
  - the existing count and size caps
  - the planned manual VAPT

  **VAPT scope note:** direct manual testing at the JSON fields inside
  `metadata_json` and `manifest_json`. That is where automated coverage is
  thinnest.

### Platform-level options (GovPaaS/Northflank console) — not yet applied
Cross-referenced against `govpaas_configuration_helper/GOVPAAS_PLATFORM_
GUIDE.md`, which documents this same GovPaaS/Northflank console's
capabilities from a sibling project's provisioning session (confirmed for
that project, not yet verified in *this* project's console — treat as
"should be present," not "confirmed present here"):

- **Path-specific security policies**: the console supports per-path
  IP/header/SSO rules layered on top of a service's base config. This is
  the mechanism to add a *second*, platform-level gate on
  `POST/PATCH/DELETE /api/symbols` specifically — e.g. requiring the same
  `X-Admin-Key` header, or an IP allowlist — while leaving the rest of the
  app (GET routes, the static frontend) public as intended. Defense in
  depth on top of the code fix above, not a replacement for it. Addresses
  Residual Risk #2.
- **GHCR image privacy**: the sibling project's registry image is private,
  with GovPaaS configured with a pull credential (GitHub PAT scoped
  `read:packages`) rather than relying on public pull. This repo's image
  (`ghcr.io/beese54/drawing-portal:latest`) is currently anonymously
  public (F-adjacent, Residual Risk #4) — switching the GHCR package to
  private and adding the equivalent pull credential in the GovPaaS image
  source config would close this without any code change.
- **IP policies / IP allowlisting**: available as a general console option;
  not applicable here since the app is intentionally fully public, but
  could combine with path-specific policies above if the symbol-management
  endpoints should only be reachable from specific networks.
- Not found documented anywhere in either GovPaaS guide file: application
  or edge-level **rate limiting** (F2) — no evidence this is a console
  toggle on this platform. Treat F2 as needing an app-level fix
  (`slowapi` or manual array-length caps in `evaluate.py`/`export.py`),
  not a platform setting.

Neither platform-level item above has been applied — both require the
GovPaaS console UI, which this session has no access to. Recommended as
next actions for whoever holds console access.

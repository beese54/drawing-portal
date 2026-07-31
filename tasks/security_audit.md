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
   this pass (see F6).
7. **Dynamic/runtime behavior** — no fuzzing, no live scanning, and no
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

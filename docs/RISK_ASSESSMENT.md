# Security Risk Assessment — Schematic Drawing Portal

**Assessment date:** 2026-08-03
**Assessed state:** Current deployed state (see Part A) — *not* a target or post-remediation state. No mitigation is credited below unless it exists in the running system today.
**Prepared by:** Development team (self-assessment)
**Status:** ⚠️ **Draft for PUB cyber team review — not yet signed off**

> **Catalogue caveat — read first.** The control IDs referenced throughout
> (`AC-01`, `SI-02`, …) are **defined locally** in
> `tasks/doc_audit.md`. They are **not** IM8 clause references. IM8 is a
> restricted document not held by this assessment. The families follow
> conventional public-sector groupings so PUB's cyber team can map each row
> onto the real catalogue. **Every row needs re-anchoring to the actual IM8
> clause before submission.**

---

## Part A — System Identification

| Field | Value |
|---|---|
| System name | Schematic Drawing Portal (WSI) |
| Agency / owner | PUB — Singapore's National Water Agency |
| Business function | Lets users draw a water-supply schematic in-browser and evaluates it against 8 deterministic plumbing-compliance rules (PUB Handbook / REG28 / MWELS), then exports a Word report |
| Hosting | GovPaaS (Northflank-based PaaS), single container, 1 replica |
| Target domain | `wsi-drawing-portal.pub.gov.sg` — **NOT yet cut over** |
| **Current reachability** | **Publicly reachable on the GovPaaS `.code.run` platform URL.** Internet-accessible today, outside the `pub.gov.sg` edge |
| **Data classification** | **OFFICIAL (OPEN)** |
| User population | Public — no login, no user accounts, no user concept anywhere in the codebase |
| Authentication | None on the service. One shared static admin key (`X-Admin-Key`) gates 3 symbol-management routes only |
| Personal data | **None collected.** No accounts, no PII fields. The only free-text inputs were removed in commit `4bc8c39` |
| Data persistence | No database. State = symbol files + `manifest.json` on a 1Gi ReadWriteOnce PVC. User drawings are never persisted server-side |
| AI / model inference | **None.** The `backend/app/agents/` directory contains deterministic rule functions, not LLM agents — a naming artefact that has misled readers before |
| External integrations | **None.** No outbound network calls; no HTTP client remains in the dependency list |

### Impact assessment (C / I / A)

| Dimension | Rating | Justification |
|---|---|---|
| **Confidentiality** | **Low** | OFFICIAL (OPEN). No PII, no credentials, no database, no server-side retention of user drawings or uploaded schematics. Verified: `DP-02` … `DP-05` |
| **Integrity** | **Medium** | The shared custom-symbol library is a global mutable resource with no per-user ownership. Corrupt symbols could produce misleading compliance output — the service's entire purpose is regulatory assessment |
| **Availability** | **Medium** | Single replica, hard-constrained by a ReadWriteOnce PVC. No redundancy. Outage blocks compliance checking but has no safety-of-life or real-time operational dependency |

**Overall system criticality: MEDIUM–LOW.** The dominant risk dimension is
**availability**, not confidentiality — which is unusual, and should steer
where remediation effort goes.

---

## Part B — Risk Rating Methodology

**Risk score = Likelihood × Impact**

| Likelihood | | Impact | |
|---|---|---|---|
| 1 Rare | Requires privileged access or an unlikely chain | 1 Negligible | No meaningful effect |
| 2 Unlikely | Possible but needs a prior foothold or skill | 2 Minor | Brief degradation, cosmetic, or already-public info |
| 3 Possible | Plausible for a motivated actor | 3 Moderate | Service outage, or integrity loss recoverable without data loss |
| 4 Likely | Trivially scriptable against a public endpoint | 4 Major | Extended outage, unauthorised code execution, or lateral movement |
| 5 Almost Certain | Already occurring or structurally guaranteed | 5 Severe | Data breach, regulatory breach, or safety impact |

| Score | Band |
|---|---|
| 1–4 | **LOW** — accept or fix opportunistically |
| 5–9 | **MEDIUM** — fix on a planned schedule |
| 10–14 | **HIGH** — fix before or immediately after go-live |
| 15–25 | **CRITICAL** — do not operate until treated |

---

## Part C — Risk Register

Threat scenario → vulnerability → existing control → likelihood → impact →
inherent rating → treatment → residual.

### R-01 · Unauthenticated compute exhaustion via `/api/evaluate`

| | |
|---|---|
| **Threat scenario** | Anyone on the internet POSTs `metadata_json` containing tens of thousands of synthetic `elements`/`pipes` entries — each needs only a non-empty `id` to pass validation |
| **Vulnerability** | `_validate_metadata` (`evaluate.py:41-59`) checks *shape* but never *length*. `build_adjacency` (`evaluate.py:106`) is O(n²) over those lists, and all 8 check functions re-iterate them. Controls `SI-05`, `SC-04`, `AC-01` |
| **Existing control** | Platform CPU/memory limit only — bounds the blast radius to "this pod dies", does not prevent it. No rate limiting anywhere |
| **Likelihood** | **4 Likely** — publicly reachable today, no auth, no rate limit, trivially scriptable |
| **Impact** | **3 Moderate** — OOM-kill → readiness fails → total outage until restart. PVC data survives. No confidentiality impact at OFFICIAL (OPEN) |
| **Inherent** | **12 — HIGH** |
| **Treatment** | **Mitigate.** Cap `elements`/`pipes` length in `_validate_metadata`; add per-IP rate limiting (`slowapi`, since GovPaaS documents no edge rate-limit toggle) |
| **Residual** | **6 — MEDIUM** (2 × 3) |
| **Owner / due** | ⬜ _________________ |

### R-02 · Memory exhaustion via unbounded schematic image upload

| | |
|---|---|
| **Threat scenario** | Attacker uploads a very large or pixel-dense image to `/api/evaluate` |
| **Vulnerability** | `schematic_image` (`evaluate.py:84`) has **no size cap and no content-type check**. Read wholly into memory (`evaluate.py:122`), then decoded by `Image.open(...).convert("RGB")` (`image_annotator.py:55`). Pillow's default bomb guard (~89M px) sits *above* what a 256Mi container survives — 89M px × 3 bytes ≈ 268MB after RGB conversion. Control `SI-02` |
| **Existing control** | None in application code. Pillow's default `MAX_IMAGE_PIXELS` does not protect a container this size |
| **Likelihood** | **4 Likely** — single unauthenticated request, no skill required |
| **Impact** | **3 Moderate** — same outage profile as R-01 |
| **Inherent** | **12 — HIGH** |
| **Treatment** | **Mitigate.** Enforce a request-size cap; validate content-type; set `Image.MAX_IMAGE_PIXELS` explicitly below the container's survivable ceiling |
| **Residual** | **6 — MEDIUM** (2 × 3) |
| **Owner / due** | ⬜ _________________ |

> **Not in the 2026-07-31 audit.** Identified during this assessment. The
> audit noted the image had "zero validation" under `R2` but did not trace
> it through to the Pillow decode path.

### R-03 · Memory exhaustion via unbounded crop uploads to `/api/export/docx`

| | |
|---|---|
| **Threat scenario** | Attacker POSTs a large number of crop files, or a few very large ones |
| **Vulnerability** | `crops: list[UploadFile] = File(default=[])` (`export.py:34`) — no count cap, no per-file size cap. `export.py:43` reads **every** crop fully into memory before any check. Control `SI-04` |
| **Existing control** | Platform memory limit only |
| **Likelihood** | **3 Possible** |
| **Impact** | **3 Moderate** |
| **Inherent** | **9 — MEDIUM** |
| **Treatment** | **Mitigate.** Cap crop count and per-file size; stream rather than reading all upfront |
| **Residual** | **4 — LOW** (2 × 2) |
| **Owner / due** | ⬜ _________________ |

### R-04 · Wildcard CORS with an unconditional override

| | |
|---|---|
| **Threat scenario** | Any origin can read responses from every endpoint |
| **Vulnerability** | `main.py:14` sets `allow_origins=["*"]`; `main.py:24-32` adds a second `force_cors` middleware that **unconditionally overwrites** the header to `*` on every response, so it cannot be tightened by configuration alone. `config.py:39-40` defines `origins_list` which is never referenced. Control `SC-02` |
| **Existing control** | None |
| **Likelihood** | **3 Possible** |
| **Impact** | **2 Minor** — there are no cookies, sessions, or auth tokens in the browser and no per-user data, so there is little to obtain cross-origin. This is a baseline-compliance failure more than an exploitable one |
| **Inherent** | **6 — MEDIUM** |
| **Treatment** | **Mitigate.** Wire `CORSMiddleware` to `settings.origins_list`; narrow `force_cors` to the symbol-image path its own comment says it exists for |
| **Residual** | **2 — LOW** (1 × 2) |
| **Owner / due** | ⬜ _________________ |

### R-05 · Stored XSS via a crafted SVG on a government origin

| | |
|---|---|
| **Threat scenario** | Crafted SVG evades the sanitiser, is served as `image/svg+xml`, and executes when navigated to directly |
| **Vulnerability** | `symbol_service.py:46-50` is a **blocklist** (`<script`, `javascript:`, `\bon\w+\s*=`), not an allowlist. `<foreignObject>` and CSS `@import` vectors untested. Control `SI-03` |
| **Existing control** | **Upload now requires the admin key** (`symbols.py:12-18`), and fails closed when the key is unset (`config.py:16`, control `AC-03`). The vector is unreachable to an anonymous attacker in **both** the configured and unconfigured states |
| **Likelihood** | **1 Rare** — requires admin-key compromise |
| **Impact** | **3 Moderate** — script execution on a `.gov.sg` origin is a phishing and reputational vector even with no data to steal |
| **Inherent** | **3 — LOW** |
| **Treatment** | **Mitigate (low priority).** Replace the blocklist with a real sanitiser or server-side re-render; consider `Content-Disposition: attachment` on the image route |
| **Residual** | **2 — LOW** (1 × 2) |
| **Owner / due** | ⬜ _________________ |

> **Deliberate downgrade from the source audit.** `security_audit.md` rates
> this MEDIUM (F4). That rating was written against a codebase with no
> authentication on symbol upload. The `X-Admin-Key` guard landed in commit
> `3bfc88d` **after** F4 was written, which removes anonymous reachability.
> Downgraded on that basis, not on any judgement that the sanitiser is sound
> — it is not.

### R-06 · No audit trail or error aggregation — incidents undetectable

| | |
|---|---|
| **Threat scenario** | An availability or integrity incident occurs and cannot be detected, attributed, scoped, or proven benign |
| **Vulnerability** | No logging middleware, no `logger`, no logging config anywhere in `backend/app/`. The **only** application-emitted output is `traceback.print_exc()` at `evaluate.py:149`, to stderr, with no request correlation. No error aggregation (no Sentry). Controls `AU-01`, `AU-03`, `AU-04`, `IR-02` |
| **Existing control** | uvicorn's default access log — plain text, one line per request, no structured fields, no application events |
| **Likelihood** | **4 Likely** — R-01 and R-02 are live and unmitigated, so an availability incident is a realistic near-term expectation |
| **Impact** | **3 Moderate** — no route to determine cause, scope, or malice. For a government service this is also an accountability failure, not only an operational one |
| **Inherent** | **12 — HIGH** |
| **Treatment** | **Mitigate.** This is the Sentry work item — see the note below on why it is larger than it looks |
| **Residual** | **4 — LOW** (4 × 1) — the incident still occurs, but becomes detected and diagnosable |
| **Owner / due** | ⬜ _________________ |

> **Scope note for the cyber team's "logs piped to Sentry" request.** The
> service currently produces almost nothing to pipe. Delivering this means
> *creating* the telemetry first — exception capture, request context,
> state-change events — not just adding a DSN. It also introduces the app's
> **first and only outbound network call**, which contradicts the
> no-egress property asserted in `ARCHITECTURE.md:41-43` and verified as
> control `SC-05`. That property is currently load-bearing in the security
> posture. Adding Sentry requires updating it and may need GovPaaS-side
> egress approval.

### R-07 · Interactive API documentation publicly exposed

| | |
|---|---|
| **Threat scenario** | Reconnaissance via `/docs` and `/openapi.json` |
| **Vulnerability** | `main.py:10` instantiates `FastAPI()` without `docs_url=None`/`openapi_url=None`, so both are live and public. `main.py:42-45` confirms the static mount deliberately does not shadow them. Control `SC-06` |
| **Existing control** | None |
| **Likelihood** | **5 Almost Certain** — already exposed |
| **Impact** | **1 Negligible** — the same endpoints are already enumerable from the shipped frontend bundle (`frontend/src/api/client.ts` ships to every browser). Adds close to zero reconnaissance value |
| **Inherent** | **5 — MEDIUM** |
| **Treatment** | **Mitigate.** One-line change; disable in production builds. Cheap enough that it isn't worth arguing about in review |
| **Residual** | **1 — LOW** |
| **Owner / due** | ⬜ _________________ |

### R-08 · Unassessed dependency vulnerability exposure

| | |
|---|---|
| **Threat scenario** | A known CVE in a pinned dependency is exploitable against the running service |
| **Vulnerability** | `backend/requirements.txt` pins `fastapi==0.111.0`, `uvicorn==0.30.1`, `python-multipart==0.0.9` — mid-2024 releases, roughly 14 months stale at assessment date. `docker-publish.yml` has **no** SCA/audit step and there is no Dependabot config. Controls `SI-08`, `RA-05` |
| **Existing control** | None |
| **Likelihood** | **4 Likely** — that *some* advisory affects a 14-month-old pin set |
| **Impact** | **3 Moderate** — unquantified pending a scan; could range from negligible to severe |
| **Inherent** | **12 — HIGH** |
| **Treatment** | **Mitigate.** Add `pip-audit` and `npm audit` to CI, run once against current pins, **then re-rate this row with real data** |
| **Residual** | **Pending scan — cannot be stated responsibly today** |
| **Owner / due** | ⬜ _________________ |

> This row is rated on the **absence of assurance**, not on any specific
> CVE. No CVE was verified during this assessment and none is claimed.

### R-09 · Mutable image tag, no provenance, no SBOM

| | |
|---|---|
| **Threat scenario** | A compromised or substituted image is pulled and run |
| **Vulnerability** | `deployment.yaml:20` references `:latest` with `imagePullPolicy: Always` — a mutable tag. No cosign signing, no build attestation, no SBOM in `docker-publish.yml`. CI actions use mutable `@v4`/`@v3`/`@v5` tags. Controls `CM-07`, `SR-03`, `SR-04` |
| **Existing control** | CI credentials are least-privilege and ephemeral (`docker-publish.yml:9-11`, control `SR-01` — verified sound). Build is reproducible from a lockfile (`SR-05`) |
| **Likelihood** | **2 Unlikely** |
| **Impact** | **4 Major** — arbitrary code execution inside a government-hosted container |
| **Inherent** | **8 — MEDIUM** |
| **Treatment** | **Mitigate.** Pin the deployed image by digest; pin CI actions to commit SHA; add SBOM generation and build attestation |
| **Residual** | **4 — LOW** (1 × 4) |
| **Owner / due** | ⬜ _________________ |

### R-10 · Container image anonymously public on GHCR

| | |
|---|---|
| **Threat scenario** | Anyone pulls the image and inspects application code, config and structure |
| **Vulnerability** | `ghcr.io/beese54/drawing-portal` is anonymously, publicly pullable. Control `SR-02` |
| **Existing control** | No secrets are baked into the image — verified, control `CM-06` (`Dockerfile:28-29`, runtime injection) |
| **Likelihood** | **3 Possible** |
| **Impact** | **2 Minor** — OFFICIAL (OPEN) classification, and the image contains no credentials |
| **Inherent** | **6 — MEDIUM** |
| **Treatment** | **Mitigate.** Add a GovPaaS pull credential **first**, then flip GHCR visibility to private. Order matters — reversing it breaks the next pull |
| **Residual** | **2 — LOW** (1 × 2) |
| **Owner / due** | ⬜ _________________ |

### R-11 · No redundancy — any crash or deployment is a full outage

| | |
|---|---|
| **Threat scenario** | Pod crash, OOM, node eviction or rollout causes complete unavailability |
| **Vulnerability** | `deployment.yaml:7` `replicas: 1`, hard-constrained by the ReadWriteOnce PVC (`persistentvolumeclaim.yaml:7-8`) — a second replica physically cannot mount the volume. Control `CP-01` |
| **Existing control** | Liveness/readiness probes drive automatic restart (`deployment.yaml:37-48`). Steady rollout strategy avoids RWO mount deadlock |
| **Likelihood** | **3 Possible** |
| **Impact** | **3 Moderate** — outage until restart; PVC data survives |
| **Inherent** | **9 — MEDIUM** |
| **Treatment** | **Accept**, or re-architect: moving custom-symbol storage to object storage would remove the RWO constraint and unlock >1 replica. Not justified by this service's criticality today |
| **Residual** | **9 — MEDIUM — proposed for formal acceptance** |
| **Owner / due** | ⬜ _________________ |

### R-12 · No backup or restore for the shared symbol library

| | |
|---|---|
| **Threat scenario** | PVC corruption, accidental deletion or volume loss destroys all custom symbols |
| **Vulnerability** | No backup mechanism in the repo; platform snapshot policy unknown. Control `CP-02` **[UNVERIFIED]** |
| **Existing control** | The **default** symbol set is version-controlled at `backend/symbols/` and rebuilt into every image — only user-uploaded custom symbols are at risk |
| **Likelihood** | **2 Unlikely** |
| **Impact** | **3 Moderate** — unrecoverable loss of custom symbols |
| **Inherent** | **6 — MEDIUM** |
| **Treatment** | **Mitigate.** Confirm the GovPaaS volume snapshot policy; if none, schedule a periodic export |
| **Residual** | **4 — LOW** (2 × 2) |
| **Owner / due** | ⬜ _________________ |

### R-13 · No published security contact or disclosure channel

| | |
|---|---|
| **Threat scenario** | An external party finds a vulnerability and has no route to report it — so it goes unfixed, or is disclosed publicly |
| **Vulnerability** | No `SECURITY.md`; the in-app feedback channel was removed 2026-08-02 and never replaced. Tracked as DSS control BD-9 (`PROGRESS.md:113`). Control `IR-03` |
| **Existing control** | None |
| **Likelihood** | **3 Possible** |
| **Impact** | **3 Moderate** — for a `.gov.sg` service, an uncontrolled public disclosure carries reputational weight beyond the technical defect |
| **Inherent** | **9 — MEDIUM** |
| **Treatment** | **Mitigate.** Publish a security contact; low effort, and simultaneously closes DSS BD-9 |
| **Residual** | **3 — LOW** (1 × 3) |
| **Owner / due** | ⬜ _________________ |

### R-14 · Container hardening not declared in the deployment manifests

| | |
|---|---|
| **Threat scenario** | An attacker with a code-execution foothold escalates privilege or moves laterally |
| **Vulnerability** | `k8s/app/deployment.yaml` contains **no `securityContext` block at all** — no `readOnlyRootFilesystem`, no `allowPrivilegeEscalation: false`, no capability drop, no seccomp profile, no `automountServiceAccountToken: false`, and no NetworkPolicy anywhere in `k8s/`. Controls `CM-02`, `CM-03`, `CM-04`, `CM-08`, `CM-09` |
| **Existing control** | Container runs as a non-root system user (`Dockerfile:32-34`, control `CM-01` — verified). The production filesystem is read-only in practice, but this is an **observed platform behaviour, not an asserted control** — the manifests request nothing |
| **Likelihood** | **2 Unlikely** — requires a prior foothold |
| **Impact** | **4 Major** — container escape or lateral movement |
| **Inherent** | **8 — MEDIUM** |
| **Treatment** | **Mitigate.** Add an explicit `securityContext`. Low effort, pure defence-in-depth. See `docs/HARDENING_REPORT.md` §3 for the exact block |
| **Residual** | **4 — LOW** (1 × 4) |
| **Owner / due** | ⬜ _________________ |

### R-15 · No independent penetration test or dynamic vulnerability assessment

| | |
|---|---|
| **Threat scenario** | A vulnerability class invisible to static review — runtime behaviour, platform edge misconfiguration, chained exploits — is exploited in production |
| **Vulnerability** | No dynamic scan and no penetration test have ever been performed against the deployed service. Controls `RA-03`, `RA-04` |
| **Existing control** | A static source-code security review exists (`tasks/security_audit.md`, control `RA-01`) — which by construction cannot cover any of the above |
| **Likelihood** | **3 Possible** |
| **Impact** | **4 Major** — unknown-unknowns on a government asset |
| **Inherent** | **12 — HIGH** |
| **Treatment** | **Transfer.** Commission a CSA-licensed provider through PUB's VAPT process. Under Singapore's Cybersecurity Act, penetration testing of a `pub.gov.sg` asset must go through a licensed provider — **this cannot be closed by the development team or by any AI-assisted review** |
| **Residual** | **Open — cannot be closed by this project** |
| **Owner / due** | ⬜ **PUB cyber team** _________________ |

### R-16 · In-repo manifests diverge from the actual GovPaaS configuration

| | |
|---|---|
| **Threat scenario** | This assessment describes a system that is not the one running, so its conclusions do not apply |
| **Vulnerability** | `deployment.yaml:27-33` requests 100m CPU / 128Mi and limits 500m / 256Mi. The GovPaaS console is configured at 0.5 vCPU / 1024Mi (`ARCHITECTURE.md:141-143`). **The divergence is confirmed, not hypothetical**, and neither source is marked authoritative. Control `CM-10` |
| **Existing control** | The divergence is at least documented in `ARCHITECTURE.md` |
| **Likelihood** | **3 Possible** — already true for resource limits; unknown for everything else |
| **Impact** | **3 Moderate** — undermines confidence in every manifest-derived finding in this document, including R-01/R-02's OOM thresholds |
| **Inherent** | **9 — MEDIUM** |
| **Treatment** | **Mitigate.** Reconcile the two and declare one authoritative. If GovPaaS is the only deployment target, consider deleting `k8s/` outright rather than maintaining a fiction |
| **Residual** | **3 — LOW** (1 × 3) |
| **Owner / due** | ⬜ _________________ |

### R-17 · No security response headers

| | |
|---|---|
| **Threat scenario** | Clickjacking, MIME-sniffing, or protocol downgrade against users of a government service |
| **Vulnerability** | No HSTS, CSP, `X-Frame-Options`, `X-Content-Type-Options` or `Referrer-Policy` set anywhere. `main.py` has no header middleware beyond `force_cors`. Control `SC-03` |
| **Existing control** | None in application code. Any platform-edge defaults are **[UNVERIFIED]** |
| **Likelihood** | **3 Possible** |
| **Impact** | **2 Minor** — no sessions or credentials to hijack. `X-Content-Type-Options` is the one that matters most here, given the SVG-serving route |
| **Inherent** | **6 — MEDIUM** |
| **Treatment** | **Mitigate.** Add a response-header middleware; ~10 lines |
| **Residual** | **2 — LOW** (1 × 2) |
| **Owner / due** | ⬜ _________________ |

### R-18 · Publicly exposed on the platform URL, outside the `pub.gov.sg` edge

| | |
|---|---|
| **Threat scenario** | The service is internet-reachable on its GovPaaS `.code.run` hostname before the `pub.gov.sg` custom domain — and whatever edge protection that zone carries — is in place |
| **Vulnerability** | The platform hostname bypasses any Cloudflare WAF, edge rate limiting or bot management applied to the `pub.gov.sg` zone. Every risk in this register is **live today** on that hostname. Control `AC-05` |
| **Existing control** | None. Public exposure is intentional, but exposure *on this hostname, at this stage* may not be |
| **Likelihood** | **3 Possible** |
| **Impact** | **3 Moderate** — full unprotected exposure of an unauthenticated service with known unmitigated DoS vectors (R-01, R-02) |
| **Inherent** | **9 — MEDIUM** |
| **Treatment** | **Mitigate.** Decide explicitly whether public exposure is intended *now*. If not, gate the `.code.run` hostname until cutover. If yes, treat R-01/R-02 as pre-launch blockers rather than post-launch work |
| **Residual** | **3 — LOW** (1 × 3) |
| **Owner / due** | ⬜ _________________ |

---

## Part D — Risk Summary

| Band | Count | Risk IDs |
|---|---|---|
| **CRITICAL** | 0 | — |
| **HIGH** | 5 | R-01, R-02, R-06, R-08, R-15 |
| **MEDIUM** | 12 | R-03, R-04, R-07, R-09, R-10, R-11, R-12, R-13, R-14, R-16, R-17, R-18 |
| **LOW** | 1 | R-05 |
| **Total** | **18** | |

**Post-treatment projection** (if every "Mitigate" is actioned):

| Band | Count | Risk IDs |
|---|---|---|
| CRITICAL | 0 | — |
| HIGH | 0 | — |
| MEDIUM | 3 | R-01, R-02 (both reduced but not eliminated — a public compute endpoint retains residual DoS exposure); R-11 (accepted, architectural) |
| LOW | 13 | R-03, R-04, R-05, R-06, R-07, R-09, R-10, R-12, R-13, R-14, R-16, R-17, R-18 |
| Not rateable | 2 | R-08 (pending dependency scan), R-15 (pending external VAPT) |
| **Total** | **18** | |

### Concentration

Four of the five HIGH risks share one root cause: **unauthenticated,
unbounded, unmonitored public compute.** R-01, R-02 and R-06 would all be
substantially reduced by a single coordinated change — input caps plus rate
limiting plus error capture on the two public POST endpoints. That is the
highest-leverage piece of work in this register.

R-08 and R-15 are different in kind: both are **assurance gaps**, not known
defects. Neither can be closed by writing code — one needs a scan run, the
other needs a licensed external provider.

---

## Part E — Treatment Plan

| Priority | Action | Closes | Effort |
|---|---|---|---|
| **P1** | Cap array lengths in `_validate_metadata`; cap request/upload size; set `Image.MAX_IMAGE_PIXELS`; cap crop count | R-01, R-02, R-03 | Low |
| **P1** | Run `pip-audit` + `npm audit` once, then re-rate R-08 with real data | R-08 | Low |
| **P1** | Decide explicitly whether `.code.run` public exposure is intended now | R-18 | Decision only |
| **P2** | Add error capture + structured logging, then wire to Sentry (see R-06 scope note) | R-06, partial R-13 | **Medium–High** |
| **P2** | Add per-IP rate limiting (`slowapi`) | R-01, R-02, R-03 | Low–Medium |
| **P2** | Set `SYMBOLS_ADMIN_KEY` in the GovPaaS console (currently unset → routes 401) | `AC-04` | Trivial |
| **P2** | Add `securityContext` to the deployment manifest | R-14 | Low |
| **P3** | Wire CORS to `origins_list`; narrow `force_cors`; add security headers; disable `/docs` | R-04, R-07, R-17 | Low |
| **P3** | Pull credential → then GHCR private; pin image by digest; pin CI actions to SHA; add SBOM | R-09, R-10 | Low–Medium |
| **P3** | Publish `SECURITY.md` with a security contact | R-13, DSS BD-9 | Trivial |
| **P3** | Reconcile `k8s/` against the GovPaaS console; declare one authoritative | R-16 | Low |
| **P3** | Confirm PVC snapshot policy | R-12 | Investigation |
| **P4** | Replace the SVG blocklist with an allowlist sanitiser | R-05 | Medium |
| **External** | Commission CSA-licensed VAPT via PUB's process | R-15 | PUB cyber team |

---

## Part F — What This Assessment Does *Not* Claim

Stated explicitly so no reader infers coverage that was never provided:

1. **It does not claim IM8 compliance.** The control catalogue is locally defined. No IM8 clause has been assessed, because the catalogue was not available to this assessment.
2. **It does not claim the code is free of vulnerabilities.** It reflects a static review plus this assessment's own reading. R-15 exists precisely because that is not equivalent to testing.
3. **It does not assess the GovPaaS platform, the Cloudflare zone, or PUB's WOG DNS infrastructure.** All three are outside this project's access.
4. **It does not verify TLS posture** — cipher suites, HSTS, certificate configuration all terminate at an edge this assessment cannot see.
5. **It does not claim the deployed configuration matches this repository.** R-16 documents a confirmed divergence.
6. **It makes no CVE claim.** R-08 is rated on missing assurance, not on any identified advisory.
7. **It does not cover organisational controls** — incident response process, staff vetting, physical security, DR testing.

### [UNVERIFIED] items requiring PUB / GovPaaS access

These are gaps in **this assessment's reach**, not confirmed control
failures. The distinction should not be collapsed when this is read.

| Ref | Item | Who can verify |
|---|---|---|
| `AC-04` | Is `SYMBOLS_ADMIN_KEY` set in the console? | GovPaaS console holder |
| `SC-01`, `IA-03` | TLS config, cipher suites, HSTS at the edge | GovPaaS / Cloudflare |
| `AU-06` | Platform log retention, access control, tamper protection | GovPaaS console holder |
| `CP-02` | PVC backup / snapshot policy | GovPaaS console holder |
| `CP-04` | Rollout strategy as actually configured | GovPaaS console holder |
| `IR-01` | PUB's organisational incident response process | PUB cyber team |
| — | Cloudflare zone posture for the delegated subzone | GovPaaS / Airbase |

---

## Part G — Sign-off

This assessment is a **development-team self-assessment**. It has not been
independently reviewed. It should not be treated as an accreditation
artefact until Parts C and F are validated by PUB's cyber team and the
control IDs are re-anchored to the actual IM8 catalogue.

| Role | Name | Signature | Date | Position |
|---|---|---|---|---|
| Assessor (preparer) | | | 2026-08-03 | Submitted for review |
| System / product owner | | | | ⬜ Accept ⬜ Reject ⬜ Accept with conditions |
| PUB cyber / security reviewer | | | | ⬜ Accept ⬜ Reject ⬜ Accept with conditions |
| Risk acceptance authority (for R-11, and any residual accepted) | | | | ⬜ Accepted ⬜ Not accepted |

**Formal risk acceptances requested:**

- **R-11** (no redundancy, MEDIUM residual) — architectural constraint of the ReadWriteOnce PVC. Accepting means accepting that any crash or deployment causes a full outage until restart.
- **AC-05** (no network-level access restriction) — the service is intentionally public and unauthenticated.
- **AC-02** (no per-resource authorisation) — no user concept exists in the system by design.

---

## Revision History

| Date | Change | By |
|---|---|---|
| 2026-08-03 | Initial assessment. Frame: publicly reachable on `.code.run`, OFFICIAL (OPEN), locally-defined catalogue. 18 risks; 0 CRITICAL, 5 HIGH. R-02 and R-07 newly identified this pass; R-05 downgraded from the source audit's F4 following the `3bfc88d` auth fix | Development team |

## Source Documents

| Document | Path | Currency |
|---|---|---|
| Control evidence table | `tasks/doc_audit.md` | Current — 65 controls, generated this pass |
| Security audit (static code review) | `tasks/security_audit.md` | 2026-07-31 — partially superseded, see `RA-06` |
| System architecture | `docs/ARCHITECTURE.md` | 2026-08-02 — two factual defects, see `RA-06` |
| Hardening report | `docs/HARDENING_REPORT.md` | Current — generated this pass |

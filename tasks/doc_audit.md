# Control Evidence Table — Schematic Drawing Portal

Phase 1 artefact for the risk assessment (`docs/RISK_ASSESSMENT.md`) and
hardening report (`docs/HARDENING_REPORT.md`). One row per control. Every
status traces to a `file:line` read this session (2026-08-03) or is marked
`[UNVERIFIED]` with the reason.

**This table is the source of truth.** The two documents cite it rather than
re-deriving positions from code. Re-run the citation sweep after any code
change.

## Frame (Pattern AZ Phase 0)

| Parameter | Value | Source |
|---|---|---|
| Assessed state | **Current deployed state**, 2026-08-03 | User-confirmed |
| Environment | GovPaaS (Northflank), production project | User-confirmed |
| Reachability | **Publicly reachable on the `.code.run` platform URL.** Custom domain `wsi-drawing-portal.pub.gov.sg` NOT yet cut over | User-confirmed |
| Data classification | **OFFICIAL (OPEN)** | User-confirmed |
| Control catalogue | Public-sector-shaped, **locally-defined IDs** — see caveat below | User-confirmed |
| Authentication model | No user accounts by design; single shared admin key on 3 routes | `backend/app/routers/symbols.py:12-18` |

**Catalogue caveat:** the control IDs below (`AC-*`, `AU-*`, …) are defined
in this document. They are **not** IM8 clause references — IM8 is a
restricted document not held by this assessment. The families follow
conventional public-sector/NIST-800-53 groupings so PUB's cyber team can map
each row onto the real catalogue clause-by-clause.

**Two-field model:** `Declared position` is what the service asserts as its
intended posture. `As-built status` is what the code does today. A control
can be declared acceptable and still be a gap — both are tracked.

---

## AC — Access Control

| ID | Control | Evidence | As-built |
|---|---|---|---|
| AC-01 | State-changing endpoints require authentication | `symbols.py:12-18` guards `POST`/`PATCH`/`DELETE /api/symbols`. `POST /api/evaluate` (`evaluate.py:82-85`) and `POST /api/export/docx` (`export.py:32-35`) have no guard | **Partial** |
| AC-02 | Per-resource authorisation / ownership | No ownership model anywhere; symbol library is a single shared PVC resource | **N/A** — no user concept exists to authorise against |
| AC-03 | Admin credential fails closed when unset | `config.py:16` defaults `symbols_admin_key` to `""`; `symbols.py:16-17` returns 401 when falsy | **Implemented** |
| AC-04 | Admin credential actually set in production | Requires GovPaaS console. Not set as of the 2026-07-31 checklist | **[UNVERIFIED]** — if unset, routes 401 unconditionally (safe, but the feature is inert) |
| AC-05 | Network-level access restriction (IP allowlist / SSO) | None configured; service intentionally public | **Gap by design** — accepted for OFFICIAL (OPEN) |
| AC-06 | Public read endpoints are read-only | `symbols.py:20-51` — `GET` list + image only | **Implemented** |

## IA — Identification & Authentication

| ID | Control | Evidence | As-built |
|---|---|---|---|
| IA-01 | Credentials are per-identity, not shared | Single static shared key, `symbols.py:12-18` | **Partial** — acceptable at this classification, but no per-user attribution |
| IA-02 | Credential rotation mechanism | No rotation, expiry or versioning in code or config | **Gap** |
| IA-03 | Credential transmitted only over TLS | Platform-terminated TLS on `.code.run` | **[UNVERIFIED]** — platform edge, not visible in repo |

## AU — Audit & Accountability

| ID | Control | Evidence | As-built |
|---|---|---|---|
| AU-01 | Audit trail for state-changing actions | No logging middleware; no `logger` anywhere. Repo-wide grep across `backend/app/` for print / logger / logging calls returns exactly one hit (AU-04) | **Gap** |
| AU-02 | Request/access logging | uvicorn default access log only (`Dockerfile:39` — no `--no-access-log`). Plain text, no structured fields | **Partial** |
| AU-03 | Centralised log/error aggregation (Sentry) | Zero `sentry` references repo-wide; no `sentry-sdk` in `backend/requirements.txt` | **Gap** |
| AU-04 | Application error capture | `evaluate.py:149` `traceback.print_exc()` — the **only** application-emitted output in the codebase, stderr, uncorrelated | **Partial** |
| AU-05 | Logs contain no sensitive data | Stack traces to stderr (AU-04); no PII collected to leak (DP-02) | **Partial** |
| AU-06 | Log retention / tamper protection | Platform-dependent | **[UNVERIFIED]** |

## SC — System & Communications Protection

| ID | Control | Evidence | As-built |
|---|---|---|---|
| SC-01 | TLS in transit | Platform edge | **[UNVERIFIED]** |
| SC-02 | CORS restricted to known origins | `main.py:14` `allow_origins=["*"]`; `main.py:24-32` `force_cors` unconditionally overwrites to `*` on **every** response; `config.py:39-40` `origins_list` defined and never referenced | **Gap** |
| SC-03 | Security response headers (HSTS, CSP, X-Frame-Options, X-Content-Type-Options) | None set in `main.py`; no header middleware beyond `force_cors` | **Gap** |
| SC-04 | Rate limiting / throttling | No rate-limit library in `requirements.txt`; no throttling code. Not documented as a GovPaaS console option | **Gap** |
| SC-05 | No unnecessary outbound egress | No HTTP client in `requirements.txt` (`httpx` removed with the Slack webhook, commit `4bc8c39`) | **Implemented** |
| SC-06 | Interactive API docs not publicly exposed | `main.py:10` `FastAPI()` with no `docs_url=None`/`openapi_url=None` → `/docs` + `/openapi.json` live and public. `main.py:42-45` comment confirms they are deliberately not shadowed | **Gap** — low impact, see RA-07 |
| SC-07 | Static mount cannot shadow API routes | `main.py:44-45` — mounted last | **Implemented** |

## SI — System & Information Integrity

| ID | Control | Evidence | As-built |
|---|---|---|---|
| SI-01 | Symbol upload validated (type/size/content) | `symbol_service.py:32-50` — extension, declared MIME, 2MB cap, SVG script blocklist | **Partial** — see SI-03 |
| SI-02 | Schematic image upload validated | `evaluate.py:84` `UploadFile` with **no** size cap, **no** content-type check; read whole into memory `evaluate.py:122`; decoded at `image_annotator.py:55` `Image.open(...).convert("RGB")` with no `MAX_IMAGE_PIXELS` override | **Gap** |
| SI-03 | SVG sanitisation is an allowlist | `symbol_service.py:46-50` — blocklist on `<script`, `javascript:`, `\bon\w+\s*=` only | **Partial** |
| SI-04 | Crop uploads bounded | `export.py:34` `crops: list[UploadFile] = File(default=[])` — no count cap; `export.py:43` reads every crop fully into memory before any check | **Gap** |
| SI-05 | Request payload array lengths bounded | `evaluate.py:41-59` `_validate_metadata` checks shape only, never length; `build_adjacency` is O(n²) over the same lists (`evaluate.py:106`) | **Gap** |
| SI-06 | Errors don't leak internals to clients | `main.py:10` no `debug=True`; no custom handler echoing internals; default Starlette 500 | **Implemented** |
| SI-07 | Path traversal prevented | `symbol_service.py:20-28,94-105` — IDs resolve via manifest lookup, never a raw filesystem join; stored names server-generated `slug_uuid.ext` (`symbol_service.py:52-56`) | **Implemented** |
| SI-08 | Dependency vulnerability scanning in CI | `.github/workflows/docker-publish.yml` — no SCA/audit/scan step; no Dependabot config in repo | **Gap** |
| SI-09 | Numeric input coerced safely | `evaluate.py:103-104` `int(canvas.get("width_px", 1200))` on attacker-controlled value outside any try block → `ValueError` → unhandled 500 | **Partial** — availability-neutral, cosmetic |

## CM — Configuration Management & Hardening

| ID | Control | Evidence | As-built |
|---|---|---|---|
| CM-01 | Container runs as non-root | `Dockerfile:32-34` `groupadd`/`useradd --system` + `USER app` before `CMD` | **Implemented** |
| CM-02 | `readOnlyRootFilesystem` declared | `k8s/app/deployment.yaml` has **no** `securityContext` block at all. Read-only FS is an observed *platform behaviour*, never asserted by the manifests | **Gap** |
| CM-03 | `allowPrivilegeEscalation: false` / capabilities dropped | No `securityContext` | **Gap** |
| CM-04 | seccomp / AppArmor profile | Not set | **Gap** |
| CM-05 | Minimal base image | `Dockerfile:16` `python:3.12-slim` | **Implemented** — not distroless, acceptable |
| CM-06 | No secrets baked into the image | `Dockerfile:28-29` documents runtime injection; grep for secret-shaped names found only placeholders | **Implemented** |
| CM-07 | Image referenced by immutable digest | `deployment.yaml:20` `ghcr.io/beese54/drawing-portal:latest` — mutable tag + `imagePullPolicy: Always` | **Gap** |
| CM-08 | `automountServiceAccountToken: false` | Not set | **Gap** |
| CM-09 | NetworkPolicy restricting pod egress/ingress | No NetworkPolicy anywhere in `k8s/` | **Gap** |
| CM-10 | Deployed config matches repo config | `deployment.yaml:27-33` requests 100m/128Mi, limits 500m/256Mi. GovPaaS console is set to 0.5 vCPU / 1024Mi (`ARCHITECTURE.md:141-143`) — **unreconciled divergence** | **Gap** — assurance |
| CM-11 | Health probes configured | `deployment.yaml:37-48` liveness + readiness on `/api/health` | **Implemented** — shallow, see CP-03 |

## CP — Contingency & Availability

| ID | Control | Evidence | As-built |
|---|---|---|---|
| CP-01 | Redundancy / no single point of failure | `deployment.yaml:7` `replicas: 1`, hard-constrained by `ReadWriteOnce` PVC (`persistentvolumeclaim.yaml:7-8`) | **Gap by constraint** |
| CP-02 | Backup / restore for PVC symbol data | Nothing in repo; platform snapshot policy unknown | **[UNVERIFIED]** — likely gap |
| CP-03 | Health check reflects real service health | `health.py:7-9` returns `{"status","version"}`, performs zero dependency checks — a green probe means "process is up", nothing more | **Partial** |
| CP-04 | Rollout strategy safe for RWO volume | Steady/one-at-a-time selected in the GovPaaS console specifically to avoid RWO mount deadlock. Not expressed in any in-repo manifest | **[UNVERIFIED]** — console-set, not re-confirmed this session |

## SR — Supply Chain

| ID | Control | Evidence | As-built |
|---|---|---|---|
| SR-01 | CI credentials least-privilege and ephemeral | `docker-publish.yml:9-11` `contents: read`, `packages: write`; uses `secrets.GITHUB_TOKEN`, not a long-lived PAT | **Implemented** |
| SR-02 | Registry access controlled | `ghcr.io/beese54/drawing-portal` is anonymously, publicly pullable | **Gap** |
| SR-03 | Image signing / provenance attestation / SBOM | No cosign, no `attest:`, no SBOM step in `docker-publish.yml` | **Gap** |
| SR-04 | CI actions pinned to immutable SHA | `docker-publish.yml` uses `@v4`, `@v3`, `@v5` — mutable tags | **Gap** |
| SR-05 | Build is reproducible from source in repo | Single root `Dockerfile`, multi-stage, `npm ci` with lockfile (`Dockerfile:4-5`) | **Implemented** |

## DP — Data Protection

| ID | Control | Evidence | As-built |
|---|---|---|---|
| DP-01 | Data classification assigned | OFFICIAL (OPEN), user-confirmed 2026-08-03 | **Implemented** |
| DP-02 | No PII collected | No accounts, no user fields. The only free-text inputs (feedback) were removed in commit `4bc8c39` | **Implemented** |
| DP-03 | User drawings not persisted server-side | `export.py:8-15` docstring; `evaluate.py:151-161` returns without writing. Drawings import/export as client-side `.json` | **Implemented** |
| DP-04 | Uploaded schematics not retained | Read into memory only (`evaluate.py:122`), never written to disk | **Implemented** |
| DP-05 | No database / no credential store | No DB dependency in `requirements.txt`; state is `manifest.json` on the PVC only | **Implemented** |

## RA — Risk & Vulnerability Management

| ID | Control | Evidence | As-built |
|---|---|---|---|
| RA-01 | Source code security review performed | `tasks/security_audit.md`, 2026-07-31, static read-only, `file:line` cited throughout | **Implemented** — partially stale, see RA-06 |
| RA-02 | System architecture documented | `docs/ARCHITECTURE.md` | **Implemented** — one factual defect, see RA-06 |
| RA-03 | Live vulnerability assessment (dynamic scan) | Never performed | **Gap** |
| RA-04 | Penetration test | Never performed. `pub.gov.sg` asset → requires a CSA-licensed provider under the Cybersecurity Act | **Gap** — cannot be closed by this project |
| RA-05 | Dependency CVE status validated | `requirements.txt` pins `fastapi==0.111.0`, `python-multipart==0.0.9`, `uvicorn==0.30.1` (mid-2024). Never checked against a CVE feed | **Gap** — unquantified |
| RA-06 | Security documentation is current | `security_audit.md` predates removal of boundaries #3 and #11 (12 remain, not 14). `ARCHITECTURE.md:160-164` says 13 — accounts for the webhook but still counts the removed feedback endpoint. `ARCHITECTURE.md:120-123` asserts "no `print`, no `logger` call" — contradicted by `evaluate.py:149` | **Gap** — both defects corrected in `ARCHITECTURE.md` this pass |

## IR — Incident Response

| ID | Control | Evidence | As-built |
|---|---|---|---|
| IR-01 | Documented incident response plan | Nothing in repo; org-level process not visible | **[UNVERIFIED]** |
| IR-02 | Alerting on service failure | No alerting config; no error aggregation (AU-03). Detection is manual | **Gap** |
| IR-03 | Published security contact / disclosure channel | No `SECURITY.md`; in-app feedback removed 2026-08-02 and never replaced. Tracked as DSS BD-9 (`PROGRESS.md:113`) | **Gap** |

---

## Tally

| Status | Count |
|---|---|
| Implemented | 19 |
| Partial | 9 |
| Gap | 27 |
| N/A (justified) | 1 |
| Gap by design (accepted — AC-05) | 1 |
| Gap by constraint (accepted — CP-01) | 1 |
| [UNVERIFIED] — needs console/org access | 7 |
| **Total** | **65** |

Verify with:

```bash
awk -F'|' '/^\| (AC|IA|AU|SC|SI|CM|CP|SR|DP|RA|IR)-[0-9]/ {print $5}' tasks/doc_audit.md \
  | sed 's/[* ]//g; s/—.*//' | sort | uniq -c | sort -rn
```

## [UNVERIFIED] — consolidated

Every item below needs GovPaaS console, GitHub org, Cloudflare or PUB
organisational access that this assessment did not have. These are **gaps in
this assessment's reach**, not confirmed control failures — the distinction
matters and should not be collapsed when this is read.

1. **AC-04** — whether `SYMBOLS_ADMIN_KEY` is set in the GovPaaS console.
2. **IA-03 / SC-01** — TLS configuration, cipher suites, HSTS at the platform edge.
3. **AU-06** — platform log retention, access control and tamper protection.
4. **CP-02** — PVC backup/snapshot policy.
5. **CP-04** — rollout strategy as actually configured in the console.
6. **IR-01** — PUB's organisational incident response process.
7. **Cloudflare zone posture** for the delegated subzone (WAF, edge rate limiting, bot management) — not reachable, and outside this project's admin rights.

## Citation sweep

All `file:line` references above resolved against the working tree on
2026-08-03. Re-run before submission if any code lands in between:

```bash
# from drawing-portal/
grep -n "allow_origins" backend/app/main.py
grep -n "def require_symbols_admin_key" backend/app/routers/symbols.py
grep -n "Image.open" backend/app/services/image_annotator.py
grep -rn "print(\|logger\.\|logging\." backend/app/
```

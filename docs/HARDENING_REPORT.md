# Hardening Report — Schematic Drawing Portal

**Date:** 2026-08-03
**Method:** Configuration review of the container image, workload manifests,
application runtime and CI/CD pipeline, against conventional container and
web-service hardening baselines (CIS Docker / CIS Kubernetes / OWASP shapes).
Every position cites a `file:line` read this session or is marked
`[UNVERIFIED]`.
**Companion documents:** `tasks/doc_audit.md` (control evidence),
`docs/RISK_ASSESSMENT.md` (risk ratings), `tasks/security_audit.md`
(2026-07-31 code review).

> **Scope boundary.** This report covers what the repository declares and
> what the image builds. It does **not** cover the GovPaaS platform's own
> hardening — node configuration, kernel, runtime sandboxing, edge WAF — nor
> the Cloudflare zone. Those need console and account access this review did
> not have, and are collected in §7.

---

## 1. Summary Scorecard

| Domain | Hardened | Partial | Not hardened | Verdict |
|---|---|---|---|---|
| Container image | 4 | 0 | 1 | **Good** |
| Workload manifests (k8s) | 2 | 0 | 7 | **Weak** |
| Application runtime | 4 | 4 | 5 | **Mixed** |
| CI/CD supply chain | 2 | 0 | 3 | **Weak** |
| Platform / edge | — | — | — | **[UNVERIFIED]** |

**Headline:** the *image* is in reasonable shape — non-root, slim base, no
baked secrets, reproducible build. The *deployment posture* around it is
close to default everywhere: the workload manifests declare no security
context at all, the application sets no security headers and no input
bounds, and the pipeline has no scanning, signing or SBOM.

The single highest-value change is not on this list's security-theatre end —
it is **bounding the two unauthenticated POST endpoints** (§5.1), because
those are the only paths where a remote party can currently affect the
service at all.

---

## 2. Container Image — `Dockerfile`

| # | Control | Status | Evidence |
|---|---|---|---|
| 2.1 | Runs as a non-root user | ✅ **Hardened** | `Dockerfile:32-34` — `groupadd --system` + `useradd --system --gid app`, `chown -R app:app /app`, `USER app` set **before** `CMD` |
| 2.2 | Minimal base image | ✅ **Hardened** | `Dockerfile:16` `python:3.12-slim`. Not distroless, but appropriate — the app needs a shell-less Python runtime only, and slim is a reasonable stopping point |
| 2.3 | No secrets baked into layers | ✅ **Hardened** | `Dockerfile:28-29` documents runtime injection; the only `ENV` is a non-sensitive `ALLOWED_ORIGINS` default (line 30). Repo grep for secret-shaped names returns only placeholders |
| 2.4 | Multi-stage build discards build tooling | ✅ **Hardened** | `Dockerfile:1-13` builds the frontend in `node:20-alpine`, then `Dockerfile:26` copies only `dist/` into the runtime stage. No Node toolchain in the final image |
| 2.5 | Base image pinned by digest | ❌ **Not hardened** | `Dockerfile:2,16` use mutable tags (`node:20-alpine`, `python:3.12-slim`). A rebuild can silently pull a different base |

**Note on `Dockerfile:37-38`** — the `HEALTHCHECK` is well-formed but
redundant under Kubernetes/GovPaaS, which uses the manifest probes instead.
Harmless.

### Recommendation 2.5

```dockerfile
FROM node:20-alpine@sha256:<digest> AS frontend-build
FROM python:3.12-slim@sha256:<digest>
```

Low effort, and it makes the build reproducible in the sense an assessor
means by the word.

---

## 3. Workload Manifests — `k8s/`

This is the weakest domain. `k8s/app/deployment.yaml` contains **no
`securityContext` block at any level** — not on the pod, not on the
container.

| # | Control | Status | Evidence |
|---|---|---|---|
| 3.1 | `runAsNonRoot: true` declared | ❌ **Not hardened** | No `securityContext`. The image sets `USER app`, so it *runs* as non-root — but the manifest asserts nothing, so a future image regression would go uncaught |
| 3.2 | `readOnlyRootFilesystem: true` | ❌ **Not hardened** | Not declared. The production filesystem **is** read-only in practice — discovered empirically when a SQLite write failed with `OperationalError('unable to open database file')` — but that is an **observed platform behaviour, not a requested control**. The security posture currently leans on a property nothing enforces |
| 3.3 | `allowPrivilegeEscalation: false` | ❌ **Not hardened** | Not declared → defaults to `true` |
| 3.4 | Linux capabilities dropped | ❌ **Not hardened** | No `capabilities.drop`. The container retains the default set; this app needs none of them |
| 3.5 | seccomp profile | ❌ **Not hardened** | No `seccompProfile`. `RuntimeDefault` would be appropriate and costs nothing |
| 3.6 | `automountServiceAccountToken: false` | ❌ **Not hardened** | Not set → a Kubernetes API token is mounted into a pod that never calls the Kubernetes API |
| 3.7 | NetworkPolicy restricting egress | ❌ **Not hardened** | No NetworkPolicy anywhere in `k8s/`. The app makes no outbound calls (verified, `SC-05`), so a default-deny egress policy would be free to adopt and would durably enforce that property |
| 3.8 | Resource requests and limits set | ✅ **Hardened** | `deployment.yaml:27-33` — requests 100m/128Mi, limits 500m/256Mi. **But see §3.10** |
| 3.9 | Health probes configured | ✅ **Hardened** | `deployment.yaml:37-48` — liveness and readiness on `/api/health`. Shallow by design: `health.py:7-9` performs zero dependency checks, so a green probe means "the process is up", nothing more |
| 3.10 | Manifests match deployed configuration | ❌ **Not hardened** | **Confirmed divergence.** Manifests limit to 500m/256Mi; the GovPaaS console runs 0.5 vCPU / 1024Mi (`ARCHITECTURE.md:141-143`). Neither is marked authoritative — so §3.8's "hardened" verdict describes a file that may not govern the running service |

### Recommendation 3.1–3.6 — drop-in block

Add to `k8s/app/deployment.yaml` under `spec.template.spec`:

```yaml
    spec:
      automountServiceAccountToken: false
      securityContext:
        runAsNonRoot: true
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: app
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop: ["ALL"]
```

`runAsUser` is deliberately omitted above. `Dockerfile:32` uses
`useradd --system`, which allocates a UID from the system range rather than
a fixed value — this review did not determine what that UID actually is.
Either pin it explicitly in the Dockerfile (`useradd --system --uid 10001`)
and then set the matching `runAsUser` here, or rely on `runAsNonRoot: true`
alone, which enforces the property without asserting a number.

**Before applying `readOnlyRootFilesystem: true`**, confirm nothing writes
outside the PVC mount at `/app/symbols`. Two paths to check: the symbol
upload flow (`symbol_service.py` — writes under `settings.custom_symbols_dir`,
which is on the PVC, so fine) and any Python bytecode caching. If `.pyc`
writes cause trouble, add `PYTHONDONTWRITEBYTECODE=1` to the Dockerfile or
mount an `emptyDir` at `/tmp`.

### Recommendation 3.10 — resolve the divergence first

This should be actioned **before** the rest of §3, because it determines
whether editing `k8s/` changes anything at all. Two honest options:

1. GovPaaS is the only deployment target → **delete `k8s/`**, and apply the
   equivalent settings in the console. Maintaining manifests that govern
   nothing is worse than having none, because it makes assessments wrong.
2. `k8s/` is intended to be authoritative → reconcile the console to match
   it, and say so in `ARCHITECTURE.md`.

---

## 4. Application Runtime — `backend/app/`

| # | Control | Status | Evidence |
|---|---|---|---|
| 4.1 | Debug mode disabled | ✅ **Hardened** | `main.py:10` — no `debug=True` |
| 4.2 | Errors don't leak internals to clients | ✅ **Hardened** | No custom handler echoing internals; default Starlette 500. Stack traces go to stderr (`evaluate.py:149`), not to the response |
| 4.3 | Path traversal prevented | ✅ **Hardened** | `symbol_service.py:20-28,94-105` — symbol IDs resolve through a manifest lookup, never a raw filesystem join. Stored filenames are server-generated `slug_uuid.ext` (`symbol_service.py:52-56`) |
| 4.4 | Static mount cannot shadow API routes | ✅ **Hardened** | `main.py:44-45` — mounted last, deliberately |
| 4.5 | Admin credential fails closed | ⚠️ **Partial** | `config.py:16` defaults to `""`; `symbols.py:16-17` returns 401 when falsy — correct. **But** the key is not set in the GovPaaS console, so the three routes are currently inert. Safe, not functional |
| 4.6 | Upload validation | ⚠️ **Partial** | `symbol_service.py:32-50` validates extension, declared MIME and a 2MB cap for symbols. `evaluate.py:84` (schematic image) and `export.py:34` (crops) validate **nothing** |
| 4.7 | SVG sanitisation | ⚠️ **Partial** | `symbol_service.py:46-50` is a blocklist (`<script`, `javascript:`, `\bon\w+\s*=`), not an allowlist. `<foreignObject>` and CSS `@import` vectors untested |
| 4.8 | Access logging | ⚠️ **Partial** | uvicorn default only (`Dockerfile:39`). Plain text, no structured fields, no application events |
| 4.9 | CORS restricted to known origins | ❌ **Not hardened** | `main.py:14` `allow_origins=["*"]`, plus `main.py:24-32` `force_cors` which **unconditionally overwrites** the header to `*` on every response — so this cannot be tightened by configuration alone. `config.py:39-40` defines `origins_list` and nothing references it |
| 4.10 | Security response headers | ❌ **Not hardened** | No HSTS, CSP, `X-Frame-Options`, `X-Content-Type-Options` or `Referrer-Policy` anywhere |
| 4.11 | Request size / array bounds | ❌ **Not hardened** | `evaluate.py:41-59` validates shape, never length; `build_adjacency` is O(n²) over the same lists. `evaluate.py:84` image upload uncapped and undecoded-size-unbounded. `export.py:34` crop count uncapped |
| 4.12 | Rate limiting | ❌ **Not hardened** | No library in `requirements.txt`, no throttling code. Not documented as a GovPaaS console option — treat as an application-level fix |
| 4.13 | Interactive API docs disabled in production | ❌ **Not hardened** | `main.py:10` — `/docs` and `/openapi.json` are live and public |

### 4.1 Recommendation — bound the public endpoints (highest value)

This is the change that matters most. Both public POST endpoints are
currently unauthenticated, unbounded and unmonitored.

```python
# evaluate.py — in _validate_metadata
MAX_ELEMENTS = 5_000   # tune to the largest legitimate drawing
MAX_PIPES    = 5_000

if len(elements) > MAX_ELEMENTS:
    raise HTTPException(422, f"metadata.elements exceeds {MAX_ELEMENTS} entries.")
if len(pipes) > MAX_PIPES:
    raise HTTPException(422, f"metadata.pipes exceeds {MAX_PIPES} entries.")
```

```python
# image_annotator.py — cap the decoded size, not just the encoded size
from PIL import Image
Image.MAX_IMAGE_PIXELS = 40_000_000   # ~120MB after .convert("RGB")
```

Pillow's **default** `MAX_IMAGE_PIXELS` is ~89.5M pixels. At three bytes per
pixel after `.convert("RGB")` (`image_annotator.py:55`) that is roughly
268MB — above the 256Mi container limit. **The default guard does not
protect a container this size**; it must be lowered explicitly.

Also cap the encoded upload before it reaches Pillow, and cap crop count in
`export.py:34`. Then add `slowapi` for per-IP limits.

### 4.9 Recommendation — CORS

`force_cors` (`main.py:24-32`) exists for a real reason — its comment
records that removing it in commit `d99ab4e` reintroduced a live CORS
failure on symbol-image loads. Do not delete it blindly. Narrow it to the
path it was added for:

```python
@app.middleware("http")
async def force_cors(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/symbols/"):
        response.headers["Access-Control-Allow-Origin"] = "*"
    return response
```

…and point `CORSMiddleware` at `settings.origins_list` (`config.py:39-40`),
which already exists and is currently dead code.

### 4.10 Recommendation — security headers

```python
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response
```

`X-Content-Type-Options: nosniff` is the one that earns its place here,
given the app serves user-supplied SVG from its own origin.

### 4.13 Recommendation — API docs

```python
app = FastAPI(
    title="Schematic Drawing Portal API",
    version=settings.app_version,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)
```

Low value defensively — the same endpoints are already enumerable from the
shipped `frontend/src/api/client.ts` bundle — but it is a one-line change
and reviewers expect it.

---

## 5. Logging & Monitoring Posture

Called out separately because the cyber team asked specifically about
piping logs to Sentry, and the current state is more sparse than the phrase
implies.

| Aspect | Current state |
|---|---|
| Application logging | **None.** No `logging` config, no logger, no structured events anywhere in `backend/app/` |
| Error capture | **One line.** `evaluate.py:149` `traceback.print_exc()` — stderr, no request correlation, inside a `except Exception:` that silently continues |
| Access logging | uvicorn default only — plain text, unstructured |
| Audit trail | **None.** No state-change logging, and no identity concept to attribute actions to |
| Error aggregation | **None.** No `sentry-sdk` in `requirements.txt`; zero `sentry` references repo-wide |
| Alerting | **None.** Failure detection is manual |

### What "pipe logs to Sentry" actually requires

1. **Create the telemetry.** There is almost nothing to pipe today. This means adding exception capture, request context and state-change events — the bulk of the work, and it precedes any Sentry configuration.
2. **Add `sentry-sdk[fastapi]`** and initialise it. Its FastAPI integration hooks unhandled exceptions automatically; `evaluate.py:149`'s swallowed exception should be converted to an explicit `capture_exception` so it stops disappearing.
3. **Accept a new egress path.** This introduces the application's **first and only outbound network call**. `ARCHITECTURE.md:41-43` currently asserts the app makes "no outbound network calls of any kind", and that property is load-bearing in the security posture (control `SC-05`). It must be updated, and GovPaaS-side egress may need approval.
4. **Scrub before sending.** Sentry captures request bodies and headers by default. Here that would include `metadata_json` (a user's full drawing) and the `X-Admin-Key` header. Configure `send_default_pii=False` and an explicit `before_send` scrubber.

Point 3 is the one to raise with the cyber team before starting — it
reverses an architectural property they may have already credited.

---

## 6. CI/CD Supply Chain — `.github/workflows/docker-publish.yml`

| # | Control | Status | Evidence |
|---|---|---|---|
| 6.1 | Least-privilege workflow permissions | ✅ **Hardened** | Lines 9-11 — `contents: read`, `packages: write` only |
| 6.2 | Ephemeral credentials, no long-lived PAT | ✅ **Hardened** | Uses `secrets.GITHUB_TOKEN`, scoped per-run |
| 6.3 | Third-party actions pinned to commit SHA | ❌ **Not hardened** | `@v4`, `@v3`, `@v5` — mutable tags. A compromised action tag would execute in a workflow holding `packages: write` |
| 6.4 | Dependency / image vulnerability scanning | ❌ **Not hardened** | No `pip-audit`, no `npm audit`, no Trivy/Grype image scan, no Dependabot config in the repo |
| 6.5 | SBOM generation and build provenance | ❌ **Not hardened** | No SBOM step, no `attest:`, no cosign signing |
| 6.6 | Registry access controlled | ❌ **Not hardened** | `ghcr.io/beese54/drawing-portal` is anonymously, publicly pullable |
| 6.7 | Build reproducible from source | ✅ **Hardened** | Single root `Dockerfile`, `npm ci` against a committed lockfile (`Dockerfile:4-5`) |

### Recommendations 6.3–6.5

```yaml
      - uses: actions/checkout@<40-char-sha>   # v4.2.2
      - uses: docker/build-push-action@<40-char-sha>   # v5.4.0
        with:
          sbom: true
          provenance: mode=max

      - name: Audit Python dependencies
        run: pip install pip-audit && pip-audit -r backend/requirements.txt

      - name: Audit npm dependencies
        run: npm audit --audit-level=high
        working-directory: frontend
```

Run the two audit steps **once locally first** — they will produce the data
needed to re-rate risk `R-08`, which is currently rated on absence of
assurance rather than on any known advisory.

### Recommendation 6.6 — order matters

Add the GovPaaS pull credential (GitHub PAT scoped `read:packages`)
**before** flipping the GHCR package to private. Reversing the order breaks
the next image pull.

---

## 7. Platform & Edge — [UNVERIFIED]

Not assessable from the repository. Each needs GovPaaS console, Cloudflare
or PUB organisational access. These are **gaps in this review's reach**, not
confirmed failures.

| Area | Question for whoever holds access |
|---|---|
| TLS configuration | Cipher suites, TLS version floor, HSTS preload, certificate issuance and renewal at the edge |
| WAF / DDoS | Does GovPaaS or the Cloudflare zone apply any WAF, edge rate limiting or bot management? Relevant because `R-01`/`R-02` currently have no application-level defence |
| `.code.run` exposure | The service is publicly reachable on the platform hostname today, which bypasses any protection scoped to the `pub.gov.sg` zone. Is that intended at this stage? |
| Secrets management | How is `SYMBOLS_ADMIN_KEY` stored, injected and rotated? The Dockerfile documents runtime injection; the mechanism is a platform feature |
| Log retention | Retention period, access control and tamper protection for the platform's log stream |
| Volume snapshots | Is the 1Gi PVC backed up? Only user-uploaded custom symbols are at risk — the default set is version-controlled |
| Runtime sandboxing | gVisor, seccomp enforcement, node hardening — whatever GovPaaS provides beneath the manifests |
| Path-based policies | GovPaaS supports per-path IP/header/SSO rules. A second gate on `POST/PATCH/DELETE /api/symbols` would be defence-in-depth on top of the code-level `X-Admin-Key` guard |

---

## 8. Prioritised Remediation

| Priority | Item | Section | Effort |
|---|---|---|---|
| **P1** | Bound `/api/evaluate` arrays; cap image upload; lower `Image.MAX_IMAGE_PIXELS`; cap `export.py` crops | §4.1 | Low |
| **P1** | Run `pip-audit` + `npm audit` once; re-rate `R-08` | §6.4 | Low |
| **P1** | Reconcile `k8s/` against the GovPaaS console — or delete it | §3.10 | Low |
| **P1** | Decide whether `.code.run` public exposure is intended now | §7 | Decision |
| **P2** | Set `SYMBOLS_ADMIN_KEY` in the console (routes are currently inert) | §4.5 | Trivial |
| **P2** | Add the `securityContext` block + `automountServiceAccountToken: false` | §3 | Low |
| **P2** | Add per-IP rate limiting (`slowapi`) | §4.12 | Low–Medium |
| **P2** | Error capture → structured logging → Sentry (read §5 first) | §5 | **Medium–High** |
| **P3** | Narrow `force_cors`; wire CORS to `origins_list` | §4.9 | Low |
| **P3** | Add security response headers | §4.10 | Low |
| **P3** | Disable `/docs` and `/openapi.json` | §4.13 | Trivial |
| **P3** | Pin base images, CI actions by digest/SHA; add SBOM + provenance | §2.5, §6.3-6.5 | Low–Medium |
| **P3** | Pull credential → GHCR private; pin deployed image by digest | §6.6 | Low |
| **P3** | Default-deny NetworkPolicy (free — the app makes no outbound calls) | §3.7 | Low |
| **P4** | Replace the SVG blocklist with an allowlist sanitiser | §4.7 | Medium |

---

## 9. What This Report Does *Not* Claim

1. **Not a benchmark certification.** No CIS Benchmark tool was run. This is a configuration review shaped by those baselines, not a scored assessment against one.
2. **Not a runtime assessment.** Nothing was executed against the deployed service. Every verdict derives from reading the repository.
3. **Not a claim that the manifests govern production.** §3.10 documents a confirmed divergence between `k8s/` and the GovPaaS console. Where they differ, §3's verdicts describe the file, not the running system.
4. **Not a platform assessment.** §7 is explicitly out of reach.
5. **Not a substitute for penetration testing.** See `docs/RISK_ASSESSMENT.md` R-15 — a `pub.gov.sg` asset requires a CSA-licensed provider under the Cybersecurity Act.

---

## Revision History

| Date | Change | By |
|---|---|---|
| 2026-08-03 | Initial report. Image domain good; manifest, runtime and pipeline domains largely default. Newly identified this pass: unbounded Pillow decode path (§4.11), Pillow's default bomb guard exceeding the container ceiling (§4.1), public `/docs` (§4.13), `automountServiceAccountToken` (§3.6) | Development team |

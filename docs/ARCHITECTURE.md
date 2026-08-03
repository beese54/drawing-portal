# System Architecture — Schematic Drawing Portal

For PUB (Singapore's national water agency), deployed on GovPaaS
(Northflank-based) at `wsi-drawing-portal.pub.gov.sg`. Written to be handed
directly to a cyber/security team; grounded in the actual code and deploy
config rather than any feature list. The service performs no AI or model
inference of any kind — see §3.

## 1. Component overview

```
                            ┌─────────────────────────────┐
   Browser (public,  ─────▶ │   Single combined container │
   no login)                │   (GovPaaS / Northflank)    │
                            │                              │
                            │  ┌────────────────────────┐  │
                            │  │ Static frontend (React/ │  │
                            │  │ Vite/Konva) served from │  │
                            │  │ ./static, mounted at /  │  │
                            │  └────────────────────────┘  │
                            │              │ same-origin    │
                            │              ▼                │
                            │  ┌────────────────────────┐  │
                            │  │ FastAPI backend         │  │
                            │  │ (uvicorn, port 8000)    │  │
                            │  │  /api/evaluate          │  │
                            │  │  /api/export/docx       │  │
                            │  │  /api/symbols/*         │  │
                            │  │  /api/health            │  │
                            │  └───────────┬────────────┘  │
                            │              │                │
                            └──────────────┼────────────────┘
                                           │
                                           ▼
                              PersistentVolumeClaim
                              (ReadWriteOnce, 1Gi)
                              custom symbol files +
                              manifest.json
```

The app makes **no outbound network calls of any kind**. A Slack feedback
webhook was the sole exception; it was removed on 2026-08-01, along with
`httpx`, the only HTTP client in the dependency list.

There is no database anywhere in this app. State lives in two places only:
the symbol manifest/files on the PVC, and whatever the browser holds
in-memory for the current drawing session (drawings are imported/exported
as `.json` files by the user, not persisted server-side).

## 2. Backend components (`backend/app/`)

- **`routers/`** — one file per HTTP surface: `symbols.py` (CRUD for symbol
  library), `evaluate.py` (compliance evaluation), `export.py` (DOCX report
  generation), `health.py` (liveness/readiness).
- **`agents/`** — deterministic compliance-check functions, not LLM agents
  despite the name: `compliance_checks.py` (backflow prevention / supply
  mode / water efficiency), `tank_pump_check.py`, `long_bath_check.py`,
  `hot_water_contamination_check.py`, `section3_pipe_check.py`,
  `highest_fitting_check.py`, plus `graph_utils.py` (shared
  element/pipe-adjacency graph builder used by several checks).
- **`services/`** — `symbol_service.py` (upload/rename/delete + validation
  for the symbol library), `image_annotator.py` (Pillow-based marker
  overlay on an uploaded schematic JPEG for the evaluation report).
- **`schemas/manifest.py`** — flat JSON-file "database" for the symbol
  library (`symbols_dir/manifest.json`), read/written directly, no locking.
- **`models/symbol.py`**, **`config.py`** — Pydantic models and
  `pydantic-settings`-based config (env-var driven).

## 3. Frontend (`frontend/src/`)

React + TypeScript + Vite, canvas rendering via Konva
(`react-konva`)/`use-image`. State managed with Zustand
(`store/canvasStore.ts`, `store/uiStore.ts`). No client-side routing
(single page, no react-router) and no authentication UI of any kind. Talks
to the backend via `api/client.ts`, using a relative base URL — same-origin
by construction since frontend and backend ship in one combined image.

## 4. Data flow — main use cases

**Drawing + compliance evaluation:** user builds a schematic on the Konva
canvas client-side → clicks evaluate → frontend POSTs `metadata_json`
(the full elements/pipes/canvas JSON) + optionally the rendered schematic
as a JPEG to `POST /api/evaluate` → backend runs 8 compliance-check
functions synchronously and returns a structured JSON report, optionally
with a base64 annotated image → nothing is persisted server-side; the
response goes straight back into the browser's evaluation modal.

**Compliance report export:** the frontend already holds the full
evaluation result and captures per-issue crop images directly from the live
canvas → POSTs `manifest_json` (row data) + the crop images to
`POST /api/export/docx` → backend assembles a Word document in-memory
(`io.BytesIO`, no disk temp files) and streams it back. Nothing persisted.

**Symbol library:** `GET /api/symbols` lists everything (built-in +
custom) from `manifest.json`; `GET /api/symbols/{id}/image` serves the
actual SVG/PNG file; `POST/PATCH/DELETE /api/symbols` let any caller
add/rename/delete custom symbols on the shared PVC — there is no per-user
ownership, so this is a shared, mutable global resource (see the security
audit, `tasks/security_audit.md`, for the implications).

**Feedback:** removed 2026-08-02. `POST /api/feedback` and its modal
collected three ratings and two free-text boxes, printed to stdout. The
free-text fields were the only route by which arbitrary user-supplied text
entered the service and reached the log stream; deleting the feature closes
that path outright rather than mitigating it. The service now has no
feedback or support channel — publishing one is tracked as DSS control
BD-9.

## 4a. Logging and the container filesystem

**The production container filesystem is not writable.** This was discovered
empirically: an early SQLite-backed feedback store failed in production with
`OperationalError('unable to open database file')`, which is why that
feature was redesigned around stdout before being removed altogether. The
property holds regardless of the feedback feature and is relied on by the
security posture — but note it is a platform behaviour, not an asserted one:
the in-repo k8s manifests set no `securityContext` and no
`readOnlyRootFilesystem`.

**The application emits almost no logs of its own.** As of 2026-08-03 there
is no `logger` call and no `logging` configuration anywhere in
`backend/app/`. There is exactly **one** application-emitted output in the
whole backend: `traceback.print_exc()` at `routers/evaluate.py:149`, which
prints a stack trace to stderr when schematic-image annotation fails, inside
an `except Exception:` that then silently continues. It carries no request
correlation and no structured fields.

Everything else is uvicorn's default access log — plain text, one line per
request, no application events. Anything resembling an audit trail would
have to be built from scratch, and that single `print_exc` is the natural
first hook for error aggregation.

(An earlier revision of this section stated there was no `print` call at
all. That was wrong — corrected 2026-08-03 during the risk assessment.)

## 5. Deployment topology

- **Build:** a single root-level multi-stage `Dockerfile` — stage 1
  (`node:20-alpine`) builds the frontend with `VITE_API_BASE_URL=""` baked
  in (relative paths); stage 2 (`python:3.12-slim`, non-root `app` user)
  copies the backend + built frontend `dist/` into `./static/`.
- **CI/CD:** `.github/workflows/docker-publish.yml` builds and pushes to
  `ghcr.io/beese54/drawing-portal` on every push to `main` or a `v*.*.*`
  tag, using the ephemeral `GITHUB_TOKEN` (scoped `contents: read`,
  `packages: write`). The image is currently anonymously, publicly
  pullable.
- **Runtime:** GovPaaS (Northflank-based PaaS), one pod, `replicas: 1` —
  this is a hard requirement, not a sizing choice: the custom-symbol
  storage is a `ReadWriteOnce` PVC, which a second replica physically
  cannot mount. Resources: 0.5 vCPU / 1024Mi requested at the platform
  level (k8s manifests in-repo request less — 100m/128Mi request,
  500m/256Mi limit — platform-level GovPaaS config may differ from the
  in-repo manifests; reconcile before treating either as authoritative).
  Rollout strategy: Steady (one-at-a-time), specifically because a
  surge-style rollout would deadlock trying to mount the RWO volume the
  outgoing pod still holds.
- **Networking:** publicly exposed, no IP allowlist, no basic auth, no
  SSO/org-restricted access at the platform level. Custom domain
  `wsi-drawing-portal.pub.gov.sg` reaches the app via a Cloudflare NS
  delegation for that subzone, managed by GovPaaS/Airbase on the DNS side.
- **Health checks:** both liveness and readiness hit `GET /api/health`,
  which does zero dependency checks (no DB/disk/network calls) — safe to
  share since there's nothing to check, but also means a healthy probe
  response tells you nothing about the app's actual working state beyond
  "the process is up."

## 6. Trust / network boundaries

See `tasks/security_audit.md` Phase 0 for the full numbered list. That audit
was written against 14 boundaries. **Two no longer exist:** #11, the
outbound Slack webhook (removed 2026-08-01), and #3, `POST /api/feedback`
(removed 2026-08-02 with the whole feedback feature). That leaves **12**: 7
HTTP endpoints, health check, static mount, the client-local JSON import,
and the two CI/CD → registry → runtime supply-chain hops. The audit is kept
as a dated record rather than edited retroactively.

(An earlier revision of this section said 13 — it accounted for the webhook
removal but still counted the deleted feedback endpoint. Corrected
2026-08-03.)

Note that the audit also predates the `X-Admin-Key` guard now on
`POST`/`PATCH`/`DELETE /api/symbols` — see its own Remediation Log. The
single most important fact for a reviewer: **every other HTTP endpoint in
this app is unauthenticated**
— there is no login, no API key, no session, no user concept anywhere in
the codebase.

## 7. Explicitly out of scope / not visible from this repo

This document only reflects what's checked into the repository. It does
**not** cover, and this team should not assume it covers:

- **GovPaaS/Northflank's own ingress/edge layer** — load balancer config,
  TLS termination details, any WAF or DDoS mitigation the platform provides
  independently of what's requested in `k8s/`.
- **PUB's WOG (Whole-of-Government) DNS infrastructure** — the
  `pub.gov.sg` zone is administered outside this project; the developer
  does not hold admin rights to it.
- **The Cloudflare zone** GovPaaS/Airbase manages for the delegated
  `wsi-drawing-portal.pub.gov.sg` subzone — actual A/CNAME/TLS records and
  any Cloudflare-side security features (WAF rules, rate limiting, bot
  management) live in a Cloudflare account this project has no visibility
  into.
- **Runtime secrets storage** on the GovPaaS platform itself — the app's one
  remaining secret, `SYMBOLS_ADMIN_KEY`, is injected at container runtime per
  a Dockerfile comment, but the actual secrets-management mechanism (vault,
  platform secret store, etc.) is a platform feature, not app code.

These gaps are the natural handoff points to a cyber/infra team — they
require platform/account access this review didn't have, not more code
reading.

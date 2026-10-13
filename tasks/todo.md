# Resume here (paused 2026-10-13)

v1.1.5 is live on GovPaaS, and the DAST schedule is green against `:1.1.5`.
The remaining hardening items are in "Next plan: application hardening"
(under the 1.1.3 plan below):
- **H4:** request logging: request id, route, status, duration, no
  payloads.
- **H5:** Python transitive lockfile with hashes.
- **H6:** HSTS. GovPaaS's call, still unanswered.
- **Small follow-up:** the GitHub release workflow's actions still target
  Node 20, and GitHub forces them onto Node 24. Bump their versions. Also,
  `ubuntu-latest` becomes Ubuntu 26 from 2026-10-19.

Release flow, unchanged: push (with OK) → GitLab "Update now", green → tag
(with OK) → verify the published image → the user switches GovPaaS and
`DAST_APP_IMAGE` → run the schedule.

---

# H2: full Content-Security-Policy + Permissions-Policy (2026-10-13), RELEASED in v1.1.5

**Inventory (measured):**
- **Scripts:** only `/assets/*.js` from this origin. The bundle has no
  `eval` or `new Function` and no workers. Since H1 there is no CDN script.
- **Inline `<style>`:** two blocks, which must move to a CSS file:
  - `index.html` (base reset)
  - `ToastNotification.tsx` (`@keyframes slideInToast`)
- **React `style={{}}`** sets styles through the CSSOM, which CSP does not
  restrict. This holds across the whole canvas UI.
- **Libraries:**
  - svg2pdf builds `<style>` inside a detached
    `document.implementation.createHTMLDocument`, which is outside the page
    policy (to be confirmed by the PDF test).
  - jsPDF's html2canvas, DOMPurify and canvg chunks load only for
    `.html()` / `addSvgAsImage`, which the app doesn't use.
- **Symbol SVGs:** none of the 70 contains `<style>` or `style=`.
- **Images:** `'self'` plus `data:` (stamps, drag ghost), as today.
- **Network:** fetch and XHR go to `/api` only.

**Policy:**

    default-src 'self'; script-src 'self'; style-src 'self';
    img-src 'self' data:; font-src 'self'; connect-src 'self';
    object-src 'none'; base-uri 'none'; form-action 'none';
    frame-ancestors 'none'

- `Permissions-Policy: camera=(), microphone=(), geolocation=(),
  payment=(), usb=()`
- Not included:
  - `upgrade-insecure-requests`: TLS is the edge's job, and the directive
    breaks plain-http local testing.
  - HSTS: H6, which is GovPaaS's call.

**Tasks:**
- [x] Tests first:
  - the exact header plus a "no unsafe-inline / unsafe-eval" assertion
  - `Permissions-Policy`
  - the update to `test_request_limits` that pins the old CSP string
- [x] Move both inline style blocks into `src/index.css`, imported from
  `main.tsx`.
- [x] Add an ESLint `no-restricted-syntax` rule against JSX `<style>`, so
  the inline block cannot come back.
- [x] Set the headers in `main.py`.
- [x] **Verify in Chrome against the built image, with console tracking on
  before load and a `securitypolicyviolation` listener.** Zero violations
  across:
  - load
  - symbols render
  - template
  - stamp image (`data:`)
  - JSON import and export
  - evaluate and report modal
  - DOCX export
  - PDF export with stamps
  - the toast animation rule present
  - also: the CSP header on a symbol SVG opened directly
- [x] Pre-push gates (Alpine uid 65533, node:24-alpine), fuzz, Trivy.
- [x] Release 1.1.5 (2026-10-13):
  - pushed `e256534..9633b94`; GitLab green (user)
  - tag `v1.1.5` → `9633b94`; GitHub Actions run 38367286826 succeeded
  - **published `:1.1.5` checked:**
    - anonymous pull returns 200; health reports `1.1.5/9633b94`
    - full CSP and `Permissions-Policy` present; nosniff, `DENY` and
      `no-referrer` unchanged
    - `/docs`, `/redoc` and `/openapi.json` return 404
    - the served `index.html` has no inline code
    - `docker diff` is empty; Trivy 0 (Alpine and Python packages)
- [x] The user switched GovPaaS and `DAST_APP_IMAGE` to `:1.1.5`; the
  schedule is green.

**Review:**
- **Tests:** the 4 new header tests failed on the old code.
  - Backend: 193 passed, 7 skipped; 200 passed with the black-box fuzz
    against the image.
  - ci: 9 passed.
- **Frontend:**
  - audit 0, typecheck OK, lint 0 errors, harness 22/22
  - the lint rule was seen to reject a JSX `<style>` probe
  - the built `index.html` has no inline code: one script, one stylesheet
- **Built image:** `docker diff` empty, Trivy 0. Dev compose serves
  `/src/index.css`.
- **Chrome on the built image, under the enforced policy:**
  - page load:
    - 76 requests, all same-origin or `data:`, all 200/304
    - body background and box-sizing from `index.css` apply
    - `slideInToast` keyframes present; 66/66 images
  - with a `securitypolicyviolation` listener running, zero violations
    across:
    - symbol placement
    - JSON export
    - import with three PNG `data:` stamps (re-encoded, kept on re-export)
    - the pre-evaluation checklist, then evaluate (report modal)
    - Export to Word (66,918-byte docx)
    - PDF export with stamps (1 page, 1 image XObject)
  - **positive control:** an injected inline `<script>` did not run, an
    injected `<style>` was not applied, `eval` threw `EvalError`, and the
    listener recorded both violations
  - a symbol SVG opened directly renders under the policy
- **Instrument caveats (now in lessons):**
  - The Chrome console tool does not show CSP reports.
  - ReportingObserver(buffered) caught nothing, not even the control.
  - So load-time evidence is the network list plus the inline-free
    `index.html`.
  - A test patch on `HTMLInputElement.prototype.click` swallowed checkbox
    clicks; it was mistaken for an app bug until diagnosed.

---

# H1: API docs off in production (2026-10-13), RELEASED in v1.1.4 with T1

- [x] `tests/test_api_docs.py` written first. 4 tests failed on the old
  code (`/docs`, `/redoc`, `/openapi.json` and `/docs/oauth2-redirect`
  returned 200).
- [x] `ENABLE_API_DOCS` (default off) → `docs_url`, `redoc_url` and
  `openapi_url` are `None`. Turned on in `docker-compose.yml` and
  `start.sh`; documented in `.env.example` and the README.
- [x] Alpine as uid 65533: 188 passed, 7 skipped; ci 9 passed.
- [x] **Built image:**
  - all 4 docs paths return 404, while `/`, `/api/health` and
    `/api/symbols` return 200
  - with `ENABLE_API_DOCS=1`, `/docs` and `/openapi.json` return 200
  - fuzz 7/7, `docker diff` empty, Trivy 0
- [x] Dev compose: `/docs` and `/openapi.json` return 200, and the app is
  served through Vite.
- [x] Release 1.1.4 (2026-10-13):
  - pushed `d3ee323..e256534`; GitLab green (user)
  - tag `v1.1.4` → `e256534`; GitHub Actions run 38357090844 succeeded
  - **published `:1.1.4` checked:**
    - anonymous pull returns 200; health reports `1.1.4/e256534`
    - `/docs`, `/redoc` and `/openapi.json` return 404; `/` and
      `/api/symbols` return 200
    - evil-origin request gets no ACAO
    - writing code gives Permission denied; `docker diff` is empty
    - Trivy 0
- [x] The user switched GovPaaS and `DAST_APP_IMAGE` to `:1.1.4`; the
  schedule is green.

# T1: make CI's type check real (2026-10-13), RELEASED in v1.1.4

- [x] Fix the 5 latent errors (4 app, 1 vite config), with no runtime
  behaviour change.
  - The `'outlet'` branch was dead since upstream v2 (`d1aec91`) removed
    that node type together with the fire hydrant and sump manhole. Water
    fittings were never counted.
  - `hydraulic_context` is not read by the backend at all. Not changed to
    `'water_fitting'`, which would be a behaviour change.
- [x] `npm run typecheck` checks both configs; `frontend:check` uses it.
  Seen to fail (exit 2) on an injected error in each config.
- [x] node:24-alpine as uid 65533: audit 0, typecheck OK, lint 0 errors,
  build OK, harness 22/22.
- [x] **Chrome differential, 1.1.3 versus the T1 build,** with browser
  storage cleared on both:
  - 5 symbols placed, then export: normalized hash `fc931fb2…` on both
  - then an import with `fitting_type: null` and `efficiency_rating: 3`,
    and a re-export: `695d2a33…` on both
  - re-imported fields identical
  - evaluate returns 200 on both (the response hash varies per run because
    of the random element IDs; the backend is unchanged)
  - no file was downloaded

---

# Plan — dev toolchain upgrade, legacy compose cleanup, Dependabot security updates (release 1.1.3)

Status: **DONE: v1.1.3 live on GovPaaS, schedule green, Dependabot security updates on (user, 2026-10-13).** Read-only root filesystem is
dropped by the user's decision; the immutable code from 1.1.2 stands in for it.

## 1. Dependabot security updates (the user's click, after step 2 is pushed)
- [ ] GitHub → repo **Settings → Advanced Security** → *Dependabot alerts*:
  Enable, then *Dependabot security updates*: Enable.
- Do it after the step 2 push, so Dependabot does not open PRs for the 11
  advisories this plan removes anyway.
- GitLab `deps:audit` stays the gate. Dependabot only proposes fixes.

## 2. A4: frontend dev toolchain (closes all 11 `npm audit` findings: 10 high, 1 moderate)
Measured 2026-10-13. All 11 are dev or build tools; nothing ships in the
image. The causes are esbuild ≤0.24 (via vite 5) and braces (via
typescript-eslint 7).
- [x] vite 5.4 → 8.x and @vitejs/plugin-react 4 → 6 (Vite 8 requires it).
- [x] esbuild becomes an explicit devDependency (^0.28):
  - Vite 8 no longer installs it
  - `tasks/repro/import_validation.repro.mjs`, run in CI by `frontend:check`,
    imports it from node_modules
- [x] eslint 8 (end of life) → 9 and typescript-eslint 7 → 8 (the unified
  `typescript-eslint` package), with react-hooks and react-refresh plugins
  on releases that support flat config.
- [x] **Add `eslint.config.js`.** Today `npm run lint` fails: there is no
  ESLint config at all, although the code carries `eslint-disable` comments
  for react-hooks rules.
  - Start from recommended rules only.
  - Fix real errors. If there are many, report the count first rather than
    rewrite code.
- [x] Node for the build: `node:20-alpine` → `node:24-alpine`.
  - Node 20 reached end of life on 2026-04-30.
  - Vite 8 needs Node ≥20.19.
  - Local development already runs Node 24.11.
  - Change it in the root Dockerfile stage, the `frontend:check` and
    `deps:npm-audit` jobs, and `frontend/Dockerfile.dev`.
- [x] `vite.config.ts`: drop `allowedHosts: true`.
  - It switches off the dev server's DNS-rebinding guard, the same family
    as the esbuild advisory.
  - It arrived with the initial push, with no recorded reason.
  - Development through localhost works without it.
- Out of scope: runtime majors (React 19, konva 10, zustand 5) and
  TypeScript 7.

## 3. Legacy compose cleanup
- [x] Delete the split stack: `frontend/Dockerfile`, `frontend/nginx.conf`,
  `backend/Dockerfile`. Nothing in CI or deployment builds them.
- [x] Fold `docker-compose.override.yml` into `docker-compose.yml` as the
  single dev compose, then delete the override.
  - Backend: hot reload with source mounts.
  - Frontend: Vite on :5173, with `/api` proxied (same-origin, no
    `ALLOWED_ORIGINS`).
  - Drop the obsolete `version:` key.
- [x] `backend/Dockerfile.dev`: python:3.12-slim → python:3.12-alpine, so
  development runs on the same libc as production (F13 only showed on musl).
- [x] Update the docs that point at the removed files:
  - README run instructions and file tree
  - `main.py` comments (static mount, CSP note)
  - `backend/.env.example`
  - CHANGELOG

## Verify (each item must be seen working, not assumed)
- [x] `npm audit` with all dependencies: 0. `npx tsc --noEmit`, `npm run build`
  and `npm run lint` pass. The repro harness passes in `node:24-alpine`.
- [x] Built image:
  - backend suite 180/180 in python:3.12-alpine as uid 65533
  - local Trivy 0
  - `docker diff` empty
- [x] Chrome against the built image repeats the 1.1.2 check:
  - the app loads, with no console errors
  - all 66 symbols render
  - evaluate, DOCX export and PDF export work
- [x] Dev paths:
  - `start.sh`: Vite on 5173, `/api` proxied
  - `docker compose up --build`: same; a source edit reloads
  - `docker compose config` is valid

## Review (2026-10-13)
**Deviations from the plan:**
- **ESLint went to 10, not 9:** ESLint 9 was already marked end of life
  at install. react-hooks moved to 7, but only its two classic rules are
  enabled; the React Compiler rules are off.
- **Lint now runs in CI** (`frontend:check`).
  - It found 10 errors, all unused code, now removed.
  - 15 warnings are left as warnings: changing hook dependency lists could
    change canvas behaviour.
- **The root `.env.example` was also removed.** It configured the split
  stack and still set `ALLOWED_ORIGINS` to localhost origins, contradicting
  1.1.2.

**Evidence:**
- **node:24-alpine as uid 65533:**
  - `npm audit` 0 (all and runtime), tsc OK, lint 0 errors
  - build OK; import harness 22/22
- **python:3.12-alpine as uid 65533:** backend 180 passed, 7 skipped; ci
  gate 9 passed.
- **Built image:**
  - black-box fuzz 7/7, `docker diff` empty, static files not writable
  - GitLab's Trivy shows 0 for both 1.1.2 and 1.1.3
- **Chrome:**
  - no console errors on load
  - 66/66 images
  - crossOrigin image leaves the canvas readable
  - evaluate 200; DOCX 200 (36,814 bytes)
  - PDF export via the real button gives `%PDF-1.3`, 1 page, 44 paths,
    12,457 bytes, versus 12,458 on 1.1.2
- **Dev compose:**
  - the backend runs on Alpine
  - the `/api` proxy works
  - a foreign `Host` header gets 403 (it got 200 before)
  - a backend edit reloads, and a frontend edit gives an HMR update
- **Host dev:** Vite 8.3.4 is ready on :5173, the `/api` proxy works, and
  `stop.sh` stops both servers.
- **Side effect:** the first PDF test saved
  `Downloads/schematic_2026-10-13-05-41-37.pdf`, because jsPDF saves via
  `dispatchEvent`, which the in-page capture missed. The user was told.

**Found, not fixed (new item T1):** the CI step `npx tsc --noEmit`
type-checks **0 files**.
- The root `tsconfig.json` is solution-style (`files: []` plus
  references), so the step always passes.
- `tsc -p tsconfig.app.json` reports 4 errors that were already in main:
  - `ElementsLayer.tsx:408`: missing `isEditing` prop
  - `AcknowledgmentModal.tsx:70`: cast
  - `metadataBuilder.ts:165`: a comparison with `'outlet'` that can
    never be true, so possibly a logic bug
  - `metadataBuilder.ts:428`: `fitting_type` can be `null`
- Fix: correct the 4, then change CI to `tsc -b` (or `-p
  tsconfig.app.json`).

## Release 1.1.3 (PATCH: same behaviour, rebuilt bundle and tooling)
**Released 2026-10-13:**
- Pushed `6c051f4..d3ee323`; the GitLab push pipeline is green (user).
- Tag `v1.1.3` is on `d3ee323`; GitHub Actions run 38354172879 succeeded.
- **Published `:1.1.3` checked:**
  - an anonymous pull returns 200
  - health reports `1.1.3` / `d3ee323…`
  - the bundle is `index-CfXybVn7.js`, the same hash as the build checked in
    Chrome
  - an evil-origin request gets no ACAO, and its preflight returns 400
  - writing code gives Permission denied; `docker diff` is empty
  - Trivy 0

Push (with OK) → GitLab green → tag `v1.1.3` (with OK) → verify the image →
the user sets GovPaaS and `DAST_APP_IMAGE` to `:1.1.3` → run the schedule.

## Next plan: application hardening (H1, H2 done; H4, H5 next)
Measured on the 1.1.2 image:
- **H1 (DONE, 1.1.4):** `/docs`, `/redoc` and `/openapi.json` all return
  200 in production. Turn them off by default, with an env flag to keep them on
  in development.
  - **Not secrecy:** the repo is public.
  - **Why it's worth doing:** Swagger UI runs CDN script on our origin
    (removing it lets H2 use `script-src 'self'`); it offers a live
    "Try it out" console; and scanners ingest `/openapi.json`
    automatically.
- **H2 (DONE, 1.1.5):** full CSP (AS-9/R-17): `default-src`, `script-src`, `style-src`
  (needs an inline-style audit), `frame-ancestors`, `base-uri`,
  `form-action`. Add `Permissions-Policy` alongside.
- **H3:** rate limiting (F2 remainder). **Decided 2026-10-13: platform
  level** (the user's call), so no app change.
- **H4:** request logging (F5 remainder): request id, route, status,
  duration, no payloads.
- **H5:** Python transitive lockfile with hashes (supply chain).
- **H6:** HSTS. GovPaaS's call, still unanswered.

---

# Plan — close CORS (F3) and make the app's code immutable (release 1.1.2)

Status: **DONE: v1.1.2 tagged and image verified 2026-10-13; live on GovPaaS, schedule green (user, 2026-10-13).** Both are PATCH-level hardening
with no behaviour change for the real app.

## A. CORS (audit F3)

### Facts (verified 2026-10-13)
- **Today any website may read API responses** in a visitor's browser:
  `main.py` sets `CORSMiddleware(allow_origins=["*"])`.
- **A second trap:** the `security_headers` middleware adds
  `Access-Control-Allow-Origin: *` to *any* response that lacks one.
  Narrowing `allow_origins` alone would change nothing, because a
  disallowed origin gets no header from CORSMiddleware and the fallback
  then adds `*`.
- **Nothing current is cross-origin:**
  - production: one container serves the page and the API, same origin
  - `start.sh` and `docker compose up` (with the override): the Vite dev
    server proxies `/api`, so same origin
  - the only cross-origin setup is the legacy split stack (base
    `docker-compose.yml` + `frontend/Dockerfile`, from Airbase). It is
    already broken: nginx listens on 3000, but compose maps port 80.
- **The fallback existed for that split stack:** a symbol image cached
  from a plain `<img>` was reused for a `crossOrigin='anonymous'` request
  and blocked. Same-origin requests never need CORS headers, so production
  doesn't need the fallback.
- `ALLOWED_ORIGINS`/`settings.origins_list` exists but is unused (dead
  config). An empty value would currently parse as `['']`.

### Tasks
- [x] **A1. Tests first** (`tests/test_cors.py`). With the default config:
  - a request with `Origin: https://evil.example` to `GET /api/health`
    and `POST /api/evaluate` gets **no** `Access-Control-Allow-Origin`
  - a preflight `OPTIONS` from that origin is refused, with no ACAO
  - a same-origin request (no Origin header) still works
  - with `ALLOWED_ORIGINS=http://localhost:3000`, that origin gets exactly
    its own value echoed (not `*`), and `evil.example` still gets nothing

  Watch them fail on today's code.
- [x] **A2. Fix:**
  - `allow_origins=settings.origins_list`
  - default `ALLOWED_ORIGINS` becomes **empty**, so no cross-origin
    access unless a deployment opts in
  - `origins_list` drops empty entries
  - methods narrowed to `GET, POST`, the only ones the API has
  - **the `*` fallback is deleted**
  - the production Dockerfile's `ENV ALLOWED_ORIGINS=localhost…` line is
    removed
  - the existing `test_cors_fallback…` test is replaced (it asserts `*`)
- [x] **A3. Real-browser check** of the built image in Chrome, on the same
  origin. With no CORS errors in the console:
  - the app loads
  - symbols render in the palette and on the canvas
  - title-block stamp images load (the `crossOrigin='anonymous'` path)
  - evaluate runs
  - the DOCX export and PDF vector export (`fetch` of symbol SVGs) work

  Plus a page served from a *different* origin trying `fetch()` against
  the app must be blocked by the browser.
- [x] **A4. Legacy split stack:** add a comment in `docker-compose.yml`
  that it is legacy and needs `ALLOWED_ORIGINS` (it already sets it).
  Don't repair it now. **Ask the user** whether it is still used; if not,
  delete it in a later cleanup.

## B. App code not writable by the app (read-only-filesystem benefit, no platform change)

### Facts (verified 2026-10-13, `docker diff` on 1.1.1 under the fuzz suite)
- **At runtime the app writes only:**
  - Python bytecode caches (`/app/app/**/__pycache__/*.pyc`)
  - upload spool files in `/tmp` (deleted after each request)
- **`/app` is owned by the `app` user**, which can modify its own code
  (`touch /app/app/main.py` succeeds). A code-execution bug could plant a
  persistent backdoor in the app until the next restart.

### Tasks
- [x] **B1.** Dockerfile:
  - **stop `chown -R app:app /app`**, so the code stays root-owned and
    readable, but not writable by `app`
  - precompile bytecode at build (`python -m compileall -q /app/app`)
  - set `PYTHONDONTWRITEBYTECODE=1`
  - `/tmp` stays writable, as it is for every user
- [x] **B2. Verify:**
  - as `app`, writing to `/app/app/main.py` fails
  - `docker diff` after the fuzz suite shows **no changes outside /tmp**
  - a 2.3 MB upload still returns 200
  - the full suite passes, and the fuzz suite passes at 2,000 examples
  - the image still scans at 0
- Read-only root filesystem itself remains a GovPaaS question. If the
  platform offers it, add a writable `/tmp` (emptyDir) and enable it; the
  app is proven compatible.

## C. Release 1.1.2
- [x] Changelog under Security, pre-push suite on Alpine, push (with OK),
  GitLab green, tag `v1.1.2` (with OK), verify the image.
- [x] The user switches GovPaaS and `DAST_APP_IMAGE` to `:1.1.2`, then runs
  the schedule.
- [x] Audit: F3 → FIXED. Refresh the stale findings summary (F2, F4, F5
  and F8 are superseded or fixed).

## Review
**A (CORS):**
- 7 new tests, all failing before the fix.
- The suite is 180 passed (the old `*`-asserting fallback test was
  removed).
- **In Chrome against the built image:**
  - the app loads, all 66 symbol images render, and there are no console
    errors
  - a `crossOrigin='anonymous'` image leaves the canvas readable
  - the SVG fetch for the PDF export, evaluate and the DOCX export all
    work
- **The cross-site demo:** from an `http://127.0.0.1:8097` page, `fetch`
  of 1.1.1 READ the response, while 1.1.2 was BLOCKED.
- **The legacy split compose is marked;** the user confirmed it is not
  used. Merging the override into a single dev compose is a pending
  cleanup.

**B (immutable code):**
- As `app`, writing `main.py` or a new file gives Permission denied.
- `docker diff` after the fuzz suite and a 2.3 MB upload: empty.
- Fuzz 7/7; the large upload returns 200.
- **Workflow unaffected (the user asked):**
  - `start.sh` and `docker compose up` run the source directly
  - only the built production image is locked

**Docs:**
- the audit gets a status table for F1–F13, plus F3 and immutable-code
  entries
- `README.md` describes `ALLOWED_ORIGINS`
- `doc_audit.md` SC-02 is marked implemented
- CHANGELOG 1.1.2

**Release (2026-10-13):**
- Pushed `d65aeb3..6c051f4`; the GitLab push pipeline is green (user).
- Tag `v1.1.2` is on `6c051f4`; the GitHub Actions run 38350336884 succeeded.
- **Published `:1.1.2` checked:**
  - an anonymous GHCR manifest fetch returns 200
  - health reports `1.1.2` and commit `6c051f4…`
  - an evil-origin GET has no ACAO, and the evil preflight returns 400
  - as uid 100 `app`, writing code gives Permission denied
  - `docker diff` is empty

---

# Plan — resolve the 166 container CVEs (release 1.1.1)

Status: **DONE — v1.1.1 released and live 2026-10-13.** Protocol: Pattern AT.

## Diagnosis (measured 2026-10-12, GitLab's own Trivy + DB)
- **All 166 come from the base image.** Bare `python:3.12-slim` scores
  exactly 166 (44 High, 58 Medium, 61 Low, 3 Unknown); our layers add 0.
- **They are Debian 13 packages**, most of which the app never runs:
  `login`, `passwd`, `util-linux`/`mount`, `apt`, `bash`, `perl-base`,
  `ncurses`, `tar`, `coreutils`.
- **Debian has a fix for only 2 of them** (liblzma5). Patching cannot clear
  them; shipping fewer packages can.

| Base | Total | High | Fixable | Verdict |
|---|---|---|---|---|
| python:3.12-slim (now) | 166 | 44 | 2 | — |
| python:3.13-slim | 166 | 44 | 2 | same Debian, no help |
| distroless python3-debian13 | 166 | 31 | 0 | same Debian CVEs; also Python 3.13 and no shell |
| **python:3.12-alpine** | **1** | **0** | **1** | **chosen**: official image, same Python 3.12, 84 MB vs 179 MB |
| chainguard python | 0 | 0 | — | free tier is `:latest` only, so it can't be pinned; vendor trust question |

**Feasibility checked:**
- Every backend dependency installs on Alpine from prebuilt musllinux
  wheels (`--only-binary=:all:`), with no compiler.
- The imports work (Pillow 12.3, lxml 6.1, pydantic-core, uvloop).

## Tasks
- [x] **1. Pin the floating backend deps.** `Pillow>=10.0.0`,
  `python-docx>=1.1.0` and `python-dotenv>=1.0.0` change silently between
  builds. Pin them exactly (`==`) at today's resolved versions, so an image
  is reproducible from its commit. (pip-audit and Dependabot then manage
  the bumps.)
- [x] **2. Runtime stage → `python:3.12-alpine`, pinned by digest.**
  - `FROM python:3.12-alpine@sha256:…  # 3.12-alpine`
  - `groupadd`/`useradd` → `addgroup -S` / `adduser -S -G` (busybox)
  - `RUN apk upgrade --no-cache`, so each build takes Alpine's latest fixes
    (that clears the 1 remaining fixable CVE). This trades byte-for-byte
    reproducibility for security; the image digest still records exactly
    what shipped.
  - The frontend build stage is already `node:20-alpine`, so it is
    unchanged.
- [x] **3. Prove the app behaves identically** (the risk is musl ≠ glibc):
  - **Same answers:** the full `frontend_metadata_all_symbols.json`
    fixture and the seed drawings through `/api/evaluate` on the old
    (slim) and new (alpine) images. JSON responses must be identical.
    `/api/export/docx` must open and contain the same rows.
  - **Same safety:** run the black-box suite against the alpine image at
    2,000 examples. Its deep-nesting and huge-input cases are exactly where
    musl differs (smaller default thread stacks), so a crash, not a 422,
    would show here.
  - **The UI still serves:** `/`, the JS bundle, `/api/symbols` and a
    symbol image.
  - **Memory:** idle RSS and peak RSS under the large fixture, slim vs
    alpine (GovPaaS gives 1024 Mi). musl's allocator behaves differently.
  - The backend suite runs in `python:3.12-alpine` as uid 65533.
- [x] **4. CI parity.** `backend:test` and `fuzz:blackbox` move to
  `python:3.12-alpine`, so the tests run on the same C library as
  production. This avoids a repeat of the Windows/Linux nesting surprise.
- [x] **5. Scan the new image locally** with the GitLab analyzer as
  uid 65533. Expected: 0, or the 1 fixable, now upgraded.
- [x] **6. Make container scanning a real gate.** With a near-zero
  baseline, a gate can hold.
  - Add `container_scanning:gate` (like `secret_detection:gate`). It fails
    on **High/Critical that have a fix available**.
  - Unfixed findings are still reported, not blocking: nothing can be done
    about them until the distro ships a fix.
  - A missing report fails.
  - Verify it on the slim image (must fail on liblzma5 with the fix
    available) and on the alpine image (must pass).
- [x] **7. Keep it near zero: Dependabot version updates**
  (`.github/dependabot.yml`). Weekly PRs for:
  - the base image digest (docker)
  - pip and npm
  - GitHub Actions (this also keeps today's SHA pins current)

  Plus your click: **Dependabot security updates** on.
- [x] **8. Release 1.1.1** (PATCH: no behaviour change for valid input).
  - CHANGELOG under Security: "base image Debian → Alpine; container CVEs
    166 → N".
  - Tag `v1.1.1`, then verify the image and `/api/health`.
  - Then your steps: GovPaaS image path → `:1.1.1`, `DAST_APP_IMAGE` →
    `:1.1.1`.
  - Rollback is `:1.1.0`, unchanged.
- [x] **9. Close out the 166 in GitLab.**
  - The next scheduled scan of 1.1.1 marks them **No longer detected**.
  - Then: Secure → Vulnerability report → filter "Activity: No longer
    detected" → select all → **Change status → Resolved**, with the comment
    "Base image replaced in 1.1.1".

## Risks
- **musl vs glibc:** DNS, locale and allocator differences. The app uses
  none of these unusually. Task 3 measures behaviour, safety and memory
  rather than assuming.
- **Future wheel gaps:** a new dependency without a musllinux wheel would
  need a compiler at build time. Today every package has one.
- **Python patch drift:** `3.12-alpine` gets new 3.12.x patches on digest
  bumps via Dependabot. That's the point, and the tests gate each bump.

## Out of scope
- Chainguard/Wolfi (pinning and vendor questions).
- Distroless (measured: no reduction).
- Rebuilding Python from source.

## Review
**Results:**
- **Container findings: 172 → 0.** The plan said 166, but language
  scanning revealed 6 more, all in `pip`, removed from the runtime image.
- **Image size:** 304 → 208 MB.
- **Behaviour:** identical answers on 803 request pairs, slim vs final
  Alpine.
- **Memory:** peak 138 vs 148 MiB.
- **Safety:** fuzz 7/7 at 2,000 examples, 0 server errors.

**Deviations from the plan (all found by the verification steps):**
- **F13:** a segfault on Alpine in worker threads (the musl 128 KiB stack).
  Production was unaffected (async endpoints), but it was a latent DoS.
  Fixed with `threading.stack_size(8 MiB)`, test-first: exit -11 without,
  174/174 with, on Alpine, Debian and Windows.
- **Language scanning:** `CS_DISABLE_LANGUAGE_VULNERABILITY_SCAN=false`
  added after a direct Trivy cross-check found the 6 pip CVEs that GitLab's
  default config hid. The audit's "no findings in Python packages"
  (2026-10-12) is corrected.
- **The gate rule includes severity Unknown:** the only fixable findings
  on 1.1.0 (liblzma5) are unrated, and a High/Critical-only rule would have
  passed them. Verified: it fails on 1.1.0, passes on the candidate, and
  fails on a missing report.

**Release:**
- `d65aeb3` was pushed and GitLab was green.
- `v1.1.1` was tagged; GitHub Actions run 38334880469 succeeded.
- **The released image was verified:**
  - health reports 1.1.1 / d65aeb3
  - Alpine 3.24.2
  - no pip
  - an 8 MiB thread stack
  - GitLab container scan (with language packages): **0**
- **What the user did:**
  - GovPaaS and `DAST_APP_IMAGE` set to `:1.1.1`
  - the scheduled run was all green
  - every old finding set to Resolved

**Heads-up (resolved):** once this is pushed, the weekly schedule still points at
`:1.1.0`, so `container_scanning:gate` will go red until `DAST_APP_IMAGE`
is `:1.1.1`. Release first.

---

# Plan — automate the remaining security checks

Status: **A–C DONE 2026-10-12 (D: kept manual, user's call).** Protocol: Pattern AT.
Asked: "can we automate the remaining four?" (dependency audit, container
scan, secret detection, deploy).

## Facts gathered (2026-10-12)
- **pip-audit** on `backend/requirements.txt`: no known vulnerabilities.
- **npm audit, runtime deps** (shipped to the browser):
  - 4 findings: `axios` high (direct dependency), `form-data` high,
    `follow-redirects` moderate, `dompurify` moderate
  - all four have non-major fixes, so `npm audit fix` resolves them
  - Most axios advisories concern its Node HTTP adapter or proxies, not the
    browser, but a gate cannot tell which apply. Fix rather than argue.
- **npm audit, dev/build-only deps**:
  - 19 more findings, including vite and `@typescript-eslint`
  - some need MAJOR upgrades (vite 8, typescript-eslint 8)
  - build-time only: they never reach the shipped static files, but vite's
    dev-server issues matter on a developer's machine
- **The SAST High** (`pdfVectorExport.ts:62`, nodejs_scan SSRF) is a false
  positive. The rule targets Node server code; this is a browser `fetch()`
  to `${BASE_URL}/api/symbols/${symbolId}/image` (`client.ts:42`), a
  same-origin path. It is dismissed in GitLab, but `symbolId` should still
  be encoded (see A2).

## A. Dependency audit (closes R11)
- [x] **A1. Fix the 4 runtime npm findings** with `npm audit fix` (no
  `--force`).
  - Then `tsc`, the build, and the import-validation harness must pass.
  - Run in `node:20-alpine` too, not only on Windows (lesson 2026-10-12).
- [x] **A2. Encode `symbolId`** in `client.ts:42` with
  `encodeURIComponent`. A symbol id from an imported JSON file could
  otherwise carry `../` and steer the request to another same-origin path.
  One-line hardening.
- [x] **A3. `deps:audit` job** (test stage, every push **and** weekly).
  New advisories appear without any code change, so the weekly run is what
  catches them.
  - `pip-audit -r backend/requirements.txt`: **blocks** on any known
    vulnerability.
  - `npm audit --omit=dev --audit-level=high`: **blocks** on high or
    critical in runtime deps.
  - `npm audit` (all deps): **reports only**, as an artifact plus log.
    Dev-tool majors are tracked as their own task (A4), not by a red
    pipeline that everyone learns to ignore.
  - Exceptions: a reviewed `.audit-exceptions` list (advisory ID, reason,
    expiry date). An expired entry fails the job, so nothing is waived
    forever.
- [x] **A4. (Done in 1.1.3) dev-tool majors**: vite 5 → 8 and
  typescript-eslint 8, as its own change with a full frontend regression
  check. Not bundled here.

## B. Container image scan (weekly)
- [x] **B1.** GitLab Container Scanning (`Jobs/Container-Scanning`, Trivy
  based) can scan a **remote** image, so the runners never need to build
  one: `CS_IMAGE: $DAST_APP_IMAGE`, the GHCR image (public, no
  credentials).
  - Weekly schedule, next to DAST.
  - Covers OS packages in `python:3.12-slim` plus the installed Python
    packages, which is exactly what ships.
- [x] **B2. Prove it runs as uid 65533** locally first, as was done for
  Semgrep (which needed a HOME fix).
- Gate: advisory at first. Base-image CVEs often have no fix yet. Findings
  land in the Vulnerability Report. Revisit "block on critical with a fix
  available" after the first baseline.

## C. Secret detection
- [x] **C1.** GitLab Secret Detection (`Jobs/Secret-Detection`) on every
  push. Verify uid 65533 locally first.
- [ ] **C2. GitHub push protection (your click, free for public repos).**
  It *prevents* a secret reaching the repo, where GitLab's job can only
  report one already pushed. GitHub repo → Settings → Advanced Security:
  enable Secret scanning and Push protection.

## D. Deploy automation — recommend NOT automating
Technically possible: the tag build calls the GovPaaS (Northflank) API to
set the new image tag and roll out. Recommended against:
- a release becoming live should be a deliberate act, and it is one click
  today
- it needs a long-lived GovPaaS API token stored in GitHub, a new
  credential that could deploy anything
- the earlier choice for the sibling project was manual

The "automated" part that matters is already done: tag → build →
verifiable `/api/health`.

## Verify (Pattern AT phase 5: a gate must be seen to fail)
- `deps:audit` fails on the current lockfile (axios), and passes after A1.
- Secret Detection flags a planted fake key in a throwaway local copy,
  never committed.
- Container Scanning produces a report against `:1.1.0`.
- Full backend suite plus a frontend build in the CI images before the push.

## Review
**Commits:**
- `f127c1c`: npm runtime fixes
- `6cd50bc`: `symbolId` encoding
- `30de31e`: `deps:audit` gate
- then container scanning, secret detection and docs

**Every gate was seen to fail before it was trusted to pass (uid 65533,
real CI images):**
- **deps:audit**: the pre-fix lockfile was blocked (13 advisories), and the
  current one passes (5 dev-only reported).
  - The simulation caught `pip-audit` landing off PATH as non-root, hence
    `python -m pip_audit`.
  - The gate fails on a tool error instead of reading it as 0 findings.
- **container_scanning**: it crashed as uid 65533 (Trivy cache under
  /home/gitlab). Fixed by linking the bundled DB into a writable
  `CS_TRIVY_CACHE_DIR`, without copying 2.7 GB. It then scanned `:1.1.0`:
  166 Debian base-image CVEs, 1 fixable, 0 in Python packages. Advisory.
- **secret_detection**: works as uid 65533 unmodified: 0 findings clean,
  and a planted fake GitHub token caught as Critical. `secret_detection:gate`
  fails on planted, passes on clean, and fails on a missing report.
- Frontend: tsc, build and harness 22/22 in node:20-alpine.

**Left for the user:**
- GitHub push protection (a click)
- `DAST_APP_IMAGE` on the schedule
- dismissing the SAST false positive
- the first weekly run of `container_scanning`

**Follow-ups:**
- A4: vite 8 and typescript-eslint 8 majors
- base-image refresh policy (liblzma5)

---

# Plan — release versioning, first release v1.1.0

Status: **RELEASED v1.1.0 2026-10-12; GovPaaS switch is the user's.** Requested: "version control for
every minor and major change".

## Where things stand (verified 2026-10-12)
- Every build is already traceable to its commit:
  - GitHub Actions tags each image `:sha-<7 chars>` as well as `:latest`
  - each image carries the OCI label `org.opencontainers.image.revision`
    with the full commit SHA
  - GHCR keeps old images
- The release mechanism exists but has never been used:
  - `docker-publish.yml` already triggers on `v*.*.*` git tags and would
    publish `:X.Y.Z` (`type=semver,pattern={{version}}`)
  - **0 git tags exist**
- The running app cannot say what it is:
  - `/api/health` returns `app_version`, hardcoded `"1.0.0"` in
    `backend/app/config.py`
  - the Dockerfile has a stale `LABEL version="1"`
  - `frontend/package.json` also says `1.0.0`
- GovPaaS deploys `:latest`:
  - which build is running is implicit
  - a rollback means finding the right `sha-` tag by hand
  - the sibling project rag-portal already deploys by an immutable commit
    tag (govpaas_configuration_helper, 2026-08-17/22), so the console
    supports it

## Version policy (SemVer, written into CHANGELOG.md)
- **MAJOR**: a breaking change for users or integrators:
  - a removed or renamed API field or endpoint
  - a metadata format the old frontend can't produce
  - a compliance rule whose verdict changes for existing drawings
- **MINOR**: something new that is backward-compatible:
  - a new compliance check or symbol
  - a new endpoint or a new export feature
- **PATCH**: fixes only, including security fixes (F-numbers) and
  dependency bumps, with no behaviour change for valid input.
- Not every push is a release. Pushes to `main` still build `:latest` and
  `:sha-xxxxxxx` (the release candidate, scanned weekly). A release is a
  deliberate `vX.Y.Z` tag.

## Tasks
- [x] **1. Version and commit baked into the image (test first).**
  - `config.py`: `app_version` defaults to `"dev"`; add
    `git_commit: str = "unknown"`. Both come from env (`APP_VERSION`,
    `GIT_COMMIT`), as pydantic-settings already does.
  - `/api/health` returns `{"status", "version", "commit"}`.
  - Dockerfile:
    - `ARG APP_VERSION=dev` and `ARG GIT_COMMIT=unknown`, then the
      matching `ENV`, in the runtime stage
    - delete the stale `LABEL version="1"` (the workflow's OCI labels
      replace it)
  - Tests:
    - the health endpoint reports both values from env
    - the defaults are `dev`/`unknown`, so a local build never claims to
      be a release
- [x] **2. Workflow passes them in.** `docker-publish.yml` build step:
  - `build-args: APP_VERSION=${{ steps.meta.outputs.version }}` and
    `GIT_COMMIT=${{ github.sha }}`
  - result: `:1.1.0` reports `1.1.0`; a main push reports `latest` plus
    its exact commit
  - Pin the actions to commit SHAs while here. That closes the SAST
    agent's one new finding (mutable action tags), and it is the same
    file.
- [x] **3. CHANGELOG.md** (Keep a Changelog format)
  - The policy above, plus a `1.1.0` entry drafted from `git log` since
    the fork point.
  - Grouped as Security (F1, F9–F12, CVE upgrades, CSP), Added (DAST,
    black-box fuzzing, SAST, request limits) and Changed.
  - I draft it; **you review the wording** (it may be read by PUB Cyber).
- [x] **4. Release process doc**: a short `docs/RELEASING.md`.
  1. Update the CHANGELOG and commit.
  2. Run `git tag -a vX.Y.Z -m "..."` and `git push origin vX.Y.Z`.
  3. Check GitHub Actions is green and `ghcr.io/...:X.Y.Z` exists.
  4. In GovPaaS, set the image tag to `X.Y.Z`, then deploy/restart.
  5. `GET /api/health` shows `X.Y.Z` and the commit.

  Rollback: set the previous tag and restart, with no rebuild.
- [x] **5. Commit 1–4 and push (with your OK).** Then the release itself:
  - tag `v1.1.0` on that commit (with your OK; it's a public, durable
    action)
  - push the tag
  - verify the `:1.1.0` image and its `/api/health` locally
- [ ] **6. Your console steps**:
  - GovPaaS: set the service's image tag from `latest` to `1.1.0` →
    deploy → check `/api/health`
  - GitHub: Settings → Rules → Rulesets → New tag ruleset protecting
    `v*`, blocking deletion and update, so a release tag can never be
    moved to point at different code

## Decisions folded in (say if you disagree)
- **No floating `:1` or `:1.1` tags.** They move, which is the problem
  being solved. Deploy exact `X.Y.Z` only.
- **The frontend `package.json` version is left alone.** It's internal to
  the build. `/api/health` is the single place to ask what's running.
- **DAST and fuzzing keep scanning `:latest`.** That's the next release
  candidate; releases are tags of code those weekly runs have already
  seen. To scan exactly what's deployed instead, set `DAST_APP_IMAGE` to
  the release tag in GitLab variables.

## Out of scope
- Automating the GovPaaS rollout. It stays a manual console step, as it is
  today and as chosen for the sibling project.
- Release automation tools (semantic-release etc.). Overkill for one
  maintainer; the doc plus tag is enough.

## Review
**Outcome:**
- `da51323` (health version/commit, Dockerfile ARGs, workflow build-args
  plus SHA-pinned actions) and `cdda04d` (CHANGELOG, RELEASING, F7
  accepted) pushed
- GitLab push pipeline green (user-confirmed)
- `v1.1.0` tagged on `cdda04d` (annotated tag object `faa876c`)
- GitHub Actions run 38219956822 succeeded

**Verified:**
- `ghcr.io/beese54/drawing-portal:1.1.0` pulls anonymously (HTTP 200)
- its labels say version 1.1.0 and revision `cdda04d…`
- run locally, `/api/health` returns `{"status":"ok","version":"1.1.0",
  "commit":"cdda04dd457c4f00b26b4eb6dac569bcd9c88308"}`

**GitHub ruleset "Protect release tags"** (id 24914490) is active on
`refs/tags/v*`: no deletion, no update, no bypass actors. Created via the
API with the user's OK.

**Decision recorded:**
- 1.1.0 rather than 2.0.0, although the feedback form and the symbol write
  API were removed (MAJOR under the rules). Reason: 1.0.0 was never
  tagged, and the only client of those endpoints was the bundled frontend.

**Gotcha:**
- GovPaaS's "this image may be private" on an image path means the tag
  could not be found, not that credentials are missing. The package is
  public; `:1.1.0` was 404 until the tag build finished.

---

# Plan — black-box fuzzing of the two POST endpoints (Option A)

Status: **DONE, pushed 2026-10-12 (`4c53d58`).** Protocol: Pattern AT (DevSecOps).

## Goal
Close the gap recorded in `tasks/security_audit.md` → "Dynamic security
testing — known gap": no automated test reaches the logic behind
`POST /api/evaluate` and `POST /api/export/docx` **through the real image**.
The in-process fuzz tests (`backend/tests/test_fuzz_inputs.py`) prove the code;
this proves the shipped container (uvicorn + installed deps + Dockerfile), and
adds attack-string payloads that the in-process tests never try.

## Found while planning (2026-10-12) — F10, not yet fixed
Probed in-process with the pinned deps (fresh venv):

| Input | evaluate | export |
|---|---|---|
| JSON integer with 5,000 digits | **500** | **500** |
| JSON nested 3,000 levels deep (`[[[…]]]`) | **500** | **500** |
| nested 1,000 levels | 200 | 200 |
| lone surrogate `\ud800`, RTL override, NUL/VT, `<w:t>&]]>`, 200k chars | 422 / 200 | 200 |

Cause: both routers catch only `json.JSONDecodeError` around `json.loads`.
Python ≥3.11 raises plain `ValueError` for integers over 4,300 digits, and the
decoder raises `RecursionError` on deep nesting. Neither is a JSONDecodeError.
Impact: unhandled exception → generic 500. Both fail fast, so no DoS and no
information leak; severity Low. The existing fuzz strategy never generates
either input, which is why 152 green tests missed it.

## Tasks

- [x] **1. Fix F10 (test first).** Add the two inputs × two endpoints to
  `test_fuzz_inputs.py` as regression cases expecting 422 → watch them fail →
  widen the `except` in `evaluate.py:207` and `export.py:68` to
  `(ValueError, RecursionError)` (JSONDecodeError is a ValueError subclass) →
  green. Commit 1.
- [x] **2. Extract shared strategies.** Move the seed documents and mutation
  helpers out of `test_fuzz_inputs.py` into `backend/tests/fuzz_strategies.py`
  so both test files use one copy. Pure move: the 152 tests must still pass,
  same count. Commit 2 (can fold into 3 if trivially small).
- [x] **3. Black-box test file** `backend/tests/test_blackbox_http.py`.
  Skipped entirely unless `BLACKBOX_BASE_URL` is set, so the normal test
  stage is unchanged. Uses `httpx` (already a dev dep) against that URL.
  - **Preflight:** `GET /api/health` must answer 200, and both seed documents
    must get 200. Otherwise the job fails loudly, rather than "passing"
    because nothing was reached (the API Security Testing lesson).
  - **Strategy 1: type mutations.** The existing strategy, now over HTTP.
  - **Strategy 2: attack strings.** Replace 1–3 *string* leaves of the seed
    with payloads drawn from: XSS (`<script>`, `"><img onerror=…>`); Office-XML
    breakers (`<w:t>`, `]]>`, `&`, NUL/VT/other C0 controls); lone surrogates;
    bidi overrides; format strings (`%s%n`, `{0}`, `{__class__}`); template
    injection (`{{7*7}}`, `${7*7}`); path traversal; spreadsheet-formula
    (`=cmd|…`); SQL fragments (cheap, low relevance: there is no DB); long
    strings up to just under the field caps.
  - **Strategy 3: parser extremes.** Huge integers, `1e999`, `-0`, deep
    nesting, duplicate keys, sent as raw JSON text (not via `json.dumps`).
  - **Pass/fail rules (the gate):**
    - every response `< 500`
    - every response within 10 s (a hang is a finding)
    - export 200 ⇒ body is a valid .docx: opens with python-docx, and the
      payload text appears in the table cell (escaped, not executed and not
      dropped silently)
    - evaluate 200 ⇒ `Content-Type: application/json` and `X-Content-Type-Options:
      nosniff`, so a reflected payload cannot be rendered as HTML
    - after the run, `GET /api/health` still 200 (the container survived)
  - Seed: `derandomize=True` by default; `FUZZ_SEED` overrides it, and the
    seed is printed so any failure is reproducible locally.
  - Verify locally: `docker run` the GHCR image (pinned digest, not `:latest`)
    on `localhost:8000`, run the file against it; must fail on F10 *before*
    the fix ships in the image (planted-issue check, Pattern AT phase 5), and
    pass against an image built from the fixed commit.
- [x] **4. GitLab job** `fuzz:blackbox` in `.gitlab-ci.yml`, `dast` stage.
  Same sidecar pattern as `dast` (`services: $DAST_APP_IMAGE` alias `portal`,
  `BLACKBOX_BASE_URL=http://portal:8000`), image `python:3.12-slim`, installs
  `requirements-dev.txt` with the existing pip cache. Emits a JUnit report so
  failures show in the pipeline's Tests tab. Opt-in variable
  `ENABLE_BLACKBOX_FUZZ`. **Not** `allow_failure`: any 5xx fails the
  pipeline, which emails the pipeline owner (the triage path).
  Header comment explains why it targets the sidecar and never the live host.
- [x] **5. Docs.** Update `security_audit.md` (F10 entry; "known gap" →
  partly closed, with what is still uncovered); header block of `.gitlab-ci.yml`.
  Commit.
- [ ] **6. Push (with your OK) → GitHub Actions builds the image → you run
  the GitLab steps below.**

## Scheduling (answer to "should it run on a schedule too?")
**Yes, on the same weekly schedule as DAST, and not on every push.**
- *Not on push:* the job scans `ghcr.io/…:latest`, which GitHub Actions
  rebuilds *after* the push. A push pipeline would fuzz the previous commit's
  image and report it as this commit's. The in-process fuzz tests already
  run on every push against the right code.
- *Weekly:* the schedule runs with a fresh `FUZZ_SEED` (the pipeline ID) and a higher
  example count (e.g. 2,000 vs the default 300). Each week explores inputs
  not tried before, on the image that is actually deployed by then.
- **Answered 2026-10-12:** `ENABLE_DAST` is a project-level variable
  (Settings → CI/CD → Variables), so DAST runs on **every push to main**, and
  has the same stale-image problem: it scans the previous commit's `:latest`.
  Fix with no code change: delete the project variable and set
  `ENABLE_DAST=true` on the weekly schedule instead, next to
  `ENABLE_BLACKBOX_FUZZ=true`. Both jobs then run weekly against the deployed
  image, and push pipelines get ~45 min faster. "Run pipeline" with the
  variable set still gives an on-demand run.

## Your GitLab steps afterwards
1. Mirror → Update now.
2. Build → Pipeline schedules → create (or edit) a weekly schedule on `main`
   with variables `ENABLE_DAST=true` and `ENABLE_BLACKBOX_FUZZ=true`; then
   delete the project-level `ENABLE_DAST` under Settings → CI/CD → Variables. (The job itself switches to a fresh seed
   (`FUZZ_SEED=$CI_PIPELINE_ID`) and 2,000 examples when
   `$CI_PIPELINE_SOURCE == "schedule"`; no second variable needed.)
3. Click "Run" on the schedule once and check that `fuzz:blackbox` is green.

## Out of scope
- The live GovPaaS URL (never a target; same rule as DAST).
- `POST /api/symbols` and `/api/feedback` (not part of this gap; DAST covers
  the UI-reachable surface).
- Replacing the CSA-licensed VAPT. This is evidence for it, not a substitute.

## Review
**Outcome.** All 5 build tasks done; 3 local commits (`5912c63` F10,
`b242837` F11/F12 + shared strategies, then the CI/docs commit). The
in-process suite is 170 passed, 7 skipped (the black-box file skips
without `BLACKBOX_BASE_URL`).

**The gate was proven able to fail before it was trusted to pass:**
- vs a local server running pre-F10 code: 2 failed (F10 on both endpoints)
- vs the real GHCR image `2cc2627`, in a simulated CI job (python:3.12-slim
  as uid 65533, the YAML's own script lines, sidecar on a Docker network):
  2 failed (F10)
- vs an image built from the fixed tree, scheduled mode (seed 987654,
  2,000 examples per test): 7 passed, 0 server errors in the container log;
  a second fresh seed (424242) also 7 passed, 0 server errors

**It found two new bugs before reaching CI:**
- F11: a lone surrogate echoed into the evaluate response
- F12: `1e999` as a canvas dimension

Both are fixed test-first.

**Honest limits:**
- The fixed 300-example push-time sample did NOT rediscover F11/F12 with
  the fixes removed. Discovery comes from the weekly random runs, and
  regression tests pin what is found.
- The `/` writability and HOME on real runners are not reproduced exactly:
  the simulation set `HOME` to the project dir. `backend:test` already
  runs the same pip line on those runners.
- Live GitLab behaviour is unverified until the first scheduled run.

**Deviation from plan:** none in scope. F11/F12 were fixed in-line because
the job is designed to fail on them, and shipping it red would teach
everyone to ignore it.

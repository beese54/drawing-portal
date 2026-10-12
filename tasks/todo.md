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

# Plan — black-box fuzzing of the two POST endpoints (Option A)

Status: **DONE locally 2026-10-12; push pending your OK.** Protocol: Pattern AT (DevSecOps).

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

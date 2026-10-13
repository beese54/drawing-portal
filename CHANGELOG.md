# Changelog

All notable changes to the Schematic Drawing Portal. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/).

## Versioning rules for this project

A release is a git tag `vX.Y.Z`. Pushing one makes GitHub Actions publish the
image `ghcr.io/beese54/drawing-portal:X.Y.Z`, and GovPaaS is pointed at that
exact tag (see [docs/RELEASING.md](docs/RELEASING.md)). Pushes to `main` that
are not tagged still publish `:latest` and `:sha-<commit>` as release
candidates, but are not releases.

- **MAJOR**: a breaking change for users or integrators:
  - an API endpoint or field removed or renamed
  - a metadata format the previous frontend cannot produce
  - a compliance rule whose verdict changes for drawings that already
    passed or failed
- **MINOR**: something new that is backward-compatible, such as a new
  compliance check, symbol, endpoint or export feature.
- **PATCH**: fixes only (bugs, security findings, dependency upgrades),
  with no behaviour change for valid input.

`GET /api/health` reports the running version and commit:
`{"status": "ok", "version": "1.1.0", "commit": "<sha>"}`.

## [Unreleased]

### Fixed
- **CI's frontend type check now checks the code** (T1). `npx tsc --noEmit`
  ran against a root `tsconfig.json` that only lists references, so it
  checked 0 files and always passed.
  - It is replaced by `npm run typecheck`, which checks both
    `tsconfig.app.json` and `tsconfig.node.json`. It was seen to fail on an
    injected error in each.
  - It found five latent errors, all fixed without changing what the app
    sends or shows:
    - `ExportedElement.fitting_type` / `efficiency_rating` now allow
      `null`, which is what the export has always sent. JSON import
      treats `null` as unset, like its neighbouring fields.
    - The selected-annotation group passes `isEditing={false}` explicitly.
    - The acknowledgment flags' initial state is spelled out instead of
      cast.
    - The hydraulic context's dead `node_type === 'outlet'` branch is
      removed. That node type went away in v2, and nothing reads the
      value.
    - `@types/node` added for `vite.config.ts`.
  - Checked in Chrome: 1.1.3 and this build export identical normalized
    metadata, before and after a JSON import containing nulls.

## [1.1.3] - 2026-10-13

Tooling and housekeeping. There is no behaviour change for the app:
- In Chrome against the built image, all 66 symbol images load, and
  evaluate, DOCX export and PDF export work.
- The PDF export matches 1.1.2's: one page, 44 vector paths, and a size
  differing by one byte (the timestamp).

### Security
- **Frontend build tools upgraded**, which clears all 11 `npm audit`
  findings (10 high, 1 moderate). None of them shipped in the image.
  - Vite 5 → 8
  - @vitejs/plugin-react 4 → 6
  - ESLint 8 → 10
  - typescript-eslint 7 → 8
  - esbuild is now an explicit dev dependency
- **The frontend build runs on Node 24 LTS.** Node 20 reached end of life
  on 2026-04-30.
- **The Vite dev server's host check is back on.** `allowedHosts: true`
  was removed, so a request with a foreign `Host` header gets 403 instead
  of the page. This affects local development only.

### Changed
- `npm run lint` works: there was no ESLint config before. CI runs it in
  `frontend:check`, where errors fail the job and warnings are reported.
  - The ten errors it found were unused code, now removed.
  - The rules are the recommended sets plus the two classic React hook
    rules.
- `docker-compose.yml` is now the single local-development file (hot
  reload; Vite on :5173 proxies `/api`). The dev backend runs on Alpine,
  like production.

### Removed
- **The retired split stack:**
  - `frontend/Dockerfile`
  - `frontend/nginx.conf`
  - `backend/Dockerfile`
  - `docker-compose.override.yml`
  - the root `.env.example`, which configured that stack's cross-origin
    setup

## [1.1.2] - 2026-10-13

Security hardening. There is no behaviour change for the app itself: it
was verified in Chrome against the built image.

### Security
- **No other website may read the API's responses any more** (audit F3).
  - Cross-origin access is off unless a deployment lists origins in
    `ALLOWED_ORIGINS`.
  - The `Access-Control-Allow-Origin: *` fallback is removed.
  - Only GET and POST may be preflighted.
- **The running app can no longer modify its own code.** The code is
  root-owned, and bytecode is precompiled at build. At runtime the app
  writes only to `/tmp`.

### Changed
- `ALLOWED_ORIGINS` now defaults to empty, and blank entries are ignored.
- The base `docker-compose.yml` split stack is marked legacy. Use
  `docker compose up` (with the override) or `start.sh`.

## [1.1.1] - 2026-10-13

A security-maintenance release. There is no behaviour change for valid
input: the 1.1.0 and 1.1.1 images gave identical answers on 803 request
pairs (the real all-symbols drawing, the seeds and generated hostile
variations).

### Security
- **The runtime base image is now Alpine instead of Debian slim.** GitLab
  container scanning of 1.1.0 found 172 known vulnerabilities, 166 of them
  in Debian packages the app never uses. 1.1.1 has **0** (operating-system
  and installed Python packages). The image is also smaller: 208 MB vs
  304 MB.
- `pip` is removed from the runtime image. The base image's pip 25.0.1
  carried 6 CVEs, and the app never calls pip.
- **Worker threads get an 8 MiB stack.** On Alpine (musl) the default is
  128 KiB, and deeply nested JSON parsed in a worker thread could crash the
  server process instead of returning 422. No current endpoint runs in a
  worker thread; this closes the trap for future ones.
- Frontend runtime dependencies were updated past 4 advisories: axios and
  form-data (high), follow-redirects and dompurify (moderate).
- Symbol image URLs encode the symbol id.

### Changed
- Every direct backend dependency is pinned to an exact version: Pillow,
  python-docx and python-dotenv were floating.
- The base image is pinned by digest.

### Added (CI, not in the image)
- **On every push:** a dependency audit (`deps:audit`: pip-audit and npm
  audit, blocking), and secret detection with a blocking gate.
- **Weekly:** container scanning that includes Python packages, with a
  blocking gate on fixable High, Critical or unrated findings.
- **Tests run on Alpine,** the same as production.
- **Dependabot** opens weekly update PRs (base image digest, pip, npm,
  GitHub Actions).

## [1.1.0] - 2026-10-12

First tagged release. It covers everything since this deployment was forked
from the upstream portal, whose code reported `1.0.0` but was never tagged.

### Security
- Unauthenticated public POST endpoints are bounded: request, field, image,
  crop and row-count limits (`/api/evaluate`, `/api/export/docx`).
- Uploaded images are verified by content signature, not by the declared
  type; form fields are size-capped before parsing.
- Response security headers: `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and a
  Content-Security-Policy with `object-src 'none'`.
- JSON schematic import is hardened and geometry is validated; dropped
  stamps are reported to the user.
- Malformed input returns 422 instead of a server error:
  - wrong nested types (F9)
  - integers over 4,300 digits and very deep nesting (F10)
  - lone Unicode surrogates (F11)
  - infinite canvas dimensions (F12)

  See `tasks/security_audit.md`.
- fastapi, starlette and python-multipart upgraded past 14 known CVEs.
- The Slack egress from the feedback feature is gone (see Removed).

### Added
- Single combined container image (backend and frontend), published to
  GHCR by GitHub Actions.
- Singapore Government masthead and crest, the PUB logo, and the
  whole-of-government anti-scam advisory banner.
- `/api/health` reports the build's version and commit.
- GitLab CI:
  - backend and frontend tests on every push
  - SAST (`semgrep-sast`) on every push
  - weekly DAST and weekly black-box fuzzing of the two POST endpoints,
    both against a disposable copy of the image

### Removed
- **In-product feedback form and `POST /api/feedback`.**
- **Symbol write API: upload, rename and delete under `/api/symbols`.**
  Symbols ship with the image.
- PDF underlay import in the editor.
- Unused deployment manifests.

### Changed
- Documentation corrected where it overstated AI use or described features
  that no longer exist.

[Unreleased]: https://github.com/beese54/drawing-portal/compare/v1.1.2...HEAD
[1.1.2]: https://github.com/beese54/drawing-portal/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/beese54/drawing-portal/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/beese54/drawing-portal/releases/tag/v1.1.0

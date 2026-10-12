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

[Unreleased]: https://github.com/beese54/drawing-portal/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/beese54/drawing-portal/releases/tag/v1.1.0

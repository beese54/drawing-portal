# Releasing

GovPaaS runs one exact, immutable image tag, such as
`ghcr.io/beese54/drawing-portal:1.1.0`, never `:latest`. That way you can
always say which code is live, and a rollback is a one-field change. The
version rules are at the top of [CHANGELOG.md](../CHANGELOG.md).

## Cut a release

1. **Check that `main` is green.**
   - The GitLab pipeline for the commit passes, including `backend:test`.
   - The last weekly DAST and `fuzz:blackbox` runs were clean.
2. **Update the changelog.** Move the `[Unreleased]` items under a new
   `## [X.Y.Z] - YYYY-MM-DD` heading, update the compare links at the
   bottom, and commit:
   `git commit -am "docs: changelog for X.Y.Z"`.
3. **Tag and push.** Annotated tags record who tagged and when.
   ```
   git push origin main
   git tag -a vX.Y.Z -m "Release X.Y.Z"
   git push origin vX.Y.Z
   ```
4. **Wait for the image.** GitHub → Actions → "Build & Publish Container
   Image" must be green for the tag `vX.Y.Z`. Then confirm the image exists:
   `docker manifest inspect ghcr.io/beese54/drawing-portal:X.Y.Z`.
   Do not change GovPaaS before this step: a tag that has not been built
   cannot be pulled, and the next restart would fail.
5. **Point GovPaaS at it.**
   1. Open the GovPaaS console, then the project, then the drawing-portal
      service.
   2. On the service overview, open **Edit deployment**. It is the
      deployment-source dialog, as in the GovPaaS docs
      `application/run/change-deployment-source`.
   3. Keep the source as **External image**. Change the image path from
      `...:<old>` to `ghcr.io/beese54/drawing-portal:X.Y.Z`. Leave the
      registry credentials as they are.
   4. Wait for the console to verify the path (it checks it can pull).
      If it doesn't, click **Verify**.
   5. Save. The service rolls out the new image. If it does not restart on
      its own, trigger a restart or redeploy from the service page.
6. **Verify live.** `GET https://<service host>/api/health` must return
   `"version": "X.Y.Z"` and the commit you tagged
   (`git rev-parse vX.Y.Z^{commit}`).

## Roll back

Repeat step 5 with the previous version's tag, then step 6. Nothing is
rebuilt: every released image stays in GHCR under its version tag.

## Rules
- Never move or delete a pushed `v*` tag. Fix forward with a new PATCH
  release. A GitHub tag ruleset protecting `v*` enforces this.
- Never deploy `:latest` or a `:sha-` tag to GovPaaS. Only version tags.
- Pushes to `main` without a tag publish `:latest` and `:sha-<commit>` only.
  That is the release candidate the weekly scans test.

# Security policy

## Reporting a vulnerability

Please don't open a public issue for a security problem.

- **In this code:** report it privately through GitHub. Open the repository's
  **Security** tab and choose **Report a vulnerability**. Only the maintainer
  sees the report.
- **In the running service** on a `gov.sg` address: use the **Report
  Vulnerability** link in the site footer
  (<https://go.gov.sg/report-vulnerability>). That is the Singapore
  Government's vulnerability disclosure channel, and it reaches the right team
  for a live government system.

Please include what you found, where, and how to reproduce it. A proof of
concept helps; a description is enough.

Only test against your own copy of the application. Don't scan, load-test or
attack the live service: testing a government system needs authorisation.

## What happens next

- We acknowledge a report within 5 working days.
- We confirm or rule out the issue and tell you which.
- If it is real, we fix it within the timeframe below and tell you when the
  fix is released. We credit you in the changelog if you want.

## Supported versions

Only the latest release is supported. There is one deployment, and fixes go
into a new release rather than being backported.

## Remediation timeframes

How long we take to fix a confirmed vulnerability, from the day it is
confirmed (or, for a dependency, the day the advisory is published) until the
fixed release is running in production:

| Severity | Fixed within |
|---|---|
| Critical | 14 days |
| High | 30 days |
| Medium | 60 days |
| Low | 60 days |

Severity is the CVSS rating from the advisory or the scanner. We may rate an
issue lower when the vulnerable code can't be reached in this application, and
we record why when we do.

If a fix can't be made in time (no patched version exists yet, for example),
we record a time-limited exception with the reason and a review date, and
reduce exposure in the meantime where we can. Dependency exceptions live in
`ci/audit-exceptions.json`, and each one expires.

## How vulnerabilities are found

Every push runs dependency audits (pip-audit, npm audit), secret detection,
static analysis (Semgrep), Dockerfile linting (hadolint) and the test suite.
A weekly scheduled pipeline scans the released image with Trivy and re-runs
the dependency audit, so a newly published advisory is caught even when the
code hasn't changed. It is also run by hand for each new release
(`docs/RELEASING.md`). The Python dependency audit fails on any known
vulnerability, the npm audit on any High or Critical in code shipped to
browsers, and the image scan on any fixable High, Critical or unrated finding.

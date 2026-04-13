# Security Audit Report

> Output of Stage 6. This is the final artifact handed back to the user. It should be readable on its own — someone opening this file without the rest of `resources/` should understand what was found, what was fixed, what wasn't, and why.

## Executive summary

- **Project:** <name>
- **Audit date:** <date>
- **Total findings:** <N>  (Critical: X, High: Y, Medium: Z, Low: W, Info: V)
- **Mitigated:** <N>
- **Declined by user:** <N>
- **Blocked (unmitigated):** <N>
- **Top-line takeaway:** _one sentence_

## Scope

- **In scope:** (what the skill audited — code paths, config, infra files examined)
- **Out of scope:** (what it explicitly did NOT audit — e.g., third-party SaaS internals, hosting environment, physical security)

## Mitigated findings

For each finding that reached `mitigated` status:

### F-00X — <Short name>   [Severity]

- **Location:** `path/to/file.ext:line`
- **Why it was a risk:**
- **Before:**
  ```text
  <vulnerable code>
  ```
- **After:**
  ```text
  <fixed code>
  ```
- **Pen test:** `path/to/test.file`
  - Demonstrated: <what attack the test simulated>
  - Result on vulnerable code: **fail** (confirmed)
  - Result on fixed code: **pass** (confirmed)
- **Regression check:** <result of running the rest of the test suite>

---

## Declined findings

Findings the user explicitly rejected in Stage 4. Each records the user's reason verbatim.

### F-00X — <Short name>   [Severity]

- **Location:**
- **Why it was a risk:**
- **User's reason for declining:**

---

## Blocked findings

Findings that could not be mitigated automatically. Each records the specific blocker.

### F-00X — <Short name>   [Severity]

- **Location:**
- **Why it was a risk:**
- **Blocker:** (e.g., "requires product decision on whether to break existing integration", "needs infra-level change outside the repo", "mitigation requires user to supply new credentials")
- **Recommended next step:**

---

## Test infrastructure changes

Anything added to the project during Stage 5 to enable pen testing.

- **Test runner added:** (e.g., vitest, pytest, go test — or "none, existing runner used")
- **New dev dependencies:** (list)
- **New config files:** (list)
- **Net change to CI:** (did CI config change? yes/no, and how)

## Dependency changes

Any library version changes made during mitigation.

- **Added:**
- **Upgraded:**
- **Removed:**

## Recommendations for next audit

Short list of things the skill noticed but are out of scope for this pass. These are not findings — they're observations for the next time someone audits.

- _e.g._ Adopt a SAST tool in CI (semgrep, bandit)
- _e.g._ Rotate `AUTH_SECRET` quarterly
- _e.g._ Review third-party webhook signature verification next audit

---

**Report path:** `resources/audit-report.md`

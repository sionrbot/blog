# Repository permission smoke test

Verify repository access controls separately from application tests. Run remote
write checks only within an explicitly authorized account and operation scope.

## What to test

- Issue creation, comments and closing.
- Pull request creation, comments, closing, reopening and merging.
- Branch protection: required pull requests/checks and administrator enforcement.
- Interaction restrictions, collaborator membership and restriction expiry.
- Commit-comment policy separately from issue and pull-request comments.
- Rejection of an account outside the permitted group when a negative test is authorized.

## How to test

1. Read the repository's current access, interaction and branch-protection settings.
   Use those settings to define expected allowed and denied operations; do not rely
   on historical account lists or expiry dates.
2. Use a clearly marked disposable issue and a harmless pull request for authorized
   write checks. Exercise each operation separately and inspect its API response or
   timeline entry. Observe required checks before testing merge permission.
3. Test denied operations with a separately authorized account outside the permitted
   group. Owner success alone does not establish that another account is blocked.
4. Close disposable items and remove temporary branches within the authorized scope.
   Store operation responses, timeline links and account/context details in the run
   report or task record; keep credentials out of reports.

Repository permissions are not exercised by the unit, build or E2E suites. Local
application test success provides no evidence about remote access controls.

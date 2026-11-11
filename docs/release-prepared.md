# Prepared fixed-source release path

The templates in [`.github/prepared-workflows/`](../.github/prepared-workflows/)
prepare the replacement release path. GitHub Actions discovers workflows only in
`.github/workflows/`, so these templates do not schedule runs. The active release
and deployment workflows continue to use the process in [releasing.md](releasing.md).
Do not copy the templates into the active directory independently: the CI and
release cutover, old candidate reconciliation, and required checks must be
coordinated as described in [the refactor plan](quality-assurance-refactor.md).

## Fixed candidate and validation

The release template accepts a closed, merged, same-repository version PR into
`main`, from `release-please--branches--main--components--sionrbot-blog`. It checks
out the event's complete merge SHA. `scripts/release-fixed.ts candidate` reads the
version files at that SHA, requires matching stable versions, checks the live PR
identity and existing tag, and verifies that the checkout matches. Rerunning the
original workflow retains that event and source; moving `main` is never a build
input. An unpublished candidate requires its `autorelease: pending` label.

Source, translation, unit, timezone, build, internal-link and deterministic
browser checks run before publication. Pages and Workers are then built for their
respective production URLs and checked independently. Pages output is saved to
`release-output/pages` before Workers overwrites `dist`; Workers uses its own
`.cloudflare/output` prebuilt output. Neither target consumes an earlier run's
output or a PR archive. The preparation job uploads the Pages artifact using
GitHub Pages' native action and the Workers prebuilt directory using Actions'
artifact transport. Deployment jobs consume only those outputs from the same
run and attempt. These are temporary deployment inputs, not public Release
assets or a separate publication evidence protocol.

Only after all checks and both builds pass does `scripts/release-fixed.ts publish`
create or confirm the candidate Release. Notes come from `CHANGELOG.md` at the
fixed SHA. An existing tag must resolve to that SHA. An existing public stable
Release is reused without changing its notes or assets; drafts and prereleases
require explicit reconciliation. Publication sets `make_latest: legacy` so a
late older candidate does not automatically become latest merely by publishing
last. The originating PR receives `autorelease: tagged`, then loses
`autorelease: pending`.

The three commands `candidate`, `publish`, and `latest` require
`GITHUB_REPOSITORY`, `GITHUB_EVENT_PATH` pointing to the original merged-PR event,
and `GITHUB_TOKEN`. `candidate` and `latest` use read credentials; `publish` needs
release and label write access. The template supplies publication credentials
only to the publish step. These commands are workflow operations, not an entry
point for selecting an arbitrary commit to publish.

## Queue and deployment

Release verification, publication and deployment share `release-main` with
`queue: max` and `cancel-in-progress: false`. The separate maintenance template
uses `release-pr-main` and runs the existing `scripts/release.ts pr` command.
After publication a separate refresh job also runs version PR maintenance, so
changes merged while the candidate was pending can enter the next version PR.
That job shares the maintenance concurrency group. Maintenance cannot replace a
waiting release. GitHub's queue has a finite limit
of 100 waiting runs; cancelled overflow is not a successful release.

Before each deployment, `scripts/release-fixed.ts latest` checks that the
candidate is the latest published stable version and that its tag still matches.
Superseded candidates skip deployment and report that outcome. Pages and Workers
use independent deployment jobs after preparation succeeds, each with its own
smoke step. A failure in either job does not prevent the other from running, and
a failed job leaves the workflow failed. Only the Pages deployment job receives
Pages write and OIDC permissions; validation has read permissions. Cancellation
stops remaining work.

Each smoke command performs GET requests for representative pages, Pagefind's
JavaScript, and a missing route:

```sh
node scripts/smoke-site.ts https://sionrbot.github.io/blog/
node scripts/smoke-site.ts https://sionrbot-blog.pgsnotfound404.workers.dev/
```

The checks require expected HTTP statuses, reject HTML fallback for the search
JavaScript, and retry propagation failures within a bounded deadline. They do not
submit forms or repeat the browser regression suite. A successful Release does
not certify either deployment; inspect each target's deployment and smoke result.

## Recovery

- For a temporary runner, network, API, deployment or propagation failure, rerun
  the original workflow using **Re-run all jobs**. It verifies and builds the same
  candidate afresh. Each deployment rejects a preparation output from a different
  run attempt, so **Re-run failed jobs** cannot deploy a previously built artifact. A
  matching public Release is reused; a tag pointing elsewhere blocks the retry.
- For a source defect in an unpublished candidate, inspect that specific PR, tag
  and Release with credentials that can see drafts. Confirm it has not published,
  then explicitly retire that PR by removing its `autorelease: pending` label.
  This is an operator-authorized action, not automatic cleanup. Do not delete a
  draft, move a tag, or batch-clear pending candidates. The old run now rejects
  further publication attempts. Merge the repair and let version PR maintenance
  prepare a new candidate containing it; an unpublished version may be skipped.
- For a defect in a published version, preserve its Release, tag and assets.
  Merge a repair and publish it through a subsequent version PR. Do not retire
  published history to make an old version appear repaired.
- If one target fails, inspect its own failed deployment or smoke step. The other
  target's success remains a separate result. A temporary failure can retry the
  original candidate; a source defect follows the rules above. A later stable
  release supersedes an older retry and prevents it deploying.

Removing an unpublished candidate's pending label is necessary because Release
Please blocks new version PR creation while a merged pending candidate remains.
See [the tool's recovery guidance](https://github.com/googleapis/release-please#release-please-bot-does-not-create-a-release-pr-why).
The publication parameters and latest behavior are documented in
[GitHub's Release API](https://docs.github.com/en/rest/releases/releases).

# Releasing Sionrbot blog

`main` receives daily development. Promote a reviewed fixed snapshot into the
long-lived `release` branch using a merge commit. Release Please maintains its
version PR only on `release`; merging that PR fixes a software candidate's
version and merge SHA, validates and builds both targets, then publishes and
deploys. Content can deploy independently through the manual content entry point
without changing the software version. Both paths share verification and deployment.
Ordinary pushes and promotion merges do not deploy.

The [release branch specification](release-branch-spec.md) defines promotion,
content scope, recovery and cutover requirements. These instructions describe the
configured workflow; inspect live branches, rules and environments before use.
Local code changes do not establish that remote cutover has occurred. An open
version PR does not grant permission to merge it.

## Configure the release credential

The workflow uses a user access token stored as the repository Actions secret
`RELEASE_TOKEN`. PRs and Releases are authored by that token's account. It does not
fall back to the default `GITHUB_TOKEN`.

To reuse an existing GitHub CLI login, confirm that `gh` is logged into the intended
account with repository write and workflow access, then stream its token directly
to the repository secret:

```sh
gh auth status
gh auth token | gh secret set RELEASE_TOKEN --repo sionrbot/blog
```

Do not paste the token into chat, commit it, or print it in workflow logs. This
secret retains the account token's permissions; storing it in one repository does
not narrow its access to other repositories. When the token expires or is revoked,
replace `RELEASE_TOKEN` using the same command after authenticating again.

User-token-authored PRs can trigger the normal CI workflows. The Actions workflow
uses the token only in the release command, after installing dependencies, and
checks out `release` for PR maintenance or the fixed merged version SHA for publication,
without persisting checkout credentials. See
GitHub's [workflow trigger rules](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).

## Prepare changes

Use a Conventional Commit PR title and squash merge with that title:

| Prefix                                                                                                  | Effect                 |
| ------------------------------------------------------------------------------------------------------- | ---------------------- |
| `feat:`                                                                                                 | Minor version          |
| `fix:` or `perf:`                                                                                       | Patch version          |
| `!` before the colon, or a `BREAKING CHANGE:` commit footer                                             | Major version          |
| `content:`, `docs:`, `test:`, `ci:`, `build:`, `chore:`, `refactor:`, `style:` without breaking changes | No independent release |

For example, use `feat: add article search`, `fix: correct Chinese dates`, or
`content: publish a new article`. Pure content changes do not create an independent software release. They may
use the explicitly approved content deployment path below, or ship with the next
software release; they are omitted from software release notes.

Require **CI / verify** and **PR title / title** in the `release` branch rules.
These are configuration requirements, not evidence of the live remote settings;
inspect the branch rules before merging. Changes to those rules need explicit
operator authorization. Keep the version PR current with `release` and check the
final PR head after any update. CI validates GitHub's proposed PR merge tree;
release verification separately checks the actual fixed merge SHA.

## Publish a version

1. Merge reviewed feature and fix PRs into `main`, then promote a fixed snapshot
   through `promote/* → release` with a merge commit. Preview the version before
   promotion; engineering-only batches without a releasable change stay on `main`.
   **Maintain release PR** updates one PR containing `package.json`, `CHANGELOG.md`, and
   `.release-please-manifest.json`.
2. Review its version and notes. Wait for `verify` and `title` at its latest head,
   then squash merge only when publication and deployment are authorized.
3. Follow **Release fixed source** for that merged PR. Its preparation job must
   complete source checks, browser regression, and both production builds before
   creating or confirming the public Release.
4. Inspect Pages and Workers deployment and GET smoke results independently.
   A published Release alone does not establish that either site is healthy.

New Releases use GitHub's source archives; the workflow does not attach custom
production archives or a release evidence manifest. Existing published assets
and tags remain unchanged. Automated tags do not inherit the upstream
maintainer's PGP signature. See [Deployment](deploy.md) for hosting settings.

### Preview a promotion before merging

With the repository and read-capable token environment described below, preview
a pushed, fixed promotion branch before merging its PR:

```sh
git ls-remote origin refs/heads/promote/batch-name
node scripts/release.ts check --preview-branch promote/batch-name
git ls-remote origin refs/heads/promote/batch-name
```

Record and compare the complete remote SHA before and after the preview, and
require the promotion PR head to match that SHA when reviewing and merging.
The command reads remote branch history, not local working-tree changes. If the
branch moves, discard the preview and repeat against the new reviewed snapshot.
Preview branch names use `promote/` followed by alphanumeric, underscore or hyphen
segments. This option is only accepted by `check`, cannot combine with recovery,
and never creates a PR. Ordinary `pr` remains bound to `release`. The preview's
proposed title/branch scope refers to the promotion branch; the version and notes
are the review evidence, and the actual version PR is generated on `release`.
Pending software recovery is still checked on the publication line, not inferred
from PRs targeting the promotion branch. An empty `pullRequests` result means the
batch cannot independently produce a software release.

## Deploy content independently

With the release branch and environment rules configured, promote an eligible content snapshot and
record the complete `release` HEAD SHA. Run **Release fixed source** manually
from the `release` branch, supplying that SHA as the `sha` input. Equivalently,
when deployment is authorized:

```sh
gh workflow run release.yml --ref release -f sha="$CANDIDATE_SHA"
```

Use a full commit SHA, not a branch name or tag. The workflow execution ref and
candidate SHA are checked separately. The checkout must match that SHA, and the
candidate must equal live `release` HEAD. The version files must agree with the
latest public stable software Release; its tag must be an ancestor of the
candidate. Cumulative changes from that tag must satisfy the
[content allowlist](release-branch-spec.md#内容范围). This catches unversioned
software changes even when the most recent PR only changes an article.

Review MDX imports, expressions and component usage during promotion. Path checks
do not classify executable MDX as prose. Content runs execute full validation and
both builds, then deploy and smoke both targets. They skip software Release,
version bump and software PR label operations. An empty cumulative diff is allowed
for restoring content to the software baseline; notices-only changes are not.

The candidate record and per-step outcomes appear in the run summaries, with
software version, tag baseline, source SHA, run ID and attempt. Preserve the run
URL when recording delivery; Actions retention limits apply. A public software
Release whose deployment failed can serve as the baseline for a content candidate;
that deployment also restores the approved software, so report the actual SHA.

## Promotion and back-merge discipline

Keep one publication batch active at a time. Finish its authorized endpoint and
required back-merge before the next unrelated promotion. Do not advance `release`
with unrelated content after a version PR merges but before publication: the old
candidate loses HEAD deployment eligibility and the new content has no public
software baseline. Source repairs follow recovery below.

Create a `release → main` back-merge PR after a version PR merges, and promptly
back-merge release-line repairs. Use merge commits. For conflicts, create a branch
from `release`, merge `main` into it, resolve, and PR that branch to `main`; do not
merge unpromoted development into `release`. Content already inherited from
`main` needs no synthetic back-merge when `release` has no additional changes.
Back-merge is independent of deployment success and includes failed candidates'
version records. A fix on `release` ships with everything already promoted there;
this workflow does not maintain an independent old-version hotfix line.

## Fixed candidate and validation

The [release workflow](../.github/workflows/release.yml) accepts a closed, merged, same-repository version PR into
`release`, from `release-please--branches--release--components--sionrbot-blog`. It checks
out the event's complete merge SHA. `scripts/release-fixed.ts candidate` reads the
version files at that SHA, requires matching stable versions, checks the live PR
identity and existing tag, and verifies that the checkout matches. Rerunning the
original workflow retains that event and source; moving `release` is never a build
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
`GITHUB_REPOSITORY`, `GITHUB_EVENT_PATH` pointing to the original merged-PR or
content-dispatch event, and `GITHUB_TOKEN`. The workflow also supplies event name
and execution ref for entry-point validation. `candidate` and `latest` use read credentials; `publish` needs
release and label write access. The workflow supplies publication credentials
only to the publish step. Software commands are workflow operations, not an entry
point for selecting an arbitrary commit to publish. Content dispatch uses its
original input SHA and the `release` execution ref; deployment jobs also receive
the prepared tag SHA to reject baseline mutation.

## Queue and deployment

Release verification, publication and deployment share `release-production` with
`queue: max` and `cancel-in-progress: false`. The [maintenance workflow](../.github/workflows/release-please.yml)
uses `release-pr-release` and runs the existing `scripts/release.ts pr` command.
After publication a separate refresh job also runs version PR maintenance, so
changes merged while the candidate was pending can enter the next version PR.
That job shares the maintenance concurrency group. Maintenance cannot replace a
waiting release. GitHub's queue has a finite limit
of 100 waiting runs; cancelled overflow is not a successful release.

Before each deployment, `scripts/release-fixed.ts latest` checks that the
software baseline is a public stable version, its tag still matches, and the
candidate SHA equals the live `release` HEAD. A newer HEAD supersedes the old
candidate even when the newer candidate has not deployed. Superseded candidates
skip deployment and report that outcome. Pages and Workers
use independent deployment jobs after preparation succeeds, each with its own
smoke step. A failure in either job does not prevent the other from running, and
a failed job leaves the workflow failed. Only the Pages deployment job receives
Pages write and OIDC permissions; validation has read permissions. Cancellation
stops remaining work. The queue serializes runs but does not lock branch updates
or atomically switch both targets. If HEAD advances between target checks, one
target can deploy while the other skips; report both and recover through the new
HEAD. Content errors are repaired with a new content candidate, without retiring
a software version. Same-SHA retries require **Re-run all jobs**.

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

## Inspect and retry

- For a temporary runner, network, API, deployment or propagation failure while
  the candidate remains `release` HEAD, rerun
  the original workflow using **Re-run all jobs**. It verifies and builds the same
  candidate afresh. Each deployment rejects a preparation output from a different
  run attempt, so **Re-run failed jobs** cannot deploy a previously built artifact. A
  matching public Release is reused; a tag pointing elsewhere blocks the retry.
- For a source defect in an unpublished candidate, inspect that specific PR, tag
  and Release with credentials that can see drafts. Confirm it has not published,
  then explicitly retire that PR by removing its `autorelease: pending` label.
  This is an operator-authorized action, not automatic cleanup. Do not delete a
  draft, move a tag, or batch-clear pending candidates. The old run now rejects
  further publication attempts. Merge the repair, then use the explicit recovery preview and PR commands below;
  an unpublished version must be skipped. Ordinary maintenance waits while any
  merged candidate remains pending. After retirement, it stops if the manifest
  has no public stable Release, instead of rediscovering already published history.
- For a defect in a published version, preserve its Release, tag and assets.
  Merge a repair and publish it through a subsequent version PR. Do not retire
  published history to make an old version appear repaired.
- If one target fails, inspect its own failed deployment or smoke step. The other
  target's success remains a separate result. A temporary failure can retry the
  original candidate while its SHA remains `release` HEAD; a source defect follows the rules above. Any later `release` HEAD supersedes an older retry and prevents it deploying.

Removing an unpublished candidate's pending label is necessary because Release
Please blocks new version PR creation while a merged pending candidate remains.
See [the tool's recovery guidance](https://github.com/googleapis/release-please#release-please-bot-does-not-create-a-release-pr-why).
The publication parameters and latest behavior are documented in
[GitHub's Release API](https://docs.github.com/en/rest/releases/releases).

When the manifest is ahead of the latest public stable Release after retirement,
select that public Release as the history boundary and choose a new stable version
higher than the manifest. Review the unpublished changes when choosing the version
(patch, minor, or major); the recovery command uses that explicit choice. With the
same repository and token environment as ordinary maintenance:

```sh
node scripts/release.ts check --recover-from "$PUBLIC_TAG" --release-as "$NEXT_VERSION"
node scripts/release.ts pr --recover-from "$PUBLIC_TAG" --release-as "$NEXT_VERSION"
```

`PUBLIC_TAG` includes `v`; `NEXT_VERSION` does not. Before these commands, inspect
the retired candidate with draft-visible credentials and confirm its version has
neither a Release nor a tag. Existing drafts or tags require separate explicit
reconciliation; these commands do not remove them. The command checks the public
base, its tag SHA, reachable history, unused next version, and pending candidates.
It changes the in-memory history boundary and version only: notes compare against
the public base, include unpublished changes and the repair, and exclude changes
already released there. Review the preview and all three generated version files.
Repeat the same recovery command to refresh the PR after further changes; ordinary
maintenance deliberately stops during this gap so it cannot overwrite the recovery
PR with bootstrap history. After the recovery version publishes, ordinary maintenance
resumes without removing a persistent override. The PR still follows normal review,
validation, merge, and fixed-source publication; this command only maintains a PR.

For a local read-only preview of version PR changes, supply
`GITHUB_REPOSITORY=sionrbot/blog` and a read-capable `GITHUB_TOKEN` through the
environment, then run `node scripts/release.ts check`. The `pr` command maintains
the version PR with write credentials; it does not publish a Release. Credentials
must not be saved in tracked files. Run `pnpm run test:unit` for release and
recovery contracts without GitHub writes.

## Version history origin

Versions through `1.4.1` in `CHANGELOG.md` belong to the upstream Pilcrow theme.
Keep those entries as attributed history; do not push the inherited local tags or
recreate upstream Releases in this repository.

`release-please-config.json` retains bootstrap boundary
`7865317be2275f91472df7319f34d00319373c2f`, immediately before the blog's first
personalization commit. `scripts/release.ts` requests `1.5.0` only when the
manifest's released version is the inherited `1.4.1`; normal version calculation
applies after bootstrap. Existing project history uses the manifest and public
software Releases, including the explicit recovery boundary described above.

See [Release Please's bootstrap configuration](https://github.com/googleapis/release-please/blob/main/docs/manifest-releaser.md#bootstrapping).

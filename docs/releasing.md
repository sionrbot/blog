# Releasing Sionrbot blog

Release Please prepares a version PR. The single CI `verify` job checks ordinary
and version PRs identically. Merging a version PR automatically starts a release
run that fixes its version and merge SHA, repeats validation, builds both hosting
targets, then publishes and deploys. Ordinary `main` pushes maintain the version
PR and do not deploy. An open version PR does not grant permission to merge it.

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
checks out `main` for PR maintenance or the fixed merged version SHA for publication,
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
`content: publish a new article`. Pure content changes do not create an independent
release or deploy immediately. They ship with the next release and are omitted
from software release notes.

Require **CI / verify** and **PR title / title** in the `main` branch rules.
These are configuration requirements, not evidence of the live remote settings;
inspect the branch rules before merging. Changes to those rules need explicit
operator authorization. Keep the Release PR current with `main` and check the
final PR head after any update. CI validates GitHub's proposed PR merge tree;
release verification separately checks the actual fixed merge SHA.

## Publish a version

1. Merge reviewed feature and fix PRs into `main`. **Maintain release PR** updates
   one PR containing `package.json`, `CHANGELOG.md`, and
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

## Fixed candidate and validation

The [release workflow](../.github/workflows/release.yml) accepts a closed, merged, same-repository version PR into
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
release and label write access. The workflow supplies publication credentials
only to the publish step. These commands are workflow operations, not an entry
point for selecting an arbitrary commit to publish.

## Queue and deployment

Release verification, publication and deployment share `release-main` with
`queue: max` and `cancel-in-progress: false`. The [maintenance workflow](../.github/workflows/release-please.yml)
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

## Inspect and retry

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

For a local read-only preview of version PR changes, supply
`GITHUB_REPOSITORY=sionrbot/blog` and a read-capable `GITHUB_TOKEN` through the
environment, then run `node scripts/release.ts check`. The `pr` command maintains
the version PR with write credentials; it does not publish a Release. Credentials
must not be saved in tracked files. Run `pnpm run test:unit` for release and
recovery contracts without GitHub writes.

## Start the project version history

Versions through `1.4.1` in `CHANGELOG.md` belong to the upstream Pilcrow theme.
Keep those entries as attributed history; do not push the inherited local tags or
recreate upstream Releases in this repository.

The bootstrap boundary is `7865317be2275f91472df7319f34d00319373c2f`, immediately
before the blog's first personalization commit. While the manifest is `1.4.1`,
the script requests `1.5.0` for the first release PR. Once that PR updates the
manifest, normal automatic version calculation resumes without a permanent
`release-as` override.

Review the first release notes against the actual changes since that boundary.
Some historical PR titles were not Conventional Commits, so their changes may
need to be added to the notes. In particular, account for branding, bilingual UI,
toolchain and testing changes, and GitHub Pages / Cloudflare Workers deployment.
For a squash-merged historical PR, Release Please supports a
`BEGIN_COMMIT_OVERRIDE` / `END_COMMIT_OVERRIDE` section in its description. Apply
such corrections before refreshing the release PR; avoid editing generated notes
only to have the next refresh overwrite them.

See [Release Please's commit overrides](https://github.com/googleapis/release-please#how-can-i-fix-release-notes)
and [bootstrap configuration](https://github.com/googleapis/release-please/blob/main/docs/manifest-releaser.md#bootstrapping).

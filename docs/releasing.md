# Releasing Sionrbot blog

Release Please prepares a version PR. CI and E2E validate that PR before merge;
CI also builds the Pages and Workers deployment archives. Merging the Release PR
authorizes publication only when its validated source tree matches the actual
merge commit. Release and deployment reuse those archives without repeating
source checks, browser tests, or builds. Ordinary `main` pushes maintain the
Release PR; production changes only when a release is deployed.

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
checks out trusted `main` tooling without persisting checkout credentials. See
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

The **PR title / title** check validates the title. Configure it as a required
check in the `main` branch rules if invalid titles must block merging. Likewise,
require CI and E2E before merging changes. Keep the Release PR current with `main`
and wait for its latest checks after any update. CI and E2E run on GitHub's PR
merge commit, so their evidence covers the proposed combined tree. A green check
for an earlier PR head or a different combined tree cannot authorize publication.

## Publish a version

1. Merge reviewed feature and fix PRs into `main`. The **Release** workflow
   maintains one Release PR containing `package.json`, `CHANGELOG.md`, and
   `.release-please-manifest.json` updates. Ordinary PRs run CI and E2E before
   merge; merging them does not repeat those jobs or deploy the site.
2. Review the version and notes in the Release PR. Its same-repository branch is
   `release-please--branches--main--components--sionrbot-blog`, targeting `main`. CI builds and validates
   `pages.tar` and `workers.tar`; E2E records evidence only after all four variants
   succeed. The build and E2E evidence artifacts are retained for 90 days.
3. Keep the Release PR up to date and wait for its latest complete CI and E2E
   runs. Use squash merge when ready to publish. Version changes belong in this
   PR, before the production archives are built.
4. The publisher looks up the merged PR and its latest PR-triggered CI and E2E
   runs. It verifies the repository, PR head, workflow identity, run attempt,
   version, artifact digests, and tested Git trees. Both tested trees must equal
   the actual merge commit's tree. Squash merge may change the commit SHA;
   identical tree IDs establish identical tracked content.
5. The publisher creates `vX.Y.Z` and the matching GitHub Release, then attaches
   `pages.tar`, `workers.tar`, and `release-manifest.json`. The manifest is attached
   last and records the approved source, test runs, and archive SHA-256 digests.
6. After the assets are ready, the Release workflow calls the deployment workflow
   for that tag. Pages and Workers consume the verified archives. Confirm both
   deployments separately before synchronizing the local repository.

The publisher freezes approved candidates before asking Release Please to create
releases. A later merge cannot become an unchecked candidate during that operation.
Existing tags must resolve to the expected commit; existing assets must have the
expected digest. Conflicts fail instead of replacing published history. Automated
tags do not inherit the upstream maintainer's PGP signature.

A Release includes GitHub's source archives and the two deployment archives. It
certifies the recorded PR validation and artifact provenance, not successful
hosting deployment. The release workflow exposes a deployable tag only after all
three assets are present. See [Deployment](deploy.md) for platform settings and
manual deployment retries.

## Artifact and source mismatches

Missing, expired, or mismatched evidence blocks publication. There is no fallback
to rebuilding or rerunning CI on `main`. Before merging, refresh an outdated
Release PR and rerun its PR checks to produce current evidence. Manual CI/E2E
workflow dispatches are useful for investigation but do not replace PR evidence.
When retrying CI or E2E, choose **Re-run all jobs**. Evidence must belong to the
latest workflow attempt; rerunning only failed jobs can leave a successful run
with archives or evidence from an older attempt, which publication rejects.

If a merged candidate's tree differs from the validated tree, investigate the
intervening changes and prepare a new validated Release PR. A successful check on
a different SHA or newer PR does not repair the old candidate. Legacy releases
without the deployment archives and manifest cannot use this deployment workflow.

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

## Inspect and retry

`main` pushes run Release Please to publish ready merged candidates and refresh
its Release PR. Completion of same-repository PR CI/E2E runs also wakes the
publisher, covering a merge that happened while the final evidence was still
being uploaded. Publication checks existing PR evidence; it does not launch new
CI, E2E, or production builds.

Use **Actions → Release → Run workflow**, on `main`, with one of these modes:

- `check`: preview candidates without creating PRs, tags, labels, or Releases.
- `pr`: refresh the Release PR.
- `publish`: retry publication of merged candidates using their existing valid
  PR evidence. This does not bypass failed checks, expired artifacts, or source
  mismatches.

The publisher keeps `autorelease: pending` until every deployment asset is
attached. Release Please's early pending-to-tagged transition is deferred, so a
runner interruption during publication leaves a discoverable retry candidate.
After asset completion, the publisher adds `autorelease: tagged` and removes
`autorelease: pending`. If a caught publication error occurs, it restores the
pending label and removes the tagged label so `publish` can retry.
A matching existing tag and already uploaded matching assets are reused; conflicting
tags or assets require investigation. If label restoration itself fails, inspect
the reported error and reconcile the labels before retrying. A Release can exist
before its assets are complete, so verify `release-manifest.json` and the two
archives rather than treating the Release page alone as delivery completion.

For a source fix, merge the fix, verify that the old candidate has not published,
retire it by removing `autorelease: pending` from its merged PR, then run `pr` to
prepare the next version. The pending label otherwise blocks a new Release PR.
Retiring an unpublished candidate may skip a version number. Preserve any published
tag and assets; published releases require a subsequent version for source changes.

If only hosting deployment fails, use the deployment workflow's manual trigger
with the latest published stable `release_tag`; it reuses the same release assets.
See [Deployment](deploy.md). A failure refreshing the next Release PR does not
invalidate assets that were already published successfully.

For a local read-only preview, supply `GITHUB_REPOSITORY=sionrbot/blog` and
a read-capable `GITHUB_TOKEN` through your environment, then run
`node scripts/release.ts check`. Credentials must not be saved in tracked files.
Run `vp run test:unit` to exercise the release gate without GitHub writes.

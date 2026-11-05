# Releasing Sionrbot blog

Releases identify tested source snapshots of the blog. Release Please prepares a
version PR; merging it authorizes publication after the merge commit passes CI and
E2E. Website deployments continue to follow `main` independently.

## Configure the release credential

The workflow uses a user access token stored as the repository Actions secret
`RELEASE_TOKEN`. PRs and Releases are authored by that token's account. It does not
fall back to the default `GITHUB_TOKEN`.

To reuse an existing GitHub CLI login, confirm that `gh` is logged into the intended
account with repository write and workflow access, then stream its token directly
to the repository secret:

```sh
gh auth status
gh auth token | gh secret set RELEASE_TOKEN --repo sionrbot/sionrbot-blog
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
`content: publish a new article`. Pure content changes still deploy and are included
in subsequent source snapshots, but are omitted from software release notes.

The **PR title / title** check validates the title. Configure it as a required
check in the `main` branch rules if invalid titles must block merging. Likewise,
require CI and E2E before merging changes. The release publisher checks CI and E2E
again on the actual release merge commit even if branch rules are not configured.

## Publish a version

1. Merge feature and fix PRs into `main`. The **Release** workflow maintains one
   release PR containing `package.json`, `CHANGELOG.md`, and
   `.release-please-manifest.json` updates.
2. Review the version and notes in that PR, and wait for its checks. Use squash
   merge when ready to publish. Do not manually bump the package version alongside
   ordinary feature work.
3. CI and E2E run on the merge commit. Completion of either workflow wakes the
   publisher, which verifies that both latest `push` runs for that exact SHA
   succeeded. An unrelated SHA, a PR run, or an older successful run cannot approve
   publication.
4. The publisher creates `vX.Y.Z` and the matching GitHub Release and transitions
   the PR from `autorelease: pending` to `autorelease: tagged`.

The publisher freezes its validated candidates before asking Release Please to
create releases. A later merge cannot become an unchecked candidate during that
operation. Existing tags must resolve to the expected commit and are never moved.
The pinned `release-please` version and regression tests protect this API boundary.
Automated tags do not inherit the upstream maintainer's PGP signature.

Releases include GitHub's source archives; the workflow neither publishes an npm
package nor attaches a deployment-specific `dist` archive. A Release means its
source passed CI and E2E, not that both hosting deployments have succeeded.

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

Automatic `main` pushes and CI/E2E completion events both retry ready releases
and refresh the release PR. This also picks up changes merged while the previous
release was waiting for checks.

Use **Actions → Release → Run workflow**, on `main`, with one of these modes:

- `check`: preview candidates without creating PRs, tags, labels, or Releases.
- `pr`: refresh the release PR.
- `publish`: retry publication of merged candidates after checking their exact
  commit again. This does not bypass failed or missing checks.

If CI or E2E fails, fix the issue or rerun the failed run for the release SHA.
A successful run for a newer commit does not qualify the old candidate. When a
code fix is necessary, merge the fix, retire the unpublished candidate by removing
`autorelease: pending` from its merged PR, then run `pr` to prepare the next version.
The pending label otherwise blocks new release PRs. Retiring an unpublished candidate
may skip a version number; never move an existing tag. Verify that no Release was
published before retiring a candidate.
If a tag exists but publication was interrupted, retry `publish`; a matching tag
can be reused. A tag pointing to another SHA fails the workflow for investigation.
If the Release already exists but label updates failed, rerun publication to
reconcile the pending PR.

For a local read-only preview, supply `GITHUB_REPOSITORY=sionrbot/sionrbot-blog` and
a read-capable `GITHUB_TOKEN` through your environment, then run
`node scripts/release.ts check`. Credentials must not be saved in tracked files.
Run `vp run test:unit` to exercise the release gate without GitHub writes.

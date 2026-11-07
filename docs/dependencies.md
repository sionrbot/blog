# Dependency updates

Dependabot reads `.github/dependabot.yml` from the default branch. It checks the
root pnpm project every Tuesday at 02:00 in `Asia/Shanghai`.

Routine minor and patch updates are grouped by Astro, Vite+, TypeScript/ESLint,
content rendering, Tailwind, assets, i18n, browser tests, AI tests, and build tests.
MDX and Satteri belong to the Astro group. Packages outside these groups, including
deployment and release tools, receive individual update PRs. Major updates also
receive individual PRs; they are not ignored. At most ten ordinary update PRs may
be open at once.

Enable Dependency graph, Dependabot alerts, and Dependabot security updates in
the repository's GitHub security settings. Leave repository-wide grouped security
updates off. Explicit `security-updates` groups in `.github/dependabot.yml` group
minor and patch security fixes by the same ten technologies, separately from
routine version updates. Major security updates and packages outside these groups
remain individual PRs. These explicit groups work even with the repository-wide
grouping switch disabled.

Security updates are separate from the weekly version-update schedule and its
PR limit. Dependabot attempts a fix when an eligible vulnerability alert has a
resolvable update; enabling it does not guarantee that every vulnerability can be
fixed automatically.

PR titles use the Conventional Commit `chore` prefix and dependency scope.
Updates require review and passing checks; do not enable automatic merging.

## Transitive dependencies

Routine updates primarily maintain dependencies declared in `package.json`.
Updating a parent package can also change transitive dependencies in
`pnpm-lock.yaml`, but does not refresh the entire dependency tree. Keep this
policy: do not add separate routine updates for every transitive package.
`pnpm install --frozen-lockfile` installs the recorded dependency graph; it does
not select newer releases.

Security updates also cover vulnerable transitive dependencies recorded in the
lockfile. Dependabot attempts a compatible repair, which may update only the
lockfile or require a parent-package update. If upstream constraints prevent a
safe resolution, investigate the alert and prepare a reviewed fix; an alert does
not guarantee that Dependabot can open a repair PR. Security fixes do not wait
for the Tuesday schedule.

Groups match package names, not dependency ancestry. For example, `minimatch`
does not join the TypeScript/ESLint security group merely because ESLint uses it.
Minor/patch fixes must match a configured security group's patterns to be grouped;
unmatched updates and major updates remain separate PRs. All still require review
and passing checks before merging.

Do not treat `allow.dependency-type: all` as enabling routine updates for every
pnpm transitive dependency: GitHub's options reference does not list the `npm`
ecosystem as supporting indirect dependencies through that option.

## Temporary minimatch overrides

`pnpm-workspace.yaml` contains targeted overrides for
[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).
They pin `minimatch` to `11.0.5` on these dependency edges:

| Parent package                         | Parent version matched by the override |
| -------------------------------------- | -------------------------------------- |
| `eslint`                               | `10.14.0`                              |
| `@eslint/config-array`                 | `0.23.5`                               |
| `@typescript-eslint/typescript-estree` | `8.72.1`                               |
| `@google-automations/git-file-utils`   | `3.2.1`                                |

These are temporary compatibility exceptions, not an automatic update mechanism.
The exact minimatch pin does not advance when a newer release appears. Each rule
also matches an exact parent version: upgrading that parent makes the old rule
stop applying, even if its replacement still requires a vulnerable minimatch.
Review these edges when updating ESLint, TypeScript/ESLint, release-please, or any
other package that changes these consumers in the lockfile.

For each affected edge, use the following maintenance procedure in the dependency
update PR:

1. Inspect the new parent's declared minimatch range and the resolved dependency
   graph (`pnpm why minimatch`). Check the current advisory and any newer relevant
   advisories; do not infer safety from a parent-package version bump alone.
2. Try removing the corresponding override and regenerate the lockfile with the
   pinned pnpm version. Remove the rule permanently only if the parent accepts a
   patched version without the override, the actual consumer resolves to a safe
   version, and the security regression and compatibility checks below pass.
   Remove edges independently; keep overrides still needed by other consumers.
   If a consumer has disappeared from the dependency graph, confirm that its
   replacement paths are safe before removing its obsolete rule and test entry.
3. If the new parent still needs an override, explicitly review and update its
   version selector and patched target, then repeat compatibility validation.
   Do not leave an ineffective old selector or broaden it to a global override
   merely to make installation succeed. If no safe compatible resolution exists,
   keep the update unmerged and investigate another repair.
4. Maintain `tests/unit/minimatch-security.test.ts` alongside the graph changes.
   Its consumer-resolution assertions currently require exactly `11.0.5`; update
   them to the reviewed safe resolution when appropriate, including when removing
   an override. Preserve the amplification regression, legitimate-match controls,
   and relevant ESLint, parser, and release-tool compatibility coverage. A version
   assertion failure requires review, even when the new version is also patched.
5. Review `minimumReleaseAgeExclude` entries for `minimatch@11.0.5` and
   `@isaacs/nonrecursive-glob-match@1.1.0`. Remove exceptions that are no longer
   needed for the repaired graph; do not carry them forward automatically. Keep
   the advisory comment while related overrides remain, and update this section
   to reflect the remaining rules.

Validate a frozen-lockfile installation, run `pnpm run test:unit`, and run all
project checks listed below. Review the lockfile for other vulnerable minimatch
copies and run `pnpm audit`; the four consumer tests alone do not cover every
possible dependency path. Require the existing CI and E2E checks before merging.
After merging a security repair, verify that the relevant Dependabot alert is
fixed rather than dismissed; automatic alert closure is not a substitute for
pre-merge verification.

## CI credentials

The AI E2E jobs require `OPENAI_API_KEY` in **Dependabot secrets**, with access to
this repository. Dependabot-triggered workflows cannot use the value from Actions
secrets. Set a suitable key under Settings → Secrets and variables → Dependabot.
GitHub does not expose an existing Actions secret's value for copying.

Keep the current CI and E2E checks when reviewing bot PRs. A missing key must not
be worked around by skipping AI tests or running untrusted PR code with privileged
`pull_request_target` credentials.

## Review linked versions

- Keep `vite-plus` and the `vite` alias to `@voidzero-dev/vite-plus-core` aligned
  in `pnpm-workspace.yaml`, including catalogs and overrides. Grouping updates does
  not establish compatibility; use the target Vite+ migrator when necessary.
- Review TypeScript major updates against Astro Check and typescript-eslint
  support before changing the project's TypeScript 6 constraint.
- When `@e2e-dev/web` changes its Playwright dependency, update the matching CI
  container version, digest, and explicit version assertion in
  `.github/workflows/e2e.yml` together.
- Node.js runtime pins, pnpm tool-version pins, copied font files, and CI tools
  invoked with `pnpm dlx` require separate review. This npm configuration does not
  promise to maintain them or GitHub Actions references. Keep
  `package.json#devEngines.runtime.version` and `pnpm-workspace.yaml#nodeVersion`
  aligned when updating Node.js.

Review manifest, workspace, and lockfile changes together. Validate installation
with `pnpm install --frozen-lockfile`, then run the required project checks:

```sh
pnpm run check
pnpm exec vp check
pnpm run lint
pnpm run build
```

Run the relevant unit, build-output, and browser tests as well; CI runs the full
configured checks. Inspect light/dark and narrow-screen rendering for style,
font, icon, or content-renderer changes. Merge only after reviewing the actual
changes and results.

## References

- [Dependabot configuration options](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference)
- [Dependabot security updates](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependabot-security-updates)
- [Dependabot on GitHub Actions](https://docs.github.com/en/code-security/reference/supply-chain-security/troubleshoot-dependabot/dependabot-on-actions)
- [Updating Vite+ projects](https://viteplus.dev/guide/upgrade-project)

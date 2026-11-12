# Delivery closeout

Use this process for PR delivery, repository synchronization, and task branch
cleanup. A clean working tree, a merged PR, a published release, and a synchronized
local branch are separate conditions.

## Verify the delivered change

1. Record the PR number, repository, target branch, and latest head SHA. Confirm
   review and required checks cover that SHA before merging. If the head changes,
   repeat the review and checks affected by the change. Merge only within the
   user's authorization and use an expected-head check when supported.
2. Record the actual merge SHA and final PR head SHA. Inspect the PR-triggered
   CI `verify` and PR title `title` checks for that head. CI does not run again on
   ordinary `main` pushes; its absence on the merge commit is expected. Check
   failures, cancellations, and missing required jobs instead of treating workflow
   completion as success.
3. Follow [Releasing Sionrbot blog](../releasing.md). Classify the change as
   awaiting promotion, awaiting a software version PR, a fixed software candidate,
   or an approved content candidate. For a software version PR into `release`,
   record its head and merge SHAs separately and verify its tag resolves to that
   merge SHA. For content dispatch, record its full input SHA, execution ref,
   software tag baseline, run ID and attempt; a software Release is not created.
4. Inspect preparation, software publication when applicable, Pages deployment/smoke,
   and Workers deployment/smoke separately. Require validation and both builds
   from the deployment's current attempt. Verify the fixed candidate against live
   `release` HEAD. Report superseded candidates as skipped, and report each target
   separately when only one deployed. Back-merge completion does not certify deployment.
5. Wait for authorized publication/deployment work to reach its endpoint, then
   synchronize locally. An open version PR or a merged promotion does not authorize
   production deployment. Report pending cutover, approval, recovery or back-merge
   work separately; ordinary feature and promotion merges do not deploy.

Proceed to final synchronization after the relevant release and deployment work
has reached its authorized endpoint. If checks fail or authorized work remains
pending, report that state rather than claiming delivery complete.

## Synchronize and clean task branches

1. Inspect `git status --short --branch`, `git branch -vv`, and
   `git worktree list --porcelain`. Preserve unrelated changes and branches.
   Perform branch switching and synchronization with a clean working tree; if
   changes or divergence block the operation, preserve them and report the
   blocker. Do not reset, discard, or automatically stash user work.
2. Fetch the intended remote, inspect newly arrived commits, switch to the target
   branch, and fast-forward only. For the usual `origin` / `main` pair:

   ```sh
   git fetch origin
   git log --oneline main..origin/main
   git switch main
   git merge --ff-only origin/main
   ```

3. For each task branch selected for cleanup, verify the PR is merged into the
   intended repository and target branch, and that its merge commit is included
   in the synchronized target. Record the PR head SHA and compare it to the
   branch's current tip. Preserve branches containing later or otherwise
   unverified commits. A closed, unmerged PR is not cleanup evidence.
4. Delete only verified task branches that are unused by other worktrees. Normal
   ancestry checks may reject a squash-merged branch; local force deletion is
   acceptable only after the PR merge, matching branch tip, and target inclusion
   checks above establish that its work was delivered. Before remote deletion,
   verify the live remote tip still matches the recorded head SHA and use a
   lease tied to that SHA so concurrent changes cannot be deleted. If the remote
   branch is already absent, remove its stale tracking reference. Leave unrelated
   and unmerged historical branches intact.

## Final verification

Run the read-only snapshot from the repository root:

```sh
node scripts/check-closeout.ts --pr 39
```

For a software version PR, use its number with `--base release`. For an explicitly
selected content deployment run, use:

```sh
node scripts/check-closeout.ts --run RUN_ID --base release
```

Replace the examples with the delivered PR or workflow run ID. Optional `--remote` and
`--base` arguments select a remote and target branch; defaults are `origin` and
`main`. Git, an authenticated GitHub CLI, and remote read access are required.

The script emits JSON containing repository state, live remote state, PR metadata,
and separate workflow snapshots for the PR head, merge commit, and current remote
base. The run form reports the selected candidate separately from the workflow execution
SHA, and includes current-attempt target jobs and steps. `--pr` and `--run` are
mutually exclusive.
Use the software version PR number with `--base release` for software delivery.
It does not fetch, change branches, edit files,
delete refs, merge PRs, or publish releases. Exit codes describe the snapshot:

| Code | Meaning                                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------- |
| `0`  | The repository is clean/synchronized and the candidate is in base history; PR mode also requires a merged PR. |
| `1`  | One or more of those conditions is incomplete.                                                                |
| `2`  | The check could not complete, such as an authentication or network error.                                     |

A successful exit is not approval to delete a branch and does not certify CI,
browser tests, deployment, smoke, or release completion. Assess those independently
using the recorded PR head when applicable, fixed candidate SHA, software tag
baseline, and workflow jobs. For content, inspect dispatch identity and both target
results rather than looking for a new software Release.

Compare the local target SHA with the live remote branch SHA, not only a cached
tracking ref. If the remote advanced during closeout, inspect the new commits and
repeat the affected synchronization and verification steps. An unrelated new task
does not authorize additional merges or publication.

Report the final observation time, local and live remote SHAs, and separate
outcomes for the PR merge when applicable, candidate checks, software publication
when applicable, both deployments/smoke checks, back-merge, synchronization, and branch
cleanup. Name branches deliberately preserved and any pending work or blocker.
The synchronization claim applies at the recorded observation time; later remote
activity can advance the branch again.

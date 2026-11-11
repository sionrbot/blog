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
3. Follow [Releasing Sionrbot blog](../releasing.md). Determine whether the change
   awaits a version PR, belongs to a merged version awaiting publication, or has
   no independent release. For a merged version PR, record its head and merge
   SHAs separately. Verify the tag resolves to its fixed merge SHA and inspect
   that candidate's release preparation, publication, Pages deployment/smoke,
   and Workers deployment/smoke separately. For retries, require validation and
   both builds from the deployment's current run attempt. Superseded candidates
   may skip deployment; report that outcome without claiming they went live.
4. Wait for authorized release and deployment work to reach its endpoint, then
   synchronize locally. An open Release PR does not grant permission to merge it;
   report that boundary when publication is outside scope. Publication alone
   does not certify either hosting target, and ordinary feature merges do not
   deploy automatically.

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

Replace the example PR number with the delivered PR. Optional `--remote` and
`--base` arguments select a remote and target branch; defaults are `origin` and
`main`. Git, an authenticated GitHub CLI, and remote read access are required.

The script emits JSON containing repository state, live remote state, PR metadata,
and separate workflow snapshots for the PR head, merge commit, and current remote
base. Run it again with the Release PR number when checking release delivery. It does not fetch, change branches, edit files,
delete refs, merge PRs, or publish releases. Exit codes describe the snapshot:

| Code | Meaning                                                                   |
| ---- | ------------------------------------------------------------------------- |
| `0`  | The checked repository is clean and synchronized, and the PR is merged.   |
| `1`  | One or more of those conditions is incomplete.                            |
| `2`  | The check could not complete, such as an authentication or network error. |

A successful exit is not approval to delete a branch and does not certify CI,
browser tests, deployment, smoke, or release completion. Assess those independently
using the recorded PR head, fixed merge SHA, release tag, and workflow jobs.

Compare the local target SHA with the live remote branch SHA, not only a cached
tracking ref. If the remote advanced during closeout, inspect the new commits and
repeat the affected synchronization and verification steps. An unrelated new task
does not authorize additional merges or publication.

Report the final observation time, local and live remote SHAs, and separate
outcomes for the PR merge, checks/deployments, release, synchronization, and branch
cleanup. Name branches deliberately preserved and any pending work or blocker.
The synchronization claim applies at the recorded observation time; later remote
activity can advance the branch again.

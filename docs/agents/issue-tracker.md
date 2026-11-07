# Issue tracker: GitHub

Issues and specs live in `sionrbot/sionrbot-blog` on GitHub.
Use the `gh` CLI from this repository.

## Target repository

Before the first issue creation in a session, run
`gh repo view --json nameWithOwner` and verify the target is
`sionrbot/sionrbot-blog`. Use `--repo sionrbot/sionrbot-blog` when needed
to select it explicitly.

## Operations

- Create: `gh issue create --title "..." --body-file <path>`.
- Read: `gh issue view <number> --json number,title,body,labels,comments`.
- List: `gh issue list --state open --json number,title,body,labels`.
  Add label filters as needed.
- Comment: `gh issue comment <number> --body-file <path>`.
- Label: `gh issue edit <number> --add-label "..."` or
  `--remove-label "..."`.
- Close: post the explanation as a comment, then run
  `gh issue close <number>`.

For multiline bodies and comments, write the exact text to a temporary file
and pass it with `--body-file`.

When a skill says "publish to the issue tracker", create a GitHub issue.
When it says "fetch the relevant ticket", read the issue and its comments.

## Relationships and blocking

Use GitHub native sub-issues and issue dependencies when available.
Check the installed CLI's help for supported relationship commands.

If native relationships are unavailable, put `Part of #<parent>` at the top
of each child issue and link the child in the parent's task list.
Represent blockers with `Blocked by: #<number>, #<number>` at the top
of the blocked issue.

A ticket is startable only when all its blockers are closed.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## Wayfinding

A wayfinding map is one issue labelled `wayfinder:map`. Its body holds
Notes, Decisions-so-far, and Fog. Link child tickets through sub-issues
or the parent task list.

Use `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`,
or `wayfinder:task` to identify child ticket types. Create these labels
when first needed.

Select the first open child in map order with no open blockers and no
assignee. Claim it with `gh issue edit <number> --add-assignee @me`.

To resolve a child, comment with the result, close the issue, and add a
brief result and link to the map's Decisions-so-far.

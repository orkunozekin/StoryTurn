---
name: implement-feature
description: Implement a requested feature or bug fix end to end - code it, raise a PR, get it reviewed by Greptile or Codex, address the review feedback until the reviewer is satisfied, and optionally auto-merge. Use when asked to "implement", "build", "add", or "fix" something and ship it as a PR.
---

# Implement feature

Implement the requested feature or bug fix, raise a PR, get it reviewed, and address
the feedback until the reviewer is satisfied.

## 0. Ask about merging first

Before starting, ask the user (with AskUserQuestion if available) one question:

> Should I merge the PR automatically once the reviewer is satisfied and CI is green?

Options: **Yes, auto-merge** / **No, leave it for me to merge**. Remember the answer for
the rest of the task. Don't ask again later.

## 1. Implement

- Read the relevant code and any project instructions (CLAUDE.md, AGENTS.md, CONTRIBUTING).
- Work on a feature branch, never the default branch.
- Make the change, with tests where the project has them.
- Run the project's own lint, test, and build commands, and fix failures before pushing.

## 2. Raise the PR

- Commit with a clear message and push the branch.
- Open a ready-for-review (non-draft) PR, following the repo's PR template if one exists.
  Describe what changed and how it was verified.

## 3. Get a review

- If Greptile is installed on the repo, wait for its review. It usually posts on its own
  when a PR opens.
- Otherwise, request a Codex review by commenting `@codex review` on the PR.
- Wait for review events rather than polling in a tight loop (subscribe to PR activity
  if the environment supports it).

## 4. Address the feedback

- If an `/address-pr-feedback` skill is available, run it.
- Otherwise, handle each review comment yourself:
  - Verify the claim against the code. Fix what's real, then reply on the thread with
    what changed.
  - If you won't fix it, reply explaining why and leave the decision to the user.
  - Re-run the checks, push, and request a re-review in the same way as step 3
    (Greptile re-reviews new pushes; for Codex, comment `@codex review` again).
- Repeat until the reviewer has no remaining actionable comments and CI is green.

## 5. Finish

- If the user chose auto-merge: merge the PR once CI is green, the reviewer is satisfied,
  and the PR is mergeable. Use the repo's usual merge method.
- Otherwise, tell the user the PR is ready for them to merge.
- Report the PR link, what changed, and any review comments you chose not to address.

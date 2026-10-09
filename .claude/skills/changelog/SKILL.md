---
name: changelog
description: Write the next web/changelog.yaml entry for the user-facing PRs merged since the last one, and open a PR with it. Use before a deploy, or when asked to "write the changelog" or for the "changelog for deploy".
---

# Write the changelog

`make deploy` refuses while a user-facing PR merged since the changelog began is in no entry's `prs`. This skill writes the entry that covers them. The user only reviews the PR.

1. Run `git status --porcelain`. If it prints anything, stop and tell the user to commit or stash first.
2. `git switch main && git pull && git switch -c changelog-<YYYY-MM-DD>` (today's date).
3. Run `make changelog-unreleased`. It prints each uncovered PR as `#<n> <title>` with its files, then each direct commit (pushed without a PR, such as a rebase merge) that changes the app as `direct <sha7> <subject> (… cover it in the next entry)` with its files, then non-blocking `direct …` warnings. A blocking direct commit has no PR number: describe it in the new entry's bullets; the entry covers it because any change to `web/changelog.yaml` made after it does. If it says `Every user-facing PR is in the changelog.`, tell the user and stop without writing anything.
4. Put every uncovered PR number into `prs`, so none is left behind and deploy cannot deadlock. Read each PR's files (and `git show <sha>` if needed) to judge what users notice:
   - Write a bullet only for a change users can notice. A PR judged invisible is still covered, with no bullet.
   - Write 1-6 plain bullets in the app's voice. No PR numbers, file names or jargon. Merge related PRs into one bullet.
5. With at least one bullet, add a new entry at the top of `web/changelog.yaml`:
   - `prs`: every uncovered number.
   - `version`: the next version. Bump the minor if any bullet is a new feature, else the patch.
   - `date`: today, `YYYY-MM-DD`.
   - `title`: a short title.
   - `items`: the bullets.
6. With no bullet (every uncovered PR is invisible), make a covers-only update: append the numbers to the newest entry's `prs`. Change no version, date, title or item, so the What's new sheet stays quiet.
7. Run `make test-web` and `make build`, then `make changelog-unreleased` again. It must say `Every user-facing PR is in the changelog.` A line saying `web/changelog.yaml lists PRs that are not merged since the changelog began` is also a failure: remove those numbers from `prs` (or wait for them to merge) and run it again before you finish.
8. Commit as `Changelog: <version>` (or `Changelog: cover #N` for a covers-only update), with no `Co-Authored-By` trailer. Push the branch, never `main`. Open a PR against `main` that lists the covered PR numbers in its body, and give the user the link.

The Zod schema, `make build` and the deploy gate do the validation. Add no rules of your own here.

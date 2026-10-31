# Contributing to Luz

Everything in this repository is written in English: code, comments, docs, issues, PRs and commits.

## The life of a task

1. **Issue first.** All work starts from an issue, created from a template (Bug, Feature or Task). It states the need and its acceptance criteria, and belongs to a milestone. An issue bigger than one to three days of work is split into issues that can each ship alone.
2. **Board.** The [Luz project](https://github.com/users/banedPowell/projects/4) tracks every issue. Its Status moves on its own (see [Board automation](#board-automation)); set _Priority_ and _Size_ by hand. Above L, split the issue.
3. **Branch.** From an up-to-date `dev`, named `<type>/<issue>-<slug>`: `feat/12-download-queue`, `fix/31-scan-crash`, `chore/4-vite-plus-tooling`. One branch per issue, short-lived. Creating it moves the issue to _In progress_.
4. **Draft PR early,** against `dev`, as soon as the first meaningful commit exists. The body contains `Closes #<issue>`.
5. **Ready for review** once the acceptance criteria are met, the checks pass locally and the diff has been reread on GitHub. The issue moves to _In review_.
6. **Squash merge into `dev`.** The PR title becomes the only commit, so it follows [Conventional Commits](https://www.conventionalcommits.org/). The issue closes and moves to _Done_.
7. **Release.** A PR from `dev` to `main`, merged with a merge commit, ships a new version (see [Releases](#releases)).

## Planning a milestone

Milestones follow [docs/ROADMAP.md](docs/ROADMAP.md), which holds the goal, scope, out-of-scope items and done criteria of each one.

When the current milestone is nearly done:

1. Reread the next milestone's section in the roadmap and the relevant [decisions](docs/decisions/).
2. Update the roadmap first if the plan has changed, in its own PR.
3. Split the milestone into issues, each with acceptance criteria, a Priority and a Size, and attach them to the milestone.
4. The milestone is closed when its done criteria hold and its issues are closed.

A significant architecture choice made along the way gets a new decision record in `docs/decisions/`.

## Labels

Only four labels exist, on purpose:

| Label          | Meaning                                       | Set by                                     |
| -------------- | --------------------------------------------- | ------------------------------------------ |
| `feature`      | New capability or user-facing improvement     | Feature template, `feat:` / `perf:` PRs    |
| `bug`          | Something behaves incorrectly                 | Bug template, `fix:` / `revert:` PRs       |
| `chore`        | Tooling, refactoring, CI, docs, tests         | Task template, other PR types              |
| `dependencies` | Dependency updates                            | Dependabot                                 |

Priority and size are board fields, not labels.

## Titles and commits

| Prefix                                                        | Version bump                    | PR label  |
| ------------------------------------------------------------- | ------------------------------- | --------- |
| `feat:`                                                       | minor                           | `feature` |
| `fix:` / `perf:`                                              | patch                           | `bug` / `feature` |
| `feat!:` or a `BREAKING CHANGE:` footer                       | major (minor before 1.0)        | as type   |
| `refactor:` `style:` `test:` `docs:` `build:` `ci:` `chore:`  | none                            | `chore`   |

The subject starts with a lowercase letter and says what the change brings: `feat(library): group tracks by album artist`. The scope is optional and names the area (`library`, `downloads`, `metadata`, `playlists`, `settings`, `core`, `db`, `ui`, `deps`).

## Releases

1. Open a PR from `dev` to `main`, titled for instance `chore(release): ship the download queue`.
2. Merge it with a merge commit, the only method allowed on `main`.
3. The _Release_ workflow reads the commits since the last tag, creates the `vX.Y.Z` tag and publishes a GitHub release with notes grouped by label. If only `chore`, `docs`, `ci`… commits arrived, nothing is released.

Versions follow [SemVer](https://semver.org/). Until v1.0, the major stays at 0 and breaking changes bump the minor.

Nothing reaches `main` except from `dev`, and nothing is committed to `main` or `dev` directly. An urgent fix follows the same path, without waiting: `fix/…` branch, PR into `dev`, then `dev` into `main`.

## Review

- **Author:** reread your own diff, fill in _How to test_, comment the tricky parts.
- **Reviewer:** correctness and safety first, then design, then readability; formatting is the tools' job. Prefix comments with `blocking:`, `suggestion:`, `question:` or `nit:`.
- All conversations are resolved before merging.

## Automations

| Workflow                   | Trigger                         | Role                                                            |
| -------------------------- | ------------------------------- | --------------------------------------------------------------- |
| `ci.yml`                   | PR, push to `dev` and `main`    | Format, lint, types, tests, build (`Check`)                     |
| `pr.yml`                   | PR                              | Title and branch conventions (`Conventions`), type label        |
| `project.yml`              | Issue, PR and branch events     | Moves issues across the board                                   |
| `release.yml`              | Push to `main`                  | Tag `vX.Y.Z` and GitHub release                                 |
| `dependabot-automerge.yml` | Dependabot PR                   | Auto-merges minor and patch updates once checks pass            |

### Board automation

| Event                                       | Status                         |
| ------------------------------------------- | ------------------------------ |
| Issue opened or reopened                    | _Backlog_, or _Ready_ if it has a milestone |
| Milestone added / removed                   | _Ready_ / back to _Backlog_    |
| Branch `<type>/<issue>-…` created           | _In progress_                  |
| Draft PR opened, or PR converted to draft   | _In progress_                  |
| PR ready for review                         | _In review_                    |
| PR closed without merging                   | back to _Ready_                |
| PR merged                                   | _Done_ for the issues it closes, back to _In progress_ for issues linked by branch name only |
| Issue closed                                | _Done_                         |

The workflow needs the `PROJECT_TOKEN` repository secret: a personal access token with the `project` and `repo` scopes. Without it, the job is skipped with a warning.

## Protected branches

- `dev` (default branch): PR required, `Check` and `Conventions` green, conversations resolved, squash merge only, no force push or deletion.
- `main`: PR from `dev` required, `Check` and `Conventions` green, merge commit only, no force push or deletion.

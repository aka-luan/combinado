# Issue tracker: GitHub

Issues and PRDs for this repository live as GitHub issues. Use the `gh` CLI for tracker operations and infer the repository from the Git remote.

## Conventions

- Create one GitHub issue per approved ticket.
- Read an issue together with its comments and labels.
- Publish blockers using native GitHub issue dependencies when available.
- If native dependencies are unavailable, add a `Blocked by: #…` section to the issue body.
- Apply `ready-for-agent` to tickets that are fully specified and independently implementable.
- Do not close or modify a parent issue while publishing child tickets.

## Pull requests as a triage surface

External pull requests are not a request surface. Issues are the canonical intake mechanism.

## Frontier

The implementation frontier is every open, unassigned ticket whose blocking issues are all closed. Work one frontier ticket at a time.

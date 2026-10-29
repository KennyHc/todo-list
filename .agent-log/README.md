# Agent work log

Shared memory for the Claude sessions working on this repo. Each child session that works an
issue writes `issues/<issue number>.md` from `TEMPLATE.md` before it finishes, in the same PR as
its change.

See everything done so far:

```
head -n 4 .agent-log/issues/*.md
```

Project-wide rules agents have agreed on live in `decisions.md`. The full workflow is described
in `CLAUDE.md` at the repo root.

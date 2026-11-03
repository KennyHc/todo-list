# Decisions

Project-wide decisions agents should follow. One line each, newest at the bottom, with the issue
that made it.

- Agent workflow set up: one master session, one child per `agent:ready` issue, history in
  `.agent-log/`. (setup)
- Week view uses 7 columns from 1024px and a stacked day list below that; issue #8 builds on
  this. (#7)
- Reopening a completed repeating task removes the copy it spawned if that copy is untouched
  (`isUntouchedCopy`); if the copy was edited or worked on, the copy is kept and the reopened
  task becomes a one-off (`repeat: null`). A series has at most one open occurrence. (#40)
- Touch targets: in `(pointer: coarse)` blocks, use `--tap` (44px) for sizes and
  `::after { inset: var(--tap-inset) }` for hit boxes; never fine-pointer rules for this. (#44)
- Phone bottom chrome: clear the docked composer with `--dock-h` (its measured height, safe area included) or `--dock-clear`; no fixed pixel offsets. (#25)
- Undo history: 20 steps (`UNDO_DEPTH`), every content change is a step (toast or quiet), emptied
  by `resetTaskStore` (sign-out, account switch) and trimmed to the toast's entry by a content
  `hydrate`; undo and redo are plain store `set`s so sync diffs them. (#50)

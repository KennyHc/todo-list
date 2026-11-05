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
- Task rows use a roving tabindex: the row is the only Tab stop (`ui.tabStopId`), its controls
  are `tabIndex={-1}` and reached with → then ←/→; new row controls must follow this. (#51)
- Completing a task never completes its parent: completion cascades down to its subtasks only,
  for checks and structural edits alike (`reopenFrom` only ever reopens). Reopening a subtask,
  or adding one, under a done parent reopens that parent and its done ancestors (user-confirmed). (#74)
- Styles use the theme.css scales for font-size (`--fs-*`), weight (`--fw-*`), tracking
  (`--track-*`) and radius (`--r-*`); no raw values except 50%, 0 and 2px bars. Segmented controls
  mark the chosen option with a raised `--thumb`, not the accent. (#81)
- Undo/redo apply only their own action's change (`applyChange`, field-level 3-way merge) on
  top of the live state; edits made since, local or remote, win where they overlap, and remote
  content no longer trims the history (supersedes the trimming in #50's line). (#84)

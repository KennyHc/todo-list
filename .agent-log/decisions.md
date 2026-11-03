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

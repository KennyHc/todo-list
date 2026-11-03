# Decisions

Project-wide decisions agents should follow. One line each, newest at the bottom, with the issue
that made it.

- Agent workflow set up: one master session, one child per `agent:ready` issue, history in
  `.agent-log/`. (setup)
- Week view uses 7 columns from 1024px and a stacked day list below that; issue #8 builds on
  this. (#7)
- Touch targets: in `(pointer: coarse)` blocks, use `--tap` (44px) for sizes and
  `::after { inset: var(--tap-inset) }` for hit boxes; never fine-pointer rules for this. (#44)

# How it is built

Signs a page was built the wrong way even when every setting is valid: workarounds, guessed context, hidden behaviour, copies and dead weight. They make it break quietly and hard to change.

9 rules: P0 0, P1 4, P2 4, P3 1.

## P1

- Use what the platform offers, not scripts, click or key listeners, timers, watchers, fake key presses or CSS that patch or hide what it does; a workaround breaks quietly when the platform changes.
- Keep a value that matters in one saved record every screen reads; not only in page memory, browser storage or two copies that drift.
- Pass ids, the host and the user into the page; never work them out from the web address, the app around it or fixed demo names.
- Show done, failed or slow from the real state the server reports, never from a timer or a fixed schedule, and stop checking when the work ends.

## P2

- Keep the build as simple as the page's job: its flow fits in 3 plain sentences, it holds no part the job does not need, and someone who does not write code can change it in the builder.
- Build for where people really open the page (a chat card, another app, a phone), not only for the builder preview or a design frame.
- Everything a page does shows in the builder: no modals opened hidden on load and closed by script, attributes used as switches, or inputs that silently replace defaults.
- Build a thing once and share it; a header, screen, menu or query copied to 2 places drifts apart.

## P3

- Remove what nothing opens, reads or shows: unreachable pages, conditions that never change, always-hidden blocks, menu rows that do nothing, test leftovers.

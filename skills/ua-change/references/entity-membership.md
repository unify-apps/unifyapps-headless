# Where work belongs

Used by the [ua-change skill](../SKILL.md), the plan skill and setup. One folder works on one solution, on one tenant.

## Facts

- An entity can belong to many solutions, and a solution holds many entities. Adding an entity here never removes it from another solution.
- Work happens in this solution by default.
- A target that is also in another solution may be changed from here. Say so, since the change shows in that solution too. Add it here when the work belongs here (`entity read`). Suggest that solution's folder only when the work is really about that solution.
- A target on another tenant is never read, linked or changed from this session. The work goes to a folder for that tenant.
- An outcome unrelated to this solution: suggest a new solution in its own folder.
- An entity in no solution must join one before it changes: this one when the work is for this solution, else the person picks which.
- **Connected** means the entity uses, or is used by, an entity of this solution, or this change wires it to one. `.nebula/solution-chart.md`, `impact` and `solution find`'s `suggested` list show it.
- Only a **target** (what the change writes) needs a solution. A **reference** that is only read is never linked.
- A failed or partial search never means "not in any solution". Say the real error.

## Commands

| Command | What it gives |
|---|---|
| `solution locate --link "<link or id>" --json` | Where an entity lives: this solution, another solution, no solution, another tenant, not found, or a failed lookup. |
| `solution find --tenant <host> --entity "<link or id>" --json` | The solutions that hold an entity (`direct`), the ones connected to it (`suggested`), and their folders on this machine. |
| `solution resolve "<name>" --tenant <host> --json` | Solutions by name, exact matches first. |
| `entity read <kind> <id> [--app-id <appId>] --source setup\|build --json` | Adds an entity to the open solution. A page needs `--app-id`; a code app is `code-app`. |
| `solution handoff --tenant <host> (--id <id> \| --name "<name>") --entity "<link or id>" --request "<request>" --folder <path> --json` | Makes a folder for the work and returns it as `folder`. |

## A handoff

Work that belongs in another folder is handed over. The desktop app can move this session there; a terminal session cannot:

- Use the solution's folder on this machine when it has one. Otherwise `solution handoff` makes one under `~/nebula/`.
- Tell the person the folder and how to open a session there (`app` in `solution context` says terminal or desktop).
- Give them the line to type there: their request, word for word. Sessions share nothing, so that line carries everything.
- Write nothing on the tenant for that request in this session. Work already running here keeps running.

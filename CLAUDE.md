# Notes for Claude

Ableton Control: a Stream Deck + plugin and an Ableton Live Remote Script that
talk over localhost UDP. Start with `README.md`, then `docs/DEVELOPMENT.md`
(architecture, protocol, Live API notes). If a private `CLAUDE_HANDOFF.md`
exists in this folder, read it first: it has the owner's standing rules and
the current state.

## Working rules

- Change `src/`, `scripts/`, `ableton/` or the files in
  `io.github.tufacker.ableton-control.sdPlugin/` that aren't generated, then
  run `npm run verify` (type-check, TypeScript and Python tests, build).
  Never edit `bin/plugin.js`, the generated profile or anything in `dist/`.
- Never rename an action UUID: the Stream Deck app stores keys by UUID, so a
  rename empties that key on every existing deck. Add new actions instead.
- The Remote Script runs inside Live. Touch the Live API only on Live's main
  thread (`update_display` and listeners), never block, and keep
  `paths.py` free of Live imports so it stays testable.
- Never let a UDP packet choose a file path or run a program. Debug output
  goes only to `~/Library/Logs/Ableton Control/`.
- No personal paths, studio details or device IDs in tracked files. Find
  folders at run time (User Library via `paths.py`).
- Live is the owner's working studio. Don't start or stop Live's transport,
  add or remove tracks or devices, or change a Live Set without asking.
- Installing restarts the Stream Deck app (interrupting the owner's deck) and
  the Remote Script needs Live restarted. Ask first.
- Behaviour counts as done only when it has been seen working with Live and on
  the Stream Deck, not from tests alone.

## Keep the changelog current

Every change a user could notice, or a maintainer needs to know, gets a
`CHANGELOG.md` entry in the same commit, under `## Unreleased` at the top:

- one bullet per change: a short bold phrase, then the effect for the user,
  then the technical detail if it matters later;
- say when existing decks, profiles or Live setups are affected, and how;
- say what was verified (tests, build, in Live, on the Stream Deck) and what
  wasn't;
- never rewrite released sections except to correct them;
- at a release, rename `## Unreleased` to `## <version> — <date>`, matching
  `package.json` and the manifest's `Version` (`x.y.z.0`).

Before finishing any task that changed the plugin, the Remote Script, the
build or the docs, check that the changelog says so.

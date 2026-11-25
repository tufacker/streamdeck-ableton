# Development

How Ableton Control fits together, how to build and test it, and the Live and
Stream Deck behaviour we had to learn the hard way. Start with the README for
what it does.

## How it fits together

```text
Stream Deck +  ──  Stream Deck plugin (Node.js, inside the Stream Deck app)
                     draws keys and strip, handles dials and keys
                     listens on udp://127.0.0.1:10000
                          │   JSON over localhost UDP
                          ▼
                   Remote Script (Python, inside Live)
                     listens on udp://127.0.0.1:10001
                     reads and writes the Live Set on Live's main thread
```

The plugin sends small commands; the Remote Script answers every command (and
sends a heartbeat: once a second while stopped, ten times a second while
playing) with a full state snapshot. The plugin marks Live offline when no
snapshot has arrived for 3 seconds.

### Files

| Path | What it is |
|---|---|
| `src/plugin.ts` | Registers the actions and starts the bridge |
| `src/actions/dials.ts` | The four dial actions (track, vertical, horizontal, volume) |
| `src/actions/toggles.ts` | The eight key actions |
| `src/bridge/udp-client.ts` | UDP socket, `hello`/`ping`, staleness timeout |
| `src/state/store.ts` | Latest Live state, and the locator projected between packets |
| `src/render.ts` | Every key and strip image, as SVG |
| `src/types.ts` | The protocol: commands and state snapshot types |
| `ableton/AbletonStreamDeckPlus/control_surface.py` | The Remote Script |
| `ableton/AbletonStreamDeckPlus/paths.py` | User Library lookup and the debug folder (no Live imports) |
| `scripts/user-library.zsh` | The same User Library lookup for `install.sh`, without Python |
| `io.github.tufacker.ableton-control.sdPlugin/` | Plugin manifest, icons, dial layout; `bin/` and the profile are built |
| `scripts/build-*.mjs` | Icons, bundle, bundled profile, packages |
| `scripts/build-screenshots.ts` | The README images, drawn with `src/render.ts` (`npm run screenshots`) |
| `tests/*.test.ts` | Rendering and state tests (node:test via tsx) |
| `tests/python/` | Remote Script tests with a stub Live framework (unittest) |

### Protocol

Commands go to port 10001:

```json
{ "type": "hello", "protocol": 1 }
{ "type": "command", "command": "select_track", "ticks": 1 }
{ "type": "command", "command": "set_volume", "ticks": -2, "pressed": true }
```

`ticks` is the dial movement (signed); `pressed` means the dial is held
(fine adjustment, or "selected track only" for vertical zoom). The full list
is the `BridgeCommand` type in `src/types.ts` and `_handle_command` in the
Remote Script. Unknown commands get an `{"type": "error"}` reply.

State snapshots go to port 10000; their shape is `LiveState` in
`src/types.ts`.

Two debug commands write JSON snapshots for troubleshooting, always into
`~/Library/Logs/Ableton Control/` (any path in the packet is ignored):

- `{"type": "command", "command": "inspect_tracks", "indices": [1, 2]}` →
  `track-inspect.json`: devices, chains and routing of those tracks
  (1-based);
- `{"type": "command", "command": "inspect_external_browser"}` →
  `external-browser-inspect.json`: what the External Instrument lookup can
  see in Live's browser. Also written automatically when a preset can't be
  found.

Send one with, for example:

```zsh
echo -n '{"type":"command","command":"inspect_tracks","indices":[1]}' | nc -u -w1 127.0.0.1 10001
```

## Build and test

```zsh
npm install
npm run check        # TypeScript, and a syntax check of the Remote Script
npm test             # TypeScript tests, then the Python tests
npm run verify       # check + test + pack
npm run watch        # rebuild and restart the plugin on every change
```

`npm run pack` builds into `dist/`:

- `Ableton-Control.streamDeckPlugin`: the plugin with its profile;
- `Ableton-Control-<version>.zip`: the release bundle (`install.sh`, the
  Remote Script, the plugin package and the docs);
- `Ableton-Control.streamDeckProfile`: a spare copy of the profile.

The bundled profile has a blank device ID so the Stream Deck app asks which
Stream Deck + to use. Set `ABLETON_CONTROL_DEVICE_UUID` to build one for a
particular device.

### Reloading while developing

- **Plugin changes:** `npm run watch` restarts the plugin. Layout, manifest or
  action-name changes need the Stream Deck app quit and reopened.
- **Remote Script changes:** run `./install.sh` (or copy
  `ableton/AbletonStreamDeckPlus` into `<User Library>/Remote Scripts/`),
  then quit and reopen Live. Setting the Control Surface row to None and back
  restarts the script but keeps the Python modules Live already imported, so
  new code only loads with a Live restart (checked with Live 12.4.16).
- Live's log is `~/Library/Preferences/Ableton/Live <version>/Log.txt`; the
  script's lines start with `AbletonStreamDeckPlus`.

### Versioning and releases

Keep these the same: `package.json` and `package-lock.json` (`1.0.0`) and
the manifest's `Version` (`1.0.0.0`). The profile build reads the version
from the manifest.

1. Rename `## Unreleased` in `CHANGELOG.md` to the version and date, and
   update the version numbers.
2. `npm run verify`.
3. Install the build and test it with Live (below).
4. Publish `dist/Ableton-Control-<version>.zip`.

Manual test pass: offline and reconnect; track select and both arm modes;
plug-in window toggle; volume, pan and fine adjust; Session/Arrangement
toggle; vertical and horizontal zoom; Session clip launch, stop and
empty-slot record; fold/unfold; External Instrument browse and add; the four
transport keys; the green and red locator display.

## Rules

- **Never rename an action UUID** (`io.github.tufacker.ableton-control.*`).
  The Stream Deck app stores each key by UUID; a rename empties that key on
  every deck. Add actions instead.
- All Live API access stays on Live's main thread: the Remote Script only
  touches Live from `update_display` and listeners, and drains at most 32
  commands per tick from a non-blocking socket.
- Show only values Live really exposes. Live has no readable zoom level, so
  the zoom tiles are labels, not percentages.
- The UDP sockets bind to 127.0.0.1 only. Don't add commands that take file
  paths or run programs from a packet.

## Live API notes

What we learned while building the Remote Script (Live 12.4). `song` is
`self.song()`, `application` is `self.application()`.

### Tracks

- Regular tracks: `song.tracks`; returns: `song.return_tracks`; the master
  is separate. The track count on the strip uses `song.tracks` only.
- Selected track: `song.view.selected_track`; select by assigning it.
- Track type: MIDI if `track.has_midi_input`, audio if
  `track.has_audio_input`; return or master by list membership.
- Names can arrive with a leading track number in some contexts; the plugin
  strips it, since the strip already shows `TRACK x/y`.
- Colour: `track.color & 0xFFFFFF` (the raw value can have more than 24 bits).
  `track.color_index` is sent too, for diagnosis.
- Meters: `track.output_meter_left` / `output_meter_right`, floats clamped
  to 0…1.

### Mixer

- `track.mixer_device.volume` and `.panning` are parameters with `value`,
  `min`, `max` and `display_value`. The raw volume isn't dB: show
  `display_value` (compacted by the plugin). Clamp writes to min/max.

### Arm, solo, mute, monitor

- Arm only when `track.can_be_armed`. Live's `song.exclusive_arm`
  preference decides whether Single mode disarms the others.
- `track.solo`, `track.mute`; monitoring is
  `track.current_monitoring_state` (0 In, 1 Auto, 2 Off), shown only for
  armable tracks.

### Transport

- `song.is_playing`, `record_mode`, `metronome`, `current_song_time`,
  `tempo`, `signature_numerator`.
- `song.start_playing()`, `song.stop_playing()`; toggle `record_mode` and
  `metronome` by assignment.
- The locator is worked out from `current_song_time` (in quarter notes) and
  the signature: a beat is one denominator note, so a 6/8 bar is three
  quarters. `format_locator` (Python) and `formatLocator` (TypeScript) must
  agree. The plugin projects it forward between packets so it moves smoothly
  without a high packet rate.

### Views and zoom

- Current view: `str(application.view.focused_document_view)` is
  `"Session"` or `"Arranger"`; otherwise check
  `application.view.is_view_visible("Session")`. The name is `"Arranger"`,
  not `"Arrangement"`.
- Switch with `show_view(name)` then `focus_view(name)`.
- Zoom: `application.view.zoom_view(direction, view_name, selected_only)`
  with direction 0 up, 1 down, 2 left, 3 right.

### Session clips

- `scene_index = list(song.scenes).index(song.view.selected_scene)`, slot
  `track.clip_slots[scene_index]`.
- Playing clip: `track.stop_all_clips(False)`; stopped clip: `slot.fire()`;
  empty slot: arm the track (through the arm mode), then `slot.fire()`
  records.

### Fold and unfold

`fold_state` alone does not drive Session View's unfold button. What works,
in order:

1. `track.can_show_chains` → toggle `track.is_showing_chains`;
2. `track.is_foldable` → toggle `track.fold_state`;
3. a grouped track → toggle `track.group_track.fold_state`;
4. `track.view.is_collapsed`, if present.

### Devices and plug-in windows

- `track.devices`, `track.view.selected_device`. Useful properties:
  `name`, `class_name`, `class_display_name`, `type` (1 = instrument),
  `can_have_chains`, `chains`, `is_editor_open`, `plugin_name`,
  `plugin_format`.
- External Instrument: `class_name == "ProxyInstrumentDevice"`; plug-ins:
  `class_name == "PluginDevice"`.
- Plug-in window: toggle `device.is_editor_open` on the selected device, or
  the first device that has it. Live has no Remote Script API for the global
  Show/Hide Plug-In Windows command (Cmd-Option-P); doing that needs macOS
  automation permission, so it isn't implemented.
- Names ending in a run-together roman numeral are spaced for display only
  (`SynthII` → `Synth II`).

### External Instrument presets and Live's browser

- The preset list comes from the file system
  (`<User Library>/Presets/Instruments/External Instrument`, found through
  Live's `Library.cfg`; see `paths.py`), but loading needs a `BrowserItem`:
  Live can't load a file path.
- Search `browser.instruments` first, and its `External Instrument` branch
  before the rest, then `user_library`, `user_folders`, `current_project`
  and `sounds`. Match by name, file name and relative path; cache hits.
- `BrowserItem.iter_children` may be a method; call it if callable. The tree
  is huge: limit depth (16) and items (25,000), and reset the budget per root.
- Live returns a new Python wrapper each time you read a browser item, so
  `id()` only identifies one while it is alive: keep visited wrappers
  referenced, or a reused id makes the search skip an item.
- Add flow: `song.create_midi_track(index)`, select the new track,
  `application.browser.load_item(item)`, then apply the arm mode.

### Routing

- Current properties: `input_routing_type` / `input_routing_channel`,
  `output_routing_type` / `output_routing_channel`; older ones:
  `current_input_routing`, `current_input_sub_routing` and the output pair.
  Show `routing.display_name`.
- For External Instrument tracks, "MIDI To · Main" was misleading, so the
  status line shows `EXT INST · <name>` instead.
- Remote Scripts can probably change a track's routing choices but not the
  audio interface's channel names. Friendly names would need an alias map
  kept by the plugin.

## Stream Deck notes

- The touch strip is four 200×100 areas, one per dial. `onTouchTap` works per
  area; swiping between pages stays with the Stream Deck app.
- Dial events: `onDialDown` for presses, `onDialUp` with the held time for
  dial 3's short/long press (650 ms), `onDialRotate` for turns.
- Encoder `TriggerDescription` allows only `Rotate`, `Push`, `Touch` and
  `LongTouch`; describe hold-and-turn inside `Rotate`.
- The locator is drawn one character per fixed cell so a proportional font
  can't make it wobble. Fonts follow Ableton's web stack (`futura-pt, Avenir,
  -apple-system, …`).
- A profile stores each action's plugin version. A new local build over an
  old profile may keep running the old version until the Stream Deck app is
  restarted.
- The app's bundle is `/Applications/Elgato Stream Deck.app`; its ID is
  `com.elgato.StreamDeck`.

## Publishing on the Stream Deck Marketplace

Not submitted yet. Elgato's Maker Console needs the `.streamDeckPlugin`, a
name and description, a 1920×960 PNG thumbnail, at least three gallery images
(1920×960 PNG) or videos (1920×1080 MP4, 50 MB or less), support, source and
privacy policy links, and release notes. Before submitting:

- run `npx streamdeck validate io.github.tufacker.ableton-control.sdPlugin`;
- check icons against Elgato's rules (plugin icon 256 and 512 px PNG;
  monochrome white action icons on transparent);
- test the profile on a clean Stream Deck setup and Live 11 if claiming it;
- write a short privacy policy: the plugin talks only to Live on the same
  Mac, stores nothing and collects nothing.

## Ideas

- Performance, to measure in Live before changing: the selected track's meter
  listeners rebuild and send the whole state snapshot on every meter change;
  and the first load of each External Instrument preset can search up to
  25,000 browser items per root on Live's main thread. Sending meters with
  the heartbeat, and looking in the External Instrument branches by name
  before the wide search, would both help.

- A device mode for the selected device's parameters; a clip mode; sends.
- A setting to turn auto-arm on track select off.
- A routing page, with friendly names for interface inputs.
- Show the External Instrument preset's position in the list.
- A CI workflow running `npm run verify`.

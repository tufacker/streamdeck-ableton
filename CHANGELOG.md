# Changelog

All notable changes to this project are documented here.

The project started as a focused first build for one Stream Deck + / Ableton Live setup, so early version numbers are intentionally granular. They capture each working iteration that was installed and tested.

## 1.0.0 — 2026-11-25

First public release. Same controls as 0.1.88, under a new plugin ID, with the
Remote Script no longer tied to one Mac, a release bundle and installer, and
fixes from a code review.

- **New plugin ID, `io.github.tufacker.ableton-control`** (was
  `com.codex.ableton-streamdeck-plus`). The Stream Deck app treats it as a new
  plugin: keys on an existing profile that point at the old ID stay blank until
  they are moved to the new one. The action names after the ID are unchanged
  (`.track`, `.volume`, `.arm` …). Author and URL in the manifest are now the
  project's.
- **External Instrument presets come from your User Library**, wherever Live's
  Preferences › Library puts it, instead of a folder fixed to one Mac. The
  Remote Script reads Live's `Library.cfg` (the running version's first) and
  falls back to `~/Music/Ableton/User Library`. `install.sh` installs the
  Remote Script into the same User Library.
- **Debug snapshots go to one folder.** `inspect_tracks` and
  `inspect_external_browser` write only to `~/Library/Logs/Ableton Control/`
  and ignore any file path in the command (they used to write wherever a
  packet said).
- **Profile:** the bundled profile is now called **Ableton Control**, has new
  fixed IDs and no device ID built in, so the Stream Deck app asks which
  Stream Deck + to use.
- **Release bundle:** `npm run pack` builds into `dist/`, including
  `Ableton-Control-<version>.zip` with the installer, Remote Script and plugin.
- **Tests:** 18 Python tests for the Remote Script (User Library lookup,
  presets, debug folder, commands, locator, browser search) run with `npm test`, using a stub of Live's
  framework. Verified: type-check, all tests, build. Not yet verified in Live or
  on the Stream Deck.
- **Locator in x/8 and other signatures:** the green and red position display
  now counts bars and beats the way Live does (a 6/8 bar is six eighths, three
  quarter notes). It used to treat every signature as quarter-note beats, so
  6/8 showed the wrong bar. The Remote Script now also sends
  `signatureDenominator`.
- **Dial 1 from a return or master track** goes to the first track (or the last,
  turning left) instead of skipping track 1.
- **External Instrument lookup no longer skips presets by mistake.** The browser
  search remembered visited items by Python `id()`, and Live's short-lived
  browser wrappers could reuse an id, so a preset could be passed over. The
  search now keeps each visited wrapper alive. (Reproduced in a test.)
- **The plugin retries its UDP port.** If port 10000 is taken when the plugin
  starts (another copy still running), it tries again every 3 seconds instead
  of waiting for Live until the Stream Deck app restarts.
- **`install.sh` needs no Python.** Its User Library lookup is plain zsh
  (`scripts/user-library.zsh`), with a test that it agrees with the Remote
  Script's lookup.
- **README images** of the deck stopped and playing, drawn by the plugin's
  own rendering code (`npm run screenshots`).
- **Docs:** README rewritten for users; the development, Live API and
  Marketplace notes merged into `docs/DEVELOPMENT.md`. Corrected the old note
  that switching the Control Surface row off and on reloads Remote Script code:
  it doesn't; Live has to be restarted.
- **Verified on the Stream Deck + (2026-11-25):** the new plugin installs from
  the package, and the owner's profile, migrated to the new ID, shows live
  state from Live 12.4.16. Track select, the preset browser, Click and the
  unknown-command reply work over the bridge. After a Live restart the new
  Remote Script loaded: it found the External Instrument folder through
  Live's Library settings (32 presets), sends `signatureDenominator`, and
  `inspect_tracks` wrote only to `~/Library/Logs/Ableton Control/` while
  ignoring the path in the packet. The owner then used the deck with the new
  build and confirmed everything works.

## 0.1.88 — Touch strip Volume/Pan toggle

- Added touch-tap handling to the Volume/Pan strip segment above knob 4.
- Tapping the Volume/Pan strip segment now toggles between Volume and Pan, matching the knob press behavior.
- This is the first intentional touch-strip interaction test; native Stream Deck page swiping remains handled by the Stream Deck app.

## 0.1.87 — Title-case secondary dial labels

- Changed non-track bottom dial action labels from all-caps to title case.
- `TIME/VIEW` is now `Time/View`.
- `SCROLL/CLIP` is now `Scroll/Clip`.
- `HEIGHT/FOLD` is now `Height/Fold`.
- Left the Knob 1 track section unchanged.

## 0.1.86 — External Instrument display-name cleanup

- Display-only cleanup for External Instrument names ending in compact roman numerals.
- A name such as `SynthII` now displays as `Synth II` in the External Instrument browser value and selected-track `EXT INST` status label.
- Preset lookup and loading still use the original filenames/device names.

## 0.1.85 — Meter vertical alignment

- Nudged the tiny stereo strip meters down 2px to better align with the enlarged track-name headline.
- Left the status line and lower knob row unchanged.

## 0.1.84 — Larger track-name headline

- Increased the main strip track-name size from 34px to 37px.
- Added a wider, heavier fallback font stack for the track-name line only, leaving the rest of the strip typography unchanged.
- Slightly increased the track-name character allowance now that the meters/name block is farther left.

## 0.1.83 — Left-align strip meters and track name

- Moved the selected-track stereo meter pair almost flush-left with a small 4px pad.
- Pulled the track name left to start shortly after the meters, reclaiming horizontal space.

## 0.1.82 — Selected track stereo meters

- Added selected-track `output_meter_left` and `output_meter_right` values to the Ableton state snapshot.
- Listens for selected-track output meter changes when Live exposes those listeners.
- Added a tiny stereo vertical meter pair just left of the track name in the Stream Deck + strip.
- Shifted the track name slightly right to make room while preserving the existing strip layout.

## 0.1.81 — Compact long MIDI status routes

- Compacted verbose MIDI route names in the top strip status line, including parenthetical device aliases and `Output` / `Input` wording.
- Added a hard ellipsis cap to the top status line so a single long route cannot crowd the entire display.
- Added a regression test using a long controller MIDI route.

## 0.1.80 — Knob 3 label wording

- Changed the Session View knob 3 label from `ADD EXT INST` to `VIEW / ADD (HOLD)` to better explain the short-press/long-press split.
- Kept the selected External Instrument preset name on the value line.

## 0.1.79 — Knob 3 view/add gesture swap

- In Session View, knob 3 short press now toggles Session/Arrangement view.
- In Session View, knob 3 long press now creates a new MIDI track and loads the selected External Instrument preset.
- Knob 3 rotation still browses the configured External Instrument preset list.
- Replaced the Session View `xx/xx EXT` counter with `ADD EXT INST`, keeping the selected preset name on the value line.

## 0.1.78 — Knob 2 empty clip recording

- In Session View, knob 2 press now explicitly arms/prepares the selected track before firing an empty selected clip slot.
- Existing clips still play when stopped and stop the selected track when already playing.
- Empty slots now log `clip record` separately from existing clip launch to make Live-side debugging clearer.

## 0.1.77 — Track color diagnostics

- Added `rawColor` and `colorIndex` to Live track snapshots and track inspection output.
- Added a `color_index` listener so Stream Deck refreshes if Live updates the selected track’s palette index separately from its RGB color value.
- This is diagnostic groundwork for newly-created External Instrument tracks whose visible Live color may disagree with the RGB value exposed by `track.color`.

## 0.1.76 — Prioritized External Instrument branch search

- Prioritized the `External Instrument` folder inside Live’s `Instruments` Browser root before walking the rest of the very large Instruments tree.
- Prioritized exact preset filename matches during Browser traversal.
- This avoids spending the Browser search safety budget inside unrelated built-in instrument categories before reaching the user External Instrument presets.

## 0.1.75 — External Instrument root priority

- Prioritized Live’s `Instruments` Browser root before the much larger User Library root when resolving External Instrument presets.
- Reset the Browser search safety budget per root so a large User Library cannot prevent lookup in later roots.
- This specifically fixes cases where Live exposes the presets as `Instruments > External Instrument > Preset.adv` even though the preset files live in the User Library.

## 0.1.74 — External Instrument load diagnostics

- Fixed Live Browser traversal for roots that expose children through an `iter_children()` method, which can hide preset items from the loader.
- Added a targeted External Instrument Browser diagnostic dump at `/tmp/ableton-streamdeck-external-browser-inspect.json` when a selected preset still cannot be resolved.
- Deferred auto-arm handling after selected-track and track-list notifications so Live does not reject arm changes with “changes cannot be triggered by notifications.”
- Kept the Session View gesture split: knob 3 short press loads the selected External Instrument preset; knob 3 long press toggles Session/Arrangement view.

## 0.1.73 — Browser item lookup fix

- Expanded External Instrument preset loading lookup across Live Browser roots including User Library, Places/user folders, Current Project, Instruments, and Sounds.
- Handles Browser roots that are vectors/lists as well as single BrowserItem roots.
- Matches both preset names without extensions and Live Browser names with `.adv` / `.adg` extensions.
- Restored view switching while browsing instruments: in Session View, a quick knob 3 press loads the selected preset, while a press-and-hold toggles Session/Arrangement.

## 0.1.72 — External Instrument browser prototype

- Added a configured External Instrument preset folder:
  `~/Music/Ableton/User Library/Presets/Instruments/External Instrument`.
- Session View knob 3 now browses `.adv` / `.adg` presets from that folder instead of duplicating track X-axis scrolling.
- Session View knob 3 push creates a new MIDI track after the selected track and attempts to load the selected External Instrument preset via Live’s Browser API.
- The strip shows the selected External Instrument preset index/count and name.
- Arrangement View knob 3 keeps the existing time/view behavior.

## 0.1.71 — Audio route spacing

- Changed compact audio route separators from slash to space.
- Audio routes now display as `EXT 1/2` instead of `EXT/1/2`.
- MIDI route compaction keeps slash separators, such as `ALL/ALL` and `Synth/CH1`.

## 0.1.70 — Compact route labels

- Shortened MIDI routing labels from `MIDI From` / `MIDI To` to `MIDI In` / `MIDI Out`.
- Compacts common MIDI route text, such as `All Ins · All Channels` to `ALL/ALL` and `Ch. 1` to `CH1`.
- Added compact audio output routing as `Audio Out`.
- Shortened audio routing labels to `Audio In` / `Audio Out`, with common values such as `Ext. In` and `Master` compacted.

## 0.1.69 — X/Y knob layout

- Rearranged the Stream Deck + dial layout so the Session X/Y controls sit beside each other.
- Knob 1 remains selected track / Session X-axis control.
- Knob 2 is now the vertical track / Session row control.
- Knob 3 remains the Session/Arrangement view and horizontal zoom control.
- Knob 4 is now Volume/Pan.
- Updated the generated Stream Deck profile so new installs use the same physical layout.

## 0.1.68 — View-aware vertical knob press

- Reversed knob 4 rotation direction.
- Replaced knob 4 press with a view-aware `vertical_knob_press` command.
- In Session View, knob 4 press fires the selected clip slot, or stops the selected track clips if that selected clip is already playing.
- Empty Session slots now fire as well, allowing Live to record into the selected slot when the track is armed/ready.
- In Arrangement View, knob 4 press keeps the track fold/height behavior.
- Updated the Session View knob 4 label to `Track / SCROLL/CLIP`.

## 0.1.67 — View-aware zoom knobs

- Added Live `viewMode` feedback using Live’s focused document view, reporting `session` or `arranger`.
- Knob 3 now labels itself as `Session / GRID/VIEW` or `Arrange / TIME/VIEW` depending on the current Live view.
- Knob 4 now labels itself as `Track / FOLD/ZOOM` in Session View and `Tracks / HEIGHT/FOLD` in Arrangement View.
- Zoom commands now target the current Live view instead of always forcing Arrangement View.

## 0.1.66 — MIDI From display

- Added MIDI input routing to the Live track snapshot as `midiFromLabel`.
- MIDI tracks now show `MIDI From · Source · Channel` in the top status line when Live exposes it.
- MIDI tracks can show both `MIDI From` and `MIDI To`/`Output` details together.

## 0.1.65 — Blank empty status info

- Removed the `SINGLE` / `MULTI` arm-mode fallback from the top info area for selected tracks.
- MIDI tracks with no useful device/routing detail now leave the top info area blank instead of showing arm mode text.
- Added fallback reads from Live’s legacy `current_output_routing` / `current_output_sub_routing` fields so plain MIDI tracks can show their visible MIDI To port/channel when the newer routing fields are empty.
- Added matching audio input fallback reads from `current_input_routing` / `current_input_sub_routing`.
- Added routing diagnostics to the track inspector so MIDI tracks that behave differently can be compared directly.
- Added a regression test to keep arm mode labels out of the track info status line.

## 0.1.64 — External Instrument output wording

- Replaced the top-status vertical bar separator with the same dot separator used elsewhere.
- For External Instrument tracks, labels the exposed `Main` routing as `Output` instead of `MIDI To`.
- Regular MIDI tracks still show `MIDI To` when Live exposes a MIDI destination/channel.

## 0.1.63 — Larger routing status text

- Increased the right-aligned top-strip device/routing status text from 13px to 15px.
- Let longer status text take more horizontal space by shortening the displayed track name sooner.
- Adjusted the status baseline slightly lower to better fill the top band.

## 0.1.62 — Larger top-strip typography

- Increased the selected track name size in the top strip status area.
- Increased the right-aligned device/routing status text size while keeping it compact enough for longer routing labels.
- Nudged the top-line vertical positioning to use the available space more comfortably.

## 0.1.61 — Full right-aligned status text

- Removed the remaining hard truncation from the top status line.
- Kept the status text right-aligned and reduced its font size slightly to fit longer routing/device combinations.
- Shortens the displayed track name only when needed so the routing information remains visible.

## 0.1.60 — Plain status spacing

- Removed the status pill boxes from the top strip.
- Restored the cleaner plain-text status style.
- Kept the improved `Input` wording and added a simple text divider between plugin/instrument and routing details.

## 0.1.59 — Status pill spacing

- Reworked the top strip status info into subtle right-aligned pills so plugin/instrument and routing details do not mush together.
- Added small accent dividers between status chunks.
- Shortened audio routing wording from `Audio From` to `Input`.

## 0.1.58 — Explicit routing labels

- Made top-strip routing text more readable and self-explanatory.
- MIDI tracks now show routing as `MIDI To · Destination · Channel` when Live exposes both fields.
- Audio tracks now show routing as `Audio From · Source · Channel`.

## 0.1.57 — Routing info moved to status line

- Moved MIDI To and Audio From routing details out of the lower Track knob tile.
- The lower Track tile now stays focused on track position/type, such as `2/8 AUDIO` or `5/8 MIDI`.
- The top status line now uses the extra room for combined device/routing info, such as `PLUGIN · Wavetable 1  Audio From · Ext. In · 1/2` or `EXT INST · Synth A  MIDI To · Synth A · Ch. 1`.

## 0.1.56 — Track routing labels

- Added MIDI track output routing to the Live state snapshot using `output_routing_type` and `output_routing_channel`.
- Shows a compact MIDI destination suffix in the Track tile when Live exposes a MIDI output route.
- Added audio track input routing to the Live state snapshot using `input_routing_type` and `input_routing_channel`.
- Shows a compact Audio From suffix in the Track tile while keeping the first plugin/instrument label in the top strip status line.
- This is an experiment to verify whether Live’s track-level `MIDI To` matches the routing information we want on the Stream Deck + strip.

## 0.1.55 — Loaded instrument/plugin label

- Added a selected-track device summary to the Live state snapshot.
- Displays plugin tracks as `PLUGIN · Device Name`.
- Displays External Instrument tracks as `EXT INST · Device Name`.
- Shows the device summary in the top strip status area so a track named generically, such as `Strings`, can still reveal the loaded instrument/plugin.

## 0.1.54 — Device parameter inspection

- Extended the Ableton-side track device inspector to include device parameters and display values.
- This helps determine whether Live exposes External Instrument MIDI/audio routing settings through the Remote Script API.

## 0.1.53 — Track device inspector

- Added an Ableton-side diagnostic command to inspect devices on specific Live tracks.
- The inspector writes top-level device names/classes, selected device name, editor support, plugin metadata when Live exposes it, and nested rack chain devices when available.
- This is a diagnostic foundation for deciding how to display plugin/external instrument information on the Stream Deck + strip.

## 0.1.52 — Strip label cleanup and track type

- Removed the thin horizontal divider between the top status line and bottom knob sections.
- Renamed the third strip tile to `SESSION / TOGGLE/ZOOM`.
- Added a track type label to the first strip tile next to the track position, such as `2/8 AUDIO`, `2/8 MIDI`, `RETURN`, or `MASTER`.
- Extended the Ableton Remote Script state snapshot with `typeLabel`.

## 0.1.51 — Split strip refinements

- Removed the full-width top color bar from the idle split strip to free vertical space.
- Increased the top status track-name font.
- Replaced full-height bottom section dividers with shorter dividers and short per-section track-color accent bars.
- Renamed the third strip tile to `VIEW / TOG/ZOOM` for view toggle plus session zoom.
- Renamed the fourth strip tile to `TRACK / FOLD/ZOOM` for track fold plus track zoom.
- Added a Pan meter with value on the left and a center-line/dot indicator on the right.

## 0.1.50 — Split strip status layout

- Reworked the normal idle Stream Deck + strip into a shared horizontal layout.
- Added a top status line spanning the whole strip with selected track name and ARM mode/state.
- Changed the bottom half into four compact knob tiles.
- Preserved a compact Volume tile meter with the value on the left and a shortened bar on the right.
- Left play, record, and offline full-strip takeover states unchanged.

## 0.1.49 — Larger track name on strip

- Increased the selected-track name size on the first Stream Deck + strip tile.
- Kept the `TRACK X/X` label small so the track name becomes the visual focus.
- Left Volume, Pan, Zoom, and other strip tiles unchanged.

## 0.1.48 — ARM top bar follows selected track

- Changed the ARM key top color bar to always follow the selected Ableton track color, including in Multi mode.
- Preserved ARM background colors for OFF, SOFT, and LATCH states.

## 0.1.47 — Index-aware track name cleanup

- Made track-name cleanup aware of the selected track index.
- Removes exact current-track prefixes such as `2 Bass`, `02 Bass`, `2 - Bass`, and `02. Bass`.
- Preserves musical numeric names such as `808 Bass` when they do not match the selected track index.

## 0.1.46 — Clean displayed track names

- Removed unstable track-number prefixes from the large selected-track name on the Stream Deck + strip.
- Kept the existing `TRACK X/X` label above the name for track position.
- Preserved numeric musical names such as `808 Bass`.

## 0.1.45 — Restore ARM soft/latch color distinction

- Restored the ARM key color distinction in Multi mode.
- SOFT now uses a darker red midpoint while LATCH remains the bright REC active red.
- ARM off still uses the muted REC inactive red.

## 0.1.44 — Softer strip color intensity

- Reduced the normal Stream Deck + strip background color blend after confirming the full Stream Deck app restart made visual changes appear correctly.
- Kept the selected track color visible, but made the background less intense than 0.1.40–0.1.43.

## 0.1.43 — Click top-row color behavior

- Changed the Click key to behave visually like the top-row buttons.
- Click now keeps the selected track color in its top bar whether the metronome is on or off.
- Click keeps its own active blue background and inactive dark background.
- PLAY, STOP, and REC continue using their own transport top-bar colors.

## 0.1.42 — ARM/transport color correction

- Changed ARM soft-arm state to use the same bright red as REC active, so Multi mode visibly matches the REC color family while keeping the SOFT/LATCH text labels.
- Restored PLAY, STOP, and REC top color bars to their own transport colors in both active and inactive states.
- Kept Click inactive top bar tied to the selected track color and Click active top bar blue.

## 0.1.41 — ARM red state match

- Changed the ARM key off state to use the same muted red as the REC key inactive state.
- Changed the ARM key on/latched state to use the same bright red as the REC key active state.
- Kept soft-arm as a darker red midpoint so Multi mode still distinguishes soft-selected arm from latched arm.

## 0.1.40 — Stronger visible strip background color

- Increased the selected-track color blend on the normal Stream Deck + strip background again after hardware testing showed the previous tint still read as nearly black.
- Kept the color muted compared with the selected track accent, but made track-to-track background changes clearly visible.

## 0.1.39 — More visible muted strip tint

- Increased the selected-track color blend on the normal Stream Deck + display strip background.
- Kept the strip background in the same dark family as inactive buttons, but made the selected track hue visible on hardware.

## 0.1.38 — Muted track-colored strip background

- Changed the normal Stream Deck + display strip tiles to use the selected Ableton track color as a very dark, muted background.
- Kept playing, recording, and offline full-screen strip states unchanged.
- Preserved the brighter left accent bar and readout styling for contrast.

## 0.1.37 — Click inactive background match

- Changed the Click/metronome off-state background to exactly match the top-row inactive button background.
- Kept the Click top color bar tied to the selected track color while inactive.
- Kept the active Click state blue.

## 0.1.36 — Arm mode naming and color polish

- Renamed the user-facing Auto Arm mode label to `SINGLE`.
- Kept Multi Arm labeled `MULTI`.
- Changed the ARM MODE key’s top color bar to use the selected track color, matching the rest of the top row.
- Changed inactive transport key top bars to use the selected track color; this confirms Click off uses the selected track color while keeping a black off background.

## 0.1.35 — Selectable arm modes

- Added an ARM MODE key in the top-right slot of the main profile.
- Moved Monitor off the main profile for now; the action remains available for a future second page.
- Added Auto Arm mode for the original “selected track arms automatically” behavior.
- Added Multi Arm mode:
  - selected track becomes soft-armed;
  - ARM key latches/unlatches the selected track;
  - latched tracks stay armed while scrolling to other tracks.
- Added ARM key feedback states:
  - amber `SOFT` for selection-based soft arm;
  - red `LATCH` for explicitly latched arm;
  - normal off state when unarmed.

## 0.1.34 — Click key off-state polish

- Changed the Click/metronome key’s off background to black so it visually matches the non-transport buttons when inactive.
- Kept the active Click state blue for clear metronome feedback.

## 0.1.33 — Session View unfold fix

- Changed V-Zoom knob press to target the Session View track unfold/chains state first.
- Uses Live’s `can_show_chains` / `is_showing_chains` properties when available.
- Falls back to group-track `fold_state`, then `track.view.is_collapsed`.
- Verified this matches the intended Session View unfold button behavior.

## 0.1.32 — Session collapse attempt

- Changed V-Zoom knob press from plain `fold_state` to `is_collapsed` first, with `fold_state` fallback.
- This was an intermediate attempt and was superseded by 0.1.33 after testing showed the Session View unfold button maps to chain display state instead.

## 0.1.31 — V-Zoom press gets fold/unfold

- Kept Track knob press assigned to VST/device editor open-close.
- Moved track fold/unfold behavior to V-Zoom knob press.
- Preserved V-Zoom rotation for all-track vertical zoom.
- Preserved V-Zoom hold+turn for selected-track vertical zoom.

## 0.1.30 — VST/device editor toggle

- Changed Track knob press to open/close the selected device or VST editor.
- Used the same Live API methodology as an earlier custom Remote Script: `Device.is_editor_open`.
- Added fallback to the first editor-capable device on the selected track if Live does not report a selected device.
- Removed the non-working Track knob fold binding.

## 0.1.29 — Volume/Pan mode and view toggle

- Added Knob 2 press to toggle between Volume and Pan mode.
- Added pan readout and pan control on the Stream Deck + display.
- Added Knob 3 press to toggle Arrangement View / Session View.
- Added initial track fold command handler.

## 0.1.28 — Polished transport display

- Removed “Playing” and “Recording” labels from the full-width time display.
- Vertically centered the musical locator.
- Kept the green/red background as the playback/recording state indicator.
- Created durable project copy and handoff documentation.

## 0.1.27 — Timecode typography refinement

- Adjusted locator/timecode font weight for visibility.
- Preserved fixed-width character positioning so the time display does not wobble.

## 0.1.26 — Ableton-style offline display

- Changed the offline display to a full-width “Waiting for Ableton Live” state.
- Styled it with a black background and dim amber/orange text.
- Tuned typography toward Ableton’s web headline style.
- Blank/offline key states remain black.

## 0.1.25 — Smooth transport time display

- Added local locator projection in the Stream Deck plugin.
- Ableton sends authoritative playhead, tempo, and time signature state.
- Stream Deck redraws the locator between Live packets for a smoother visual clock.

## 0.1.24 — Full-screen play/record display

- Added full-width touch-strip transport state while Live is playing or recording.
- Playing turns the strip green with centered musical locator.
- Recording turns the strip red with centered musical locator.
- Returns to the normal four-tile display when idle.

## 0.1.23 — Transport controls

- Added bottom-row transport keys:
  - Play
  - Stop
  - Arrangement Record
  - Click/metronome
- Added state-aware button styling, including dim/bright transport colors.

## 0.1.22 — Display and button polish

- Improved Stream Deck key graphics.
- Limited volume readout precision so values are readable at a glance.
- Added brighter active-state styling for transport controls.

## 0.1.21 — Ableton offline state

- Added a clear offline state when Ableton is not connected.
- Blank key graphics while offline.
- Touch strip shows that Live is not connected.

## 0.1.20 — Auto-arm on track selection

- Selecting tracks with Knob 1 now auto-arms the selected track when possible.
- Honors Live’s exclusive-arm behavior where applicable.

## 0.1.0 — First working version

- Built the initial Stream Deck + plugin.
- Built the initial Ableton Live Remote Script.
- Added localhost UDP bridge:
  - Stream Deck listens on `127.0.0.1:10000`.
  - Ableton listens on `127.0.0.1:10001`.
- Added selected track display with Live track color.
- Added selected track volume control.
- Added Arrangement horizontal and vertical zoom encoders.
- Added Arm, Solo, Mute, and Monitor keys with state feedback.
- Added bundled Stream Deck + profile.

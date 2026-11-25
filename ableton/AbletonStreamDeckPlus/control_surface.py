"""Ableton Live Remote Script for the Stream Deck + plugin.

All Live API access happens from update_display, which Live invokes on its main
thread. The UDP socket is non-blocking and only accepts local traffic.
"""

import json
import os
import re
import socket
import time

try:
    from ableton.v2.control_surface import ControlSurface
except ImportError:  # Live 11 compatibility
    from _Framework.ControlSurface import ControlSurface

from . import paths


HOST = "127.0.0.1"
LIVE_PORT = 10001
PROTOCOL_VERSION = 1
MAX_COMMANDS_PER_TICK = 32
IDLE_STATE_INTERVAL_SECONDS = 1.0
PLAYING_STATE_INTERVAL_SECONDS = 0.1
EXTERNAL_INSTRUMENT_EXTENSIONS = (".adv", ".adg")
MAX_BROWSER_SEARCH_DEPTH = 16
MAX_BROWSER_SEARCH_ITEMS = 25000


def format_locator(song_time, numerator=4, denominator=4):
    """Live's bar.beat.sixteenth position. Song time counts quarter notes; a beat
    is one denominator note (an eighth in 6/8)."""
    numerator = max(1, int(numerator or 4))
    denominator = max(1, int(denominator or 4))
    beat_length = 4.0 / denominator
    clamped = max(0.0, float(song_time))
    bar_length = numerator * beat_length
    bar = int(clamped // bar_length) + 1
    in_bar = clamped - (bar - 1) * bar_length
    beat = min(numerator, int(in_bar // beat_length) + 1)
    sixteenths = max(1, int(round(16.0 / denominator)))
    in_beat = in_bar - (beat - 1) * beat_length
    sixteenth = int(in_beat / beat_length * sixteenths) + 1
    return "%d.%d.%d" % (bar, beat, max(1, min(sixteenths, sixteenth)))


class AbletonStreamDeckPlus(ControlSurface):
    def __init__(self, c_instance):
        super(AbletonStreamDeckPlus, self).__init__(c_instance)
        self._c_instance_ref = c_instance
        self._udp_socket = None
        self._client_address = None
        self._global_listeners = []
        self._track_listeners = []
        self._last_state_json = None
        self._last_send_time = 0.0
        self._selected_track = None
        self._arm_mode = "auto"
        self._soft_armed_track = None
        self._latched_arm_tracks = []
        self._external_instrument_index = 0
        self._external_instrument_presets = None
        self._external_instrument_dir = None
        self._external_instrument_browser_cache = {}
        self._open_socket()
        self.schedule_message(1, self._finish_setup)

    def _open_socket(self):
        udp_socket = None
        try:
            udp_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            udp_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            udp_socket.bind((HOST, LIVE_PORT))
            udp_socket.setblocking(False)
            self._udp_socket = udp_socket
            self._log("AbletonStreamDeckPlus listening on udp://%s:%d" % (HOST, LIVE_PORT))
        except Exception as error:
            if udp_socket:
                try:
                    udp_socket.close()
                except Exception:
                    pass
            self._udp_socket = None
            self._log("AbletonStreamDeckPlus could not open UDP port: %s" % error)

    def _log(self, message):
        logger = getattr(self, "log_message", None)
        if callable(logger):
            logger(message)
            return
        c_instance_logger = getattr(self._c_instance_ref, "log_message", None)
        if callable(c_instance_logger):
            c_instance_logger(message)
            return
        try:
            self.show_message(message)
        except Exception:
            pass

    def _song(self):
        song = getattr(self, "song")
        return song() if callable(song) else song

    def _application(self):
        application = getattr(self, "application")
        return application() if callable(application) else application

    def _finish_setup(self):
        song = self._song()
        self._add_listener(song.view, "selected_track", self._on_selected_track_changed, self._global_listeners)
        self._add_listener(song, "tracks", self._on_track_list_changed, self._global_listeners)
        self._add_listener(song, "return_tracks", self._on_track_list_changed, self._global_listeners)
        self._add_listener(song, "is_playing", self._on_state_changed, self._global_listeners)
        self._add_listener(song, "record_mode", self._on_state_changed, self._global_listeners)
        self._add_listener(song, "metronome", self._on_state_changed, self._global_listeners)
        self._add_listener(song, "tempo", self._on_state_changed, self._global_listeners)
        self._add_listener(song, "signature_numerator", self._on_state_changed, self._global_listeners)
        self._add_listener(song, "signature_denominator", self._on_state_changed, self._global_listeners)
        self._bind_selected_track()

    def update_display(self):
        super(AbletonStreamDeckPlus, self).update_display()
        self._read_commands()
        now = time.monotonic()
        song = self._song()
        interval = PLAYING_STATE_INTERVAL_SECONDS if bool(getattr(song, "is_playing", False)) else IDLE_STATE_INTERVAL_SECONDS
        if self._client_address and now - self._last_send_time >= interval:
            self._send_state(force=True)

    def disconnect(self):
        self._remove_listeners(self._track_listeners)
        self._remove_listeners(self._global_listeners)
        if self._udp_socket:
            try:
                self._udp_socket.close()
            except Exception:
                pass
            self._udp_socket = None
        super(AbletonStreamDeckPlus, self).disconnect()

    def _read_commands(self):
        if not self._udp_socket:
            return
        for _ in range(MAX_COMMANDS_PER_TICK):
            try:
                payload, address = self._udp_socket.recvfrom(65535)
            except (BlockingIOError, socket.error) as error:
                if isinstance(error, BlockingIOError) or getattr(error, "errno", None) in (11, 35, 10035):
                    break
                self._log("AbletonStreamDeckPlus receive error: %s" % error)
                break
            self._client_address = address
            try:
                command = json.loads(payload.decode("utf-8"))
                self._handle_command(command)
            except Exception as error:
                self._send_json({"type": "error", "message": str(error)})

    def _handle_command(self, packet):
        packet_type = packet.get("type")
        if packet_type in ("hello", "ping"):
            self._send_state(force=True)
            return
        if packet_type != "command":
            raise ValueError("Unknown packet type")

        command = packet.get("command")
        ticks = int(packet.get("ticks", 0))
        pressed = bool(packet.get("pressed", False))

        if command == "select_track":
            self._select_track(ticks)
        elif command == "set_volume":
            self._change_volume(ticks, pressed)
        elif command == "set_pan":
            self._change_pan(ticks, pressed)
        elif command == "reset_volume":
            self._reset_volume()
        elif command == "toggle_selected_device_editor":
            self._toggle_selected_device_editor()
        elif command == "toggle_selected_track_fold":
            self._toggle_selected_track_fold()
        elif command == "vertical_knob_press":
            self._vertical_knob_press()
        elif command == "toggle_session_arrangement_view":
            self._toggle_session_arrangement_view()
        elif command == "browse_external_instrument":
            self._browse_external_instrument(ticks)
        elif command == "load_external_instrument":
            self._load_external_instrument()
        elif command == "zoom_horizontal":
            self._zoom(ticks, horizontal=True, selected_only=False)
        elif command == "zoom_vertical":
            self._zoom(ticks, horizontal=False, selected_only=pressed)
        elif command == "toggle_arm":
            self._toggle_arm()
        elif command == "toggle_arm_mode":
            self._toggle_arm_mode()
        elif command == "toggle_solo":
            self._toggle_property("solo")
        elif command == "toggle_mute":
            self._toggle_property("mute")
        elif command == "cycle_monitor":
            self._cycle_monitor()
        elif command == "play":
            self._play()
        elif command == "stop":
            self._stop()
        elif command == "toggle_record":
            self._toggle_song_boolean("record_mode")
        elif command == "toggle_click":
            self._toggle_song_boolean("metronome")
        elif command == "inspect_tracks":
            self._inspect_tracks(packet)
        elif command == "inspect_external_browser":
            self._inspect_external_browser(packet)
        else:
            raise ValueError("Unknown command: %s" % command)
        self._send_state(force=True)

    def _select_track(self, ticks):
        tracks = list(self._song().tracks)
        if not tracks or ticks == 0:
            return
        selected = self._song().view.selected_track
        try:
            current_index = tracks.index(selected)
        except ValueError:
            # A return or master track is selected: go to the first or last track.
            current_index = None
        if current_index is None:
            new_index = 0 if ticks > 0 else len(tracks) - 1
        else:
            new_index = max(0, min(len(tracks) - 1, current_index + ticks))
        new_track = tracks[new_index]
        self._song().view.selected_track = new_track
        self._handle_selected_track_arm(new_track)

    def _toggle_arm_mode(self):
        if self._arm_mode == "auto":
            self._arm_mode = "multi"
            self._latched_arm_tracks = []
            self._soft_armed_track = None
            self._handle_selected_track_arm(self._song().view.selected_track)
        else:
            self._arm_mode = "auto"
            self._latched_arm_tracks = []
            self._soft_armed_track = None
            self._auto_arm_track(self._song().view.selected_track)
        self._log("AbletonStreamDeckPlus arm mode: %s" % self._arm_mode)

    def _toggle_arm(self):
        track = self._song().view.selected_track
        if not self._can_arm_track(track):
            return
        if self._arm_mode != "multi":
            track.arm = not bool(track.arm)
            return

        if self._is_latched_arm_track(track):
            self._remove_latched_arm_track(track)
            if self._same_track(track, self._soft_armed_track):
                self._set_track_arm(track, True)
            else:
                self._set_track_arm(track, False)
            self._log("AbletonStreamDeckPlus multi-arm: unlatched '%s'" % getattr(track, "name", "?"))
        else:
            self._add_latched_arm_track(track)
            self._set_track_arm(track, True)
            self._log("AbletonStreamDeckPlus multi-arm: latched '%s'" % getattr(track, "name", "?"))

    def _handle_selected_track_arm(self, track):
        if self._arm_mode == "multi":
            self._purge_latched_arm_tracks()
            previous = self._soft_armed_track
            if previous is not None and not self._same_track(previous, track) and not self._is_latched_arm_track(previous):
                self._set_track_arm(previous, False)
            self._soft_armed_track = track if self._can_arm_track(track) else None
            if self._soft_armed_track is not None:
                self._set_track_arm(self._soft_armed_track, True)
            for latched_track in list(self._latched_arm_tracks):
                self._set_track_arm(latched_track, True)
        else:
            self._auto_arm_track(track)

    def _auto_arm_track(self, track):
        if not self._can_arm_track(track):
            return
        song = self._song()
        if bool(getattr(song, "exclusive_arm", False)):
            for other_track in list(song.tracks):
                if other_track != track and self._can_arm_track(other_track):
                    try:
                        other_track.arm = False
                    except Exception:
                        pass
        track.arm = True

    def _can_arm_track(self, track):
        return track is not None and bool(getattr(track, "can_be_armed", False)) and hasattr(track, "arm")

    def _set_track_arm(self, track, armed):
        if not self._can_arm_track(track):
            return
        try:
            track.arm = bool(armed)
        except Exception as error:
            self._log("AbletonStreamDeckPlus could not set arm for '%s': %s" % (getattr(track, "name", "?"), error))

    def _same_track(self, left, right):
        return left is not None and right is not None and left == right

    def _is_latched_arm_track(self, track):
        return any(self._same_track(track, candidate) for candidate in self._latched_arm_tracks)

    def _add_latched_arm_track(self, track):
        if self._can_arm_track(track) and not self._is_latched_arm_track(track):
            self._latched_arm_tracks.append(track)

    def _remove_latched_arm_track(self, track):
        self._latched_arm_tracks = [
            candidate for candidate in self._latched_arm_tracks
            if not self._same_track(candidate, track)
        ]

    def _purge_latched_arm_tracks(self):
        valid_tracks = list(self._song().tracks)
        self._latched_arm_tracks = [
            track for track in self._latched_arm_tracks
            if any(self._same_track(track, valid_track) for valid_track in valid_tracks)
        ]

    def _change_volume(self, ticks, fine):
        track = self._song().view.selected_track
        mixer = getattr(track, "mixer_device", None)
        volume = getattr(mixer, "volume", None)
        if volume is None or not getattr(volume, "is_enabled", True):
            return
        step = 0.0025 if fine else 0.01
        minimum = float(volume.min)
        maximum = float(volume.max)
        next_value = float(volume.value) + ticks * step * (maximum - minimum)
        volume.value = max(minimum, min(maximum, next_value))

    def _change_pan(self, ticks, fine):
        track = self._song().view.selected_track
        mixer = getattr(track, "mixer_device", None)
        pan = getattr(mixer, "panning", None)
        if pan is None or not getattr(pan, "is_enabled", True):
            return
        step = 0.0025 if fine else 0.01
        minimum = float(pan.min)
        maximum = float(pan.max)
        next_value = float(pan.value) + ticks * step * (maximum - minimum)
        pan.value = max(minimum, min(maximum, next_value))

    def _reset_volume(self):
        track = self._song().view.selected_track
        mixer = getattr(track, "mixer_device", None)
        volume = getattr(mixer, "volume", None)
        if volume is None or not getattr(volume, "is_enabled", True):
            return
        minimum = float(volume.min)
        maximum = float(volume.max)
        default_value = getattr(volume, "default_value", None)
        target = float(default_value) if default_value is not None else 0.85
        volume.value = max(minimum, min(maximum, target))

    def _toggle_selected_device_editor(self):
        track = self._song().view.selected_track
        device = self._selected_or_first_editor_device(track)
        if device is None:
            self._log("AbletonStreamDeckPlus editor toggle: no selected device with an editor")
            return
        try:
            before = bool(device.is_editor_open)
            device.is_editor_open = not before
            self._log(
                "AbletonStreamDeckPlus editor toggle: '%s' editor %s -> %s"
                % (getattr(device, "name", "?"), before, not before)
            )
        except Exception as error:
            self._log("AbletonStreamDeckPlus could not toggle selected device editor: %s" % error)

    def _selected_or_first_editor_device(self, track):
        try:
            selected = getattr(getattr(track, "view", None), "selected_device", None)
            if selected is not None and hasattr(selected, "is_editor_open"):
                return selected
        except Exception:
            pass

        for device in list(getattr(track, "devices", [])):
            if hasattr(device, "is_editor_open"):
                return device
        return None

    def _toggle_selected_track_fold(self):
        track = self._song().view.selected_track
        try:
            if self._toggle_track_chains(track):
                return
            if self._toggle_group_track_fold(track):
                return
            track_view = getattr(track, "view", None)
            if track_view is not None and hasattr(track_view, "is_collapsed"):
                before = bool(track_view.is_collapsed)
                track_view.is_collapsed = not before
                self._log(
                    "AbletonStreamDeckPlus fold toggle: '%s' view.is_collapsed %s -> %s"
                    % (getattr(track, "name", "?"), before, not before)
                )
                return
            self._log("AbletonStreamDeckPlus fold toggle: selected track has no Session unfold/collapse state")
        except Exception as error:
            self._log("AbletonStreamDeckPlus could not toggle selected track fold: %s" % error)

    def _vertical_knob_press(self):
        if self._view_mode() == "session":
            self._fire_or_stop_selected_clip_slot()
            return
        self._toggle_selected_track_fold()

    def _fire_or_stop_selected_clip_slot(self):
        song = self._song()
        track = song.view.selected_track
        scene = song.view.selected_scene
        scenes = list(song.scenes)
        if scene not in scenes:
            self._log("AbletonStreamDeckPlus clip fire: selected scene not found")
            return
        scene_index = scenes.index(scene)
        clip_slots = list(self._safe_attr(track, "clip_slots", []) or [])
        if scene_index < 0 or scene_index >= len(clip_slots):
            self._log("AbletonStreamDeckPlus clip fire: selected track has no slot at selected scene")
            return
        clip_slot = clip_slots[scene_index]
        has_clip = bool(self._safe_attr(clip_slot, "has_clip", False))
        clip = self._safe_attr(clip_slot, "clip", None) if has_clip else None
        if has_clip and bool(self._safe_attr(clip, "is_playing", False)) and hasattr(track, "stop_all_clips"):
            track.stop_all_clips(False)
            self._log("AbletonStreamDeckPlus clip fire: stopped selected track clips")
            return
        if not has_clip:
            if not self._can_arm_track(track):
                self._log("AbletonStreamDeckPlus clip record: selected track cannot be armed")
                return
            self._handle_selected_track_arm(track)
            clip_slot.fire()
            self._log("AbletonStreamDeckPlus clip record: fired empty selected clip slot")
            return
        clip_slot.fire()
        self._log("AbletonStreamDeckPlus clip fire: fired selected clip slot")

    def _toggle_track_chains(self, track):
        if not bool(getattr(track, "can_show_chains", False)) or not hasattr(track, "is_showing_chains"):
            return False
        before = bool(track.is_showing_chains)
        track.is_showing_chains = not before
        self._log(
            "AbletonStreamDeckPlus fold toggle: '%s' is_showing_chains %s -> %s"
            % (getattr(track, "name", "?"), before, not before)
        )
        return True

    def _toggle_group_track_fold(self, track):
        target = track
        if not bool(getattr(target, "is_foldable", False)) and bool(getattr(track, "is_grouped", False)):
            target = getattr(track, "group_track", None)
        if target is None or not bool(getattr(target, "is_foldable", False)) or not hasattr(target, "fold_state"):
            return False
        before = bool(target.fold_state)
        target.fold_state = not before
        self._log(
            "AbletonStreamDeckPlus fold toggle: '%s' fold_state %s -> %s"
            % (getattr(target, "name", "?"), before, not before)
        )
        return True

    def _toggle_session_arrangement_view(self):
        view = self._application().view
        focused = str(getattr(view, "focused_document_view", ""))
        if focused == "Session" or view.is_view_visible("Session"):
            view.show_view("Arranger")
            view.focus_view("Arranger")
        else:
            view.show_view("Session")
            view.focus_view("Session")

    def _running_live_version(self):
        try:
            application = self._application()
            return (application.get_major_version(), application.get_minor_version(), application.get_bugfix_version())
        except Exception:
            return None

    def _external_instrument_folder(self):
        if self._external_instrument_dir is None:
            self._external_instrument_dir = paths.external_instrument_folder(running_version=self._running_live_version())
            self._log("AbletonStreamDeckPlus external instrument presets: %s" % self._external_instrument_dir)
        return self._external_instrument_dir

    def _external_instrument_items(self):
        if self._external_instrument_presets is not None:
            return self._external_instrument_presets
        presets = []
        preset_dir = self._external_instrument_folder()
        try:
            for root, _directories, filenames in os.walk(preset_dir):
                for filename in filenames:
                    extension = os.path.splitext(filename)[1].lower()
                    if extension not in EXTERNAL_INSTRUMENT_EXTENSIONS:
                        continue
                    path = os.path.join(root, filename)
                    relative_path = os.path.relpath(path, preset_dir)
                    name = os.path.splitext(os.path.basename(filename))[0]
                    presets.append({
                        "name": name,
                        "path": path,
                        "relativePath": relative_path,
                    })
            presets.sort(key=lambda item: item["relativePath"].lower())
        except Exception as error:
            self._log("AbletonStreamDeckPlus external instrument scan error: %s" % error)
            presets = []
        self._external_instrument_presets = presets
        if presets:
            self._external_instrument_index = max(0, min(self._external_instrument_index, len(presets) - 1))
        else:
            self._external_instrument_index = 0
        return presets

    def _external_instrument_snapshot(self):
        presets = self._external_instrument_items()
        if not presets:
            return {
                "available": False,
                "index": 0,
                "count": 0,
                "name": "",
                "relativePath": "",
            }
        selected = presets[self._external_instrument_index]
        return {
            "available": True,
            "index": self._external_instrument_index,
            "count": len(presets),
            "name": self._display_instrument_name(selected["name"]),
            "relativePath": selected["relativePath"],
        }

    def _browse_external_instrument(self, ticks):
        presets = self._external_instrument_items()
        if not presets or ticks == 0:
            return
        self._external_instrument_index = (self._external_instrument_index + ticks) % len(presets)

    def _load_external_instrument(self):
        presets = self._external_instrument_items()
        if not presets:
            self._log("AbletonStreamDeckPlus external instrument load: no presets found")
            return
        preset = presets[self._external_instrument_index]
        browser_item = self._find_external_instrument_browser_item(preset)
        if browser_item is None:
            self._log("AbletonStreamDeckPlus external instrument load: browser item not found for %s" % preset["relativePath"])
            self._inspect_external_browser({"target": preset["relativePath"], "reason": "load lookup failed"})
            return
        song = self._song()
        tracks = list(song.tracks)
        selected_track = song.view.selected_track
        try:
            insert_index = tracks.index(selected_track) + 1
        except Exception:
            insert_index = len(tracks)
        song.create_midi_track(insert_index)
        new_track = list(song.tracks)[insert_index]
        song.view.selected_track = new_track
        self._application().browser.load_item(browser_item)
        self._handle_selected_track_arm(new_track)
        self._log("AbletonStreamDeckPlus external instrument load: %s" % preset["name"])

    def _find_external_instrument_browser_item(self, preset):
        cache_key = preset["path"]
        if cache_key in self._external_instrument_browser_cache:
            return self._external_instrument_browser_cache[cache_key]
        browser = self._safe_attr(self._application(), "browser", None)
        if browser is None:
            return None
        target_name = preset["name"].lower()
        target_filename = os.path.basename(preset["path"]).lower()
        target_relative = preset["relativePath"].replace("\\", "/").lower()
        for root in self._browser_roots(browser):
            visited = {}
            match = self._find_browser_item(root, target_name, target_filename, target_relative, 0, visited, prefer_external=True)
            if match is not None:
                self._external_instrument_browser_cache[cache_key] = match
                return match
        return None

    def _browser_roots(self, browser):
        roots = []
        for root_name in ("instruments", "user_library", "user_folders", "current_project", "sounds"):
            root = self._safe_attr(browser, root_name, None)
            if root is None:
                continue
            try:
                for item in list(root):
                    if item is not None:
                        roots.append(item)
                continue
            except Exception:
                pass
            roots.append(root)
        return roots

    def _browser_item_children(self, item):
        children = self._safe_attr(item, "children", None)
        if children is not None:
            try:
                return list(children)
            except Exception:
                pass
        iter_children = self._safe_attr(item, "iter_children", None)
        if iter_children is not None:
            try:
                if callable(iter_children):
                    return list(iter_children())
                return list(iter_children)
            except Exception:
                pass
        return []

    def _browser_child_priority(self, child, target_name, target_filename, target_relative, prefer_external):
        name = str(self._safe_attr(child, "name", "") or "").lower()
        uri = str(self._safe_attr(child, "uri", "") or "").lower()
        normalized_name = os.path.splitext(name)[0]
        if name == target_filename or normalized_name == target_name:
            return 0
        if uri.endswith(target_filename) or uri.endswith(target_relative) or target_relative in uri:
            return 1
        if prefer_external and "external instrument" in name:
            return 2
        return 10

    def _find_browser_item(self, item, target_name, target_filename, target_relative, depth, visited, prefer_external=False):
        if item is None or depth > MAX_BROWSER_SEARCH_DEPTH or len(visited) > MAX_BROWSER_SEARCH_ITEMS:
            return None
        try:
            identifier = id(item)
        except Exception:
            identifier = None
        if identifier is not None:
            if identifier in visited:
                return None
            # Keep the wrapper alive: Live hands out fresh wrappers, and a freed
            # one's id could be reused by a different item later in the search.
            visited[identifier] = item
        name = str(self._safe_attr(item, "name", "") or "")
        uri = str(self._safe_attr(item, "uri", "") or "")
        loadable = bool(self._safe_attr(item, "is_loadable", False))
        normalized_name = os.path.splitext(name)[0].lower()
        lower_name = name.lower()
        lower_uri = uri.lower()
        if loadable and (
            normalized_name == target_name
            or lower_name == target_filename
            or lower_uri.endswith(target_filename)
            or lower_uri.endswith(target_relative)
            or target_relative in lower_uri
        ):
            return item
        children = self._browser_item_children(item)
        try:
            children = sorted(
                children,
                key=lambda child: self._browser_child_priority(child, target_name, target_filename, target_relative, prefer_external)
            )
        except Exception:
            pass
        for child in children:
            match = self._find_browser_item(child, target_name, target_filename, target_relative, depth + 1, visited, prefer_external)
            if match is not None:
                return match
        return None

    def _browser_item_debug_snapshot(self, item, depth=0):
        name = str(self._safe_attr(item, "name", "") or "")
        uri = str(self._safe_attr(item, "uri", "") or "")
        children = self._browser_item_children(item)
        return {
            "name": name,
            "uri": uri,
            "isLoadable": bool(self._safe_attr(item, "is_loadable", False)),
            "isFolder": bool(self._safe_attr(item, "is_folder", False)),
            "childCount": len(children),
            "children": [
                self._browser_item_debug_snapshot(child, depth + 1)
                for child in children[:50]
            ] if depth < 2 else [],
        }

    def _write_debug_file(self, kind, payload, label):
        """Write a debug snapshot into the fixed debug folder (never a path from a packet)."""
        path = paths.debug_file(kind)
        try:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w") as handle:
                json.dump(payload, handle, indent=2, sort_keys=True)
            self._log("AbletonStreamDeckPlus wrote %s: %s" % (label, path))
        except Exception as error:
            self._log("AbletonStreamDeckPlus %s write error: %s" % (label, error))
        return path

    def _inspect_external_browser(self, packet):
        target = str(packet.get("target", "") or "")
        reason = str(packet.get("reason", "") or "")
        browser = self._safe_attr(self._application(), "browser", None)
        roots = self._browser_roots(browser) if browser is not None else []
        payload = {
            "generatedAt": time.time(),
            "reason": reason,
            "target": target,
            "presetDirectory": self._external_instrument_folder(),
            "presetCount": len(self._external_instrument_items()),
            "roots": [self._browser_item_debug_snapshot(root) for root in roots],
        }
        self._write_debug_file("external_browser", payload, "external browser inspect")

    def _zoom(self, ticks, horizontal, selected_only):
        if ticks == 0:
            return
        view = self._application().view
        target_view = "Session" if self._view_mode() == "session" else "Arranger"
        view.show_view(target_view)
        # Live.Application.View.NavDirection: up=0, down=1, left=2, right=3.
        direction = (3 if ticks > 0 else 2) if horizontal else (0 if ticks > 0 else 1)
        for _ in range(min(abs(ticks), 24)):
            view.zoom_view(direction, target_view, bool(selected_only))

    def _toggle_property(self, property_name, require=None):
        track = self._song().view.selected_track
        if require and not bool(getattr(track, require, False)):
            return
        if not hasattr(track, property_name):
            return
        setattr(track, property_name, not bool(getattr(track, property_name)))

    def _cycle_monitor(self):
        track = self._song().view.selected_track
        if not hasattr(track, "current_monitoring_state") or not bool(getattr(track, "can_be_armed", False)):
            return
        current = int(track.current_monitoring_state)
        track.current_monitoring_state = (current + 1) % 3

    def _play(self):
        song = self._song()
        start_playing = getattr(song, "start_playing", None)
        if callable(start_playing):
            start_playing()

    def _stop(self):
        song = self._song()
        stop_playing = getattr(song, "stop_playing", None)
        if callable(stop_playing):
            stop_playing()

    def _toggle_song_boolean(self, property_name):
        song = self._song()
        if not hasattr(song, property_name):
            return
        setattr(song, property_name, not bool(getattr(song, property_name)))

    def _on_selected_track_changed(self):
        self._bind_selected_track()
        self.schedule_message(1, self._handle_deferred_selected_track_arm)
        self._send_state(force=True)

    def _on_track_list_changed(self):
        self._purge_latched_arm_tracks()
        self._bind_selected_track()
        self.schedule_message(1, self._handle_deferred_selected_track_arm)
        self._send_state(force=True)

    def _handle_deferred_selected_track_arm(self):
        self._handle_selected_track_arm(self._song().view.selected_track)
        self._send_state(force=True)

    def _on_state_changed(self):
        self._send_state(force=False)

    def _bind_selected_track(self):
        self._remove_listeners(self._track_listeners)
        track = self._song().view.selected_track
        self._selected_track = track
        for property_name in ("name", "color", "color_index", "arm", "solo", "mute", "current_monitoring_state", "output_meter_left", "output_meter_right"):
            self._add_listener(track, property_name, self._on_state_changed, self._track_listeners)
        mixer = getattr(track, "mixer_device", None)
        volume = getattr(mixer, "volume", None)
        self._add_listener(volume, "value", self._on_state_changed, self._track_listeners)
        pan = getattr(mixer, "panning", None)
        self._add_listener(pan, "value", self._on_state_changed, self._track_listeners)

    def _add_listener(self, subject, property_name, callback, collection):
        if subject is None:
            return
        add = getattr(subject, "add_%s_listener" % property_name, None)
        has = getattr(subject, "%s_has_listener" % property_name, None)
        if not callable(add):
            return
        try:
            if not callable(has) or not has(callback):
                add(callback)
            collection.append((subject, property_name, callback))
        except Exception as error:
            self._log("AbletonStreamDeckPlus listener %s unavailable: %s" % (property_name, error))

    def _remove_listeners(self, collection):
        while collection:
            subject, property_name, callback = collection.pop()
            remove = getattr(subject, "remove_%s_listener" % property_name, None)
            has = getattr(subject, "%s_has_listener" % property_name, None)
            try:
                if callable(remove) and (not callable(has) or has(callback)):
                    remove(callback)
            except Exception:
                pass

    def _send_state(self, force=False):
        if not self._client_address:
            return
        state = self._snapshot()
        serialized = json.dumps(state, separators=(",", ":"), sort_keys=True)
        if force or serialized != self._last_state_json:
            self._send_bytes(serialized.encode("utf-8"))
            self._last_state_json = serialized
            self._last_send_time = time.monotonic()

    def _send_json(self, payload):
        self._send_bytes(json.dumps(payload, separators=(",", ":")).encode("utf-8"))

    def _send_bytes(self, payload):
        if not self._udp_socket or not self._client_address:
            return
        try:
            self._udp_socket.sendto(payload, self._client_address)
        except Exception as error:
            self._log("AbletonStreamDeckPlus send error: %s" % error)

    def _snapshot(self):
        application = self._application()
        version = "%d.%d.%d" % (
            application.get_major_version(),
            application.get_minor_version(),
            application.get_bugfix_version(),
        )
        return {
            "type": "state",
            "protocol": PROTOCOL_VERSION,
            "liveVersion": version,
            "armMode": self._arm_mode,
            "viewMode": self._view_mode(),
            "externalInstrumentBrowser": self._external_instrument_snapshot(),
            "transport": self._transport_snapshot(),
            "track": self._track_snapshot(self._song().view.selected_track),
        }

    def _view_mode(self):
        view = self._application().view
        focused = str(self._safe_attr(view, "focused_document_view", ""))
        if focused == "Session":
            return "session"
        if focused == "Arranger":
            return "arranger"
        try:
            if view.is_view_visible("Session"):
                return "session"
        except Exception:
            pass
        return "arranger"

    def _json_value(self, value):
        try:
            json.dumps(value)
            return value
        except Exception:
            return str(value)

    def _safe_attr(self, obj, name, default=None):
        try:
            return getattr(obj, name, default)
        except Exception:
            return default

    def _routing_display_name(self, routing):
        if not routing:
            return ""
        if isinstance(routing, dict):
            return str(routing.get("display_name") or routing.get("identifier") or "")
        display_name = self._safe_attr(routing, "display_name", None)
        if display_name is not None:
            return str(display_name)
        identifier = self._safe_attr(routing, "identifier", None)
        if identifier is not None:
            return str(identifier)
        return str(routing)

    def _midi_to_label(self, track):
        output_type = self._routing_display_name(self._safe_attr(track, "output_routing_type", None))
        output_channel = self._routing_display_name(self._safe_attr(track, "output_routing_channel", None))
        if not output_type:
            output_type = self._routing_display_name(self._safe_attr(track, "current_output_routing", None))
        if not output_channel:
            output_channel = self._routing_display_name(self._safe_attr(track, "current_output_sub_routing", None))
        if output_type and output_channel and output_channel not in ("None", "No Output"):
            return "%s · %s" % (output_type, output_channel)
        return output_type or output_channel

    def _audio_from_label(self, track):
        input_type = self._routing_display_name(self._safe_attr(track, "input_routing_type", None))
        input_channel = self._routing_display_name(self._safe_attr(track, "input_routing_channel", None))
        if not input_type:
            input_type = self._routing_display_name(self._safe_attr(track, "current_input_routing", None))
        if not input_channel:
            input_channel = self._routing_display_name(self._safe_attr(track, "current_input_sub_routing", None))
        if input_type and input_channel and input_channel not in ("None", "No Input"):
            return "%s · %s" % (input_type, input_channel)
        return input_type or input_channel

    def _device_snapshot(self, device, depth=0):
        parameters = []
        for parameter in list(self._safe_attr(device, "parameters", []) or []):
            parameters.append({
                "name": str(self._safe_attr(parameter, "name", "")),
                "displayValue": str(self._safe_attr(parameter, "display_value", "")),
                "value": self._json_value(self._safe_attr(parameter, "value", "")),
                "min": self._json_value(self._safe_attr(parameter, "min", "")),
                "max": self._json_value(self._safe_attr(parameter, "max", "")),
                "isEnabled": bool(self._safe_attr(parameter, "is_enabled", False)),
                "isQuantized": bool(self._safe_attr(parameter, "is_quantized", False)),
            })
        data = {
            "name": str(self._safe_attr(device, "name", "")),
            "className": str(self._safe_attr(device, "class_name", "")),
            "classDisplayName": str(self._safe_attr(device, "class_display_name", "")),
            "type": self._json_value(self._safe_attr(device, "type", "")),
            "isActive": bool(self._safe_attr(device, "is_active", False)),
            "canHaveChains": bool(self._safe_attr(device, "can_have_chains", False)),
            "canShowChains": bool(self._safe_attr(device, "can_show_chains", False)),
            "isShowingChains": bool(self._safe_attr(device, "is_showing_chains", False)),
            "hasEditor": hasattr(device, "is_editor_open"),
            "editorOpen": bool(self._safe_attr(device, "is_editor_open", False)) if hasattr(device, "is_editor_open") else False,
            "parameters": parameters,
        }
        plugin_name = self._safe_attr(device, "plugin_name", None)
        if plugin_name is not None:
            data["pluginName"] = str(plugin_name)
        plugin_format = self._safe_attr(device, "plugin_format", None)
        if plugin_format is not None:
            data["pluginFormat"] = self._json_value(plugin_format)
        if depth < 2 and bool(data["canHaveChains"]):
            chains = []
            for chain in list(self._safe_attr(device, "chains", []) or []):
                chain_devices = []
                for child in list(self._safe_attr(chain, "devices", []) or []):
                    chain_devices.append(self._device_snapshot(child, depth + 1))
                chains.append({
                    "name": str(self._safe_attr(chain, "name", "")),
                    "devices": chain_devices,
                })
            if chains:
                data["chains"] = chains
        return data

    def _track_device_inspect_snapshot(self, track, index, count):
        snapshot = self._track_snapshot(track)
        selected = self._safe_attr(self._safe_attr(track, "view", None), "selected_device", None)
        devices = []
        for device in list(self._safe_attr(track, "devices", []) or []):
            devices.append(self._device_snapshot(device))
        return {
            "index": index,
            "count": count,
            "track": snapshot,
            "routingDebug": {
                "hasMidiInput": bool(self._safe_attr(track, "has_midi_input", False)),
                "hasMidiOutput": bool(self._safe_attr(track, "has_midi_output", False)),
                "hasAudioInput": bool(self._safe_attr(track, "has_audio_input", False)),
                "hasAudioOutput": bool(self._safe_attr(track, "has_audio_output", False)),
                "outputRoutingType": self._routing_display_name(self._safe_attr(track, "output_routing_type", None)),
                "outputRoutingChannel": self._routing_display_name(self._safe_attr(track, "output_routing_channel", None)),
                "currentOutputRouting": self._routing_display_name(self._safe_attr(track, "current_output_routing", None)),
                "currentOutputSubRouting": self._routing_display_name(self._safe_attr(track, "current_output_sub_routing", None)),
            },
            "selectedDeviceName": str(self._safe_attr(selected, "name", "")) if selected else "",
            "devices": devices,
        }

    def _display_device_label(self, track):
        selected = self._safe_attr(self._safe_attr(track, "view", None), "selected_device", None)
        devices = list(self._safe_attr(track, "devices", []) or [])
        candidates = []
        if selected:
            candidates.append(selected)
        for device in devices:
            if device not in candidates:
                candidates.append(device)
        for device in candidates:
            class_name = str(self._safe_attr(device, "class_name", ""))
            class_display_name = str(self._safe_attr(device, "class_display_name", ""))
            name = str(self._safe_attr(device, "name", ""))
            device_type = self._safe_attr(device, "type", 0)
            if class_name == "ProxyInstrumentDevice" or class_display_name == "External Instrument":
                return "EXT INST · %s" % self._display_instrument_name(name or class_display_name or "External Instrument")
            if class_name == "PluginDevice":
                return "PLUGIN · %s" % (name or class_display_name or "Plugin")
            if int(device_type or 0) == 1:
                return "%s · %s" % (class_display_name or "INST", name or class_display_name)
        return ""

    def _display_instrument_name(self, name):
        text = str(name or "").strip()
        return re.sub(r"([a-z])([IVX]{2,})$", r"\1 \2", text)

    def _inspect_tracks(self, packet):
        song = self._song()
        tracks = list(song.tracks)
        requested = packet.get("indices", [])
        results = []
        for raw_index in requested:
            try:
                one_based = int(raw_index)
            except Exception:
                continue
            zero_based = one_based - 1
            if zero_based < 0 or zero_based >= len(tracks):
                results.append({"index": one_based, "error": "Track index out of range"})
                continue
            results.append(self._track_device_inspect_snapshot(tracks[zero_based], one_based, len(tracks)))
        payload = {
            "generatedAt": time.time(),
            "liveTrackCount": len(tracks),
            "tracks": results,
        }
        self._write_debug_file("tracks", payload, "track device inspect")

    def _transport_snapshot(self):
        song = self._song()
        song_time = float(getattr(song, "current_song_time", 0.0))
        return {
            "playing": bool(getattr(song, "is_playing", False)),
            "recording": bool(getattr(song, "record_mode", False)),
            "metronome": bool(getattr(song, "metronome", False)),
            "songTime": song_time,
            "locator": self._format_locator(song_time),
            "tempo": float(getattr(song, "tempo", 120.0)),
            "signatureNumerator": max(1, int(getattr(song, "signature_numerator", 4))),
            "signatureDenominator": max(1, int(getattr(song, "signature_denominator", 4))),
        }

    def _format_locator(self, song_time):
        song = self._song()
        return format_locator(song_time, getattr(song, "signature_numerator", 4), getattr(song, "signature_denominator", 4))

    def _track_snapshot(self, track):
        if track is None:
            return None
        song = self._song()
        tracks = list(song.tracks)
        returns = list(song.return_tracks)
        if track in tracks:
            index = tracks.index(track)
            count = len(tracks)
            kind = "track"
            if bool(getattr(track, "has_midi_input", False)):
                type_label = "MIDI"
            elif bool(getattr(track, "has_audio_input", False)):
                type_label = "AUDIO"
            else:
                type_label = "TRACK"
        elif track in returns:
            index = returns.index(track)
            count = len(returns)
            kind = "return"
            type_label = "RETURN"
        else:
            index = 0
            count = 1
            kind = "master"
            type_label = "MASTER"

        mixer = getattr(track, "mixer_device", None)
        volume = getattr(mixer, "volume", None)
        pan = getattr(mixer, "panning", None)
        volume_available = volume is not None
        if volume_available:
            minimum = float(volume.min)
            maximum = float(volume.max)
            value = float(volume.value)
            normalized = (value - minimum) / (maximum - minimum) if maximum != minimum else 0.0
            display = str(volume.display_value)
        else:
            value = 0.0
            normalized = 0.0
            display = "N/A"

        pan_available = pan is not None
        if pan_available:
            pan_minimum = float(pan.min)
            pan_maximum = float(pan.max)
            pan_value = float(pan.value)
            pan_normalized = (pan_value - pan_minimum) / (pan_maximum - pan_minimum) if pan_maximum != pan_minimum else 0.5
            pan_display = str(pan.display_value)
        else:
            pan_value = 0.0
            pan_normalized = 0.5
            pan_display = "N/A"

        monitor_available = hasattr(track, "current_monitoring_state") and bool(getattr(track, "can_be_armed", False))
        monitor = int(getattr(track, "current_monitoring_state", 2)) if monitor_available else 2
        monitor_labels = {0: "In", 1: "Auto", 2: "Off"}
        raw_color = int(getattr(track, "color", 0x5B5B5B))
        color = raw_color & 0xFFFFFF
        color_index = self._safe_attr(track, "color_index", None)
        output_meter_left = max(0.0, min(1.0, float(self._safe_attr(track, "output_meter_left", 0.0) or 0.0)))
        output_meter_right = max(0.0, min(1.0, float(self._safe_attr(track, "output_meter_right", output_meter_left) or 0.0)))

        return {
            "index": index,
            "count": count,
            "name": str(getattr(track, "name", "Track")),
            "color": "#%06X" % color,
            "rawColor": raw_color,
            "colorIndex": self._json_value(color_index) if color_index is not None else None,
            "outputMeterLeft": output_meter_left,
            "outputMeterRight": output_meter_right,
            "kind": kind,
            "typeLabel": type_label,
            "deviceLabel": self._display_device_label(track),
            "midiFromLabel": self._audio_from_label(track) if type_label == "MIDI" else "",
            "midiToLabel": self._midi_to_label(track) if type_label == "MIDI" else "",
            "audioFromLabel": self._audio_from_label(track) if type_label == "AUDIO" else "",
            "audioToLabel": self._midi_to_label(track) if type_label == "AUDIO" else "",
            "arm": bool(getattr(track, "arm", False)),
            "armAvailable": bool(getattr(track, "can_be_armed", False)) and hasattr(track, "arm"),
            "armSoft": self._arm_mode == "multi" and self._same_track(track, self._soft_armed_track),
            "armLatched": self._arm_mode == "multi" and self._is_latched_arm_track(track),
            "solo": bool(getattr(track, "solo", False)),
            "soloAvailable": hasattr(track, "solo"),
            "mute": bool(getattr(track, "mute", False)),
            "muteAvailable": hasattr(track, "mute"),
            "monitor": monitor,
            "monitorLabel": monitor_labels.get(monitor, str(monitor)),
            "monitorAvailable": monitor_available,
            "volume": value,
            "volumeNormalized": max(0.0, min(1.0, normalized)),
            "volumeDisplay": display,
            "volumeAvailable": volume_available,
            "pan": pan_value,
            "panNormalized": max(0.0, min(1.0, pan_normalized)),
            "panDisplay": pan_display,
            "panAvailable": pan_available,
        }

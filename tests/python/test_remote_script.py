"""Tests for the Live Remote Script, run outside Live with a stub framework.

    python3 -m unittest discover -s tests/python      (or: npm run test:python)
"""

import json
import os
import subprocess
import sys
import tempfile
import types
import unittest
from unittest import mock

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "ableton"))


class StubControlSurface(object):
    """The parts of Live's ControlSurface the script uses."""

    def __init__(self, c_instance):
        self.scheduled = []
        self.logged = []

    def schedule_message(self, delay, callback):
        self.scheduled.append(callback)

    def log_message(self, message):
        self.logged.append(message)

    def show_message(self, message):
        pass

    def update_display(self):
        pass

    def disconnect(self):
        pass


def _install_stub_framework():
    framework = types.ModuleType("ableton.v2.control_surface")
    framework.ControlSurface = StubControlSurface
    for name in ("ableton", "ableton.v2"):
        sys.modules.setdefault(name, types.ModuleType(name))
    sys.modules["ableton.v2.control_surface"] = framework


_install_stub_framework()

from AbletonStreamDeckPlus import paths  # noqa: E402
from AbletonStreamDeckPlus.control_surface import AbletonStreamDeckPlus, format_locator  # noqa: E402


class Obj(object):
    def __init__(self, **values):
        self.__dict__.update(values)


class FakeApplication(object):
    def __init__(self, version=(12, 4, 16)):
        self.version = version
        self.browser = None

    def get_major_version(self):
        return self.version[0]

    def get_minor_version(self):
        return self.version[1]

    def get_bugfix_version(self):
        return self.version[2]


def library_cfg(project_path, name="User Library"):
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n<Ableton>\n\t<ContentLibrary>\n\t\t<UserLibrary>\n'
        '\t\t\t<LibraryProject Id="0">\n\t\t\t\t<ProjectLocation />\n'
        '\t\t\t\t<ProjectName Value="%s" />\n\t\t\t\t<ProjectPath Value="%s" />\n'
        '\t\t\t</LibraryProject>\n\t\t</UserLibrary>\n\t</ContentLibrary>\n</Ableton>\n' % (name, project_path)
    )


class TempHome(object):
    """A throwaway home folder; HOME points at it so expanduser('~') does too."""

    def __enter__(self):
        self._folder = tempfile.TemporaryDirectory()
        self.path = os.path.realpath(self._folder.name)
        self._env = mock.patch.dict(os.environ, {"HOME": self.path})
        self._env.start()
        return self

    def __exit__(self, *exc):
        self._env.stop()
        self._folder.cleanup()

    def make(self, *parts, content=None):
        path = os.path.join(self.path, *parts)
        if content is None:
            os.makedirs(path, exist_ok=True)
        else:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w", encoding="utf-8") as handle:
                handle.write(content)
        return path

    def live_prefs(self, version, project_path, name="User Library"):
        return self.make("Library", "Preferences", "Ableton", "Live %s" % version, "Library.cfg",
                         content=library_cfg(project_path, name))


class UserLibraryTests(unittest.TestCase):
    def test_default_when_live_has_no_preferences(self):
        with TempHome() as home:
            self.assertEqual(paths.user_library(), os.path.join(home.path, "Music", "Ableton", "User Library"))
            self.assertEqual(paths.external_instrument_folder(), os.path.join(
                home.path, "Music", "Ableton", "User Library", "Presets", "Instruments", "External Instrument"))

    def test_reads_the_library_set_in_live_preferences(self):
        with TempHome() as home:
            moved = home.make("Drive", "My Library")
            home.live_prefs("12.2.5", os.path.join(home.path, "Drive"), "My Library")
            self.assertEqual(paths.user_library(), moved)

    def test_newest_version_wins_and_the_running_version_comes_first(self):
        with TempHome() as home:
            old = home.make("Old", "User Library")
            new = home.make("New", "User Library")
            running = home.make("Running", "User Library")
            home.live_prefs("11.3.4", os.path.join(home.path, "Old"))
            home.live_prefs("12.4.16", os.path.join(home.path, "New"))
            home.live_prefs("12.4.2", os.path.join(home.path, "Running"))
            self.assertEqual(paths.user_library(), new, "12.4.16 is newer than 12.4.2 (numeric, not text, order)")
            self.assertEqual(paths.user_library(running_version=(12, 4, 2)), running)
            self.assertNotEqual(old, paths.user_library())

    def test_a_library_that_is_not_there_is_skipped(self):
        with TempHome() as home:
            home.live_prefs("12.4.16", "/Volumes/Unplugged Drive")
            older = home.make("Music", "Elsewhere", "User Library")
            home.live_prefs("12.2.5", os.path.join(home.path, "Music", "Elsewhere"))
            self.assertEqual(paths.user_library(), older)

    def test_xml_escapes_in_the_path_are_decoded(self):
        xml = library_cfg("/Users/someone/Rock &amp; Roll &#38; More")
        self.assertEqual(paths.library_from_config(xml), "/Users/someone/Rock & Roll & More/User Library")
        self.assertIsNone(paths.library_from_config("<Ableton></Ableton>"))

    def test_the_installer_finds_the_same_library(self):
        """install.sh uses a zsh copy of the lookup (no Python needed); it must agree."""
        script = os.path.join(ROOT, "scripts", "user-library.zsh")

        def installer_library():
            result = subprocess.run(["/bin/zsh", "-c", 'source "$1"; ableton_user_library', "zsh", script],
                                    capture_output=True, text=True, check=True, env=dict(os.environ))
            return result.stdout.strip()

        with TempHome() as home:
            self.assertEqual(installer_library(), paths.user_library(), "no preferences: the default")
            home.make("Old", "User Library")
            home.make("New", "Rock & Roll Library")
            home.live_prefs("12.4.2", os.path.join(home.path, "Old"))
            home.live_prefs("12.4.16", os.path.join(home.path, "New"), "Rock &amp; Roll Library")
            home.live_prefs("12.5.0", "/Volumes/Unplugged Drive")
            self.assertEqual(paths.user_library(), os.path.join(home.path, "New", "Rock & Roll Library"))
            self.assertEqual(installer_library(), paths.user_library())

    def test_version_folder_names(self):
        self.assertEqual(paths.live_version("Live 12.4.16"), (12, 4, 16))
        self.assertEqual(paths.live_version("Live 12.0"), (12, 0, 0))
        self.assertIsNone(paths.live_version("Live Beta Logs"))


def make_script(song=None, application=None):
    with mock.patch.object(AbletonStreamDeckPlus, "_open_socket"):
        script = AbletonStreamDeckPlus(object())
    script.song = song or Obj(tracks=[], view=Obj(selected_track=None))
    script.application = application or FakeApplication()
    script.sent = []
    script._send_state = lambda force=False: script.sent.append(force)
    return script


class ExternalInstrumentTests(unittest.TestCase):
    def test_presets_come_from_the_user_library_external_instrument_folder(self):
        with TempHome() as home:
            library = home.make("Music", "Studio", "User Library")
            home.live_prefs("12.4.16", os.path.join(home.path, "Music", "Studio"))
            folder = os.path.join(library, "Presets", "Instruments", "External Instrument")
            home.make(folder, "Synths", "Juno.adv", content="")
            home.make(folder, "Alpha.adg", content="")
            home.make(folder, "notes.txt", content="")
            script = make_script()
            presets = script._external_instrument_items()
            self.assertEqual([p["relativePath"] for p in presets], ["Alpha.adg", os.path.join("Synths", "Juno.adv")])
            self.assertEqual(script._external_instrument_folder(), folder)

    def test_browsing_wraps_around(self):
        with TempHome() as home:
            folder = home.make("Music", "Ableton", "User Library", "Presets", "Instruments", "External Instrument")
            for name in ("A.adv", "B.adv", "C.adv"):
                home.make(folder, name, content="")
            script = make_script()
            script._handle_command({"type": "command", "command": "browse_external_instrument", "ticks": -1})
            self.assertEqual(script._external_instrument_snapshot()["relativePath"], "C.adv")
            script._handle_command({"type": "command", "command": "browse_external_instrument", "ticks": 2})
            self.assertEqual(script._external_instrument_snapshot()["relativePath"], "B.adv")

    def test_no_folder_means_no_presets(self):
        with TempHome():
            script = make_script()
            self.assertEqual(script._external_instrument_snapshot(), {
                "available": False, "index": 0, "count": 0, "name": "", "relativePath": ""})


class DebugInspectTests(unittest.TestCase):
    def test_track_inspect_writes_only_into_the_debug_folder(self):
        with TempHome() as home:
            elsewhere = os.path.join(home.path, "elsewhere.json")
            track = Obj(name="Bass", devices=[])
            script = make_script(song=Obj(tracks=[track], view=Obj(selected_track=track)))
            script._track_device_inspect_snapshot = lambda t, index, count: {"index": index, "name": t.name}
            script._handle_command({"type": "command", "command": "inspect_tracks", "indices": [1, 5], "path": elsewhere})
            self.assertFalse(os.path.exists(elsewhere), "the packet's path is ignored")
            written = os.path.join(home.path, "Library", "Logs", "Ableton Control", "track-inspect.json")
            with open(written) as handle:
                payload = json.load(handle)
            self.assertEqual(payload["tracks"], [{"index": 1, "name": "Bass"}, {"index": 5, "error": "Track index out of range"}])

    def test_external_browser_inspect_writes_only_into_the_debug_folder(self):
        with TempHome() as home:
            elsewhere = os.path.join(home.path, "elsewhere.json")
            script = make_script()
            script._handle_command({"type": "command", "command": "inspect_external_browser", "path": elsewhere, "target": "X.adv"})
            self.assertFalse(os.path.exists(elsewhere))
            written = paths.debug_file("external_browser")
            self.assertTrue(written.startswith(os.path.join(home.path, "Library", "Logs", "Ableton Control")))
            with open(written) as handle:
                self.assertEqual(json.load(handle)["target"], "X.adv")


class LocatorTests(unittest.TestCase):
    def test_four_four(self):
        self.assertEqual(format_locator(0), "1.1.1")
        self.assertEqual(format_locator(4.5, 4, 4), "2.1.3")
        self.assertEqual(format_locator(-1), "1.1.1")

    def test_eighth_note_signatures_count_eighths(self):
        # Song time is in quarter notes; a 6/8 bar is three of them.
        self.assertEqual(format_locator(3.0, 6, 8), "2.1.1")
        self.assertEqual(format_locator(0.5, 6, 8), "1.2.1")
        self.assertEqual(format_locator(0.75, 6, 8), "1.2.2")
        self.assertEqual(format_locator(3.5, 7, 8), "2.1.1")


class BrowserSearchTests(unittest.TestCase):
    def test_wrappers_seen_earlier_are_not_mistaken_for_new_items(self):
        """Live returns fresh wrappers; a freed wrapper's id must not hide a later item."""
        class Item(object):
            def __init__(self, name, children=(), loadable=False):
                self.name, self.uri, self.is_loadable = name, "", loadable
                self._children = list(children)

            @property
            def children(self):
                # A fresh wrapper per access, like Live's browser.
                return [Item(c.name, c._children, c.is_loadable) for c in self._children]

        target = Item("Synth A.adv", loadable=True)
        root = Item("Instruments", [Item("Drum Rack", [Item("Kit %d" % i, loadable=True) for i in range(200)]),
                                     Item("External Instrument", [target])])
        script = make_script()
        match = script._find_browser_item(root, "synth a", "synth a.adv", "synth a.adv", 0, {}, prefer_external=False)
        self.assertIsNotNone(match)
        self.assertEqual(match.name, "Synth A.adv")


class CommandTests(unittest.TestCase):
    def test_unknown_packets_and_commands_are_refused(self):
        script = make_script()
        with self.assertRaises(ValueError):
            script._handle_command({"type": "mystery"})
        with self.assertRaises(ValueError):
            script._handle_command({"type": "command", "command": "format_disk"})

    def test_select_track_moves_and_stops_at_the_ends(self):
        tracks = [Obj(name=n, arm=False, can_be_armed=False) for n in ("1", "2", "3")]
        song = Obj(tracks=tracks, view=Obj(selected_track=tracks[0]))
        script = make_script(song=song)
        script._handle_selected_track_arm = lambda track: None
        script._handle_command({"type": "command", "command": "select_track", "ticks": 1})
        self.assertIs(song.view.selected_track, tracks[1])
        script._handle_command({"type": "command", "command": "select_track", "ticks": 5})
        self.assertIs(song.view.selected_track, tracks[2])
        script._handle_command({"type": "command", "command": "select_track", "ticks": -9})
        self.assertIs(song.view.selected_track, tracks[0])
        self.assertEqual(script.sent, [True, True, True], "each command sends fresh state")

    def test_select_track_from_a_return_or_master_track_goes_to_the_first_or_last(self):
        tracks = [Obj(name=n, arm=False, can_be_armed=False) for n in ("1", "2", "3")]
        master = Obj(name="Master")
        song = Obj(tracks=tracks, view=Obj(selected_track=master))
        script = make_script(song=song)
        script._handle_selected_track_arm = lambda track: None
        script._handle_command({"type": "command", "command": "select_track", "ticks": 1})
        self.assertIs(song.view.selected_track, tracks[0])
        song.view.selected_track = master
        script._handle_command({"type": "command", "command": "select_track", "ticks": -1})
        self.assertIs(song.view.selected_track, tracks[2])


if __name__ == "__main__":
    unittest.main()

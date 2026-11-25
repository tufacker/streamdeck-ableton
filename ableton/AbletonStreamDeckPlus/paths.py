"""Where the Remote Script reads presets and writes debug files.

Pure Python with no Live imports, so the tests can run it outside Live.
"""

import os
import re

EXTERNAL_INSTRUMENT_FOLDER = ("Presets", "Instruments", "External Instrument")
DEBUG_FOLDER_NAME = "Ableton Control"
DEBUG_FILES = {
    "tracks": "track-inspect.json",
    "external_browser": "external-browser-inspect.json",
}

_VERSION_FOLDER = re.compile(r"^Live (\d+)\.(\d+)(?:\.(\d+))?")
_ENTITIES = (("&quot;", '"'), ("&apos;", "'"), ("&lt;", "<"), ("&gt;", ">"), ("&amp;", "&"))


def default_user_library(home=None):
    """Live's default User Library on macOS."""
    return os.path.join(home or os.path.expanduser("~"), "Music", "Ableton", "User Library")


def preferences_folder(home=None):
    return os.path.join(home or os.path.expanduser("~"), "Library", "Preferences", "Ableton")


def live_version(folder_name):
    """(major, minor, bugfix) from a preferences folder name like 'Live 12.2.5', else None."""
    match = _VERSION_FOLDER.match(folder_name)
    if not match:
        return None
    return tuple(int(part or 0) for part in match.groups())


def _xml_value(xml, tag):
    match = re.search(r'<%s\s+Value="([^"]*)"' % tag, xml)
    if not match:
        return None
    value = re.sub(r"&#(\d+);", lambda m: chr(int(m.group(1))), match.group(1))
    for entity, char in _ENTITIES:
        value = value.replace(entity, char)
    return value


def library_from_config(xml):
    """The User Library folder a Library.cfg names, or None."""
    section = re.search(r"<UserLibrary>([\s\S]*?)</UserLibrary>", xml)
    if not section:
        return None
    parent = _xml_value(section.group(1), "ProjectPath")
    name = _xml_value(section.group(1), "ProjectName")
    if not parent or not name:
        return None
    return os.path.join(parent, name)


def configured_user_library(home=None, running_version=None):
    """The User Library set in Live's Preferences > Library, or None.

    Each installed Live version keeps its own Library.cfg. The running version's
    is tried first (when known), then the others from newest to oldest. A folder
    that isn't there (an unplugged drive, say) is skipped.
    """
    prefs = preferences_folder(home)
    try:
        names = os.listdir(prefs)
    except OSError:
        return None
    versions = [(live_version(name), name) for name in names]
    versions = [(version, name) for version, name in versions if version]
    versions.sort(reverse=True)
    if running_version:
        running = tuple(running_version)
        versions.sort(key=lambda item: item[0] != running)
    for _version, name in versions:
        try:
            with open(os.path.join(prefs, name, "Library.cfg"), encoding="utf-8", errors="replace") as handle:
                library = library_from_config(handle.read())
        except OSError:
            continue
        if library and os.path.isdir(library):
            return library
    return None


def user_library(home=None, running_version=None):
    return configured_user_library(home, running_version) or default_user_library(home)


def external_instrument_folder(home=None, running_version=None):
    return os.path.join(user_library(home, running_version), *EXTERNAL_INSTRUMENT_FOLDER)


def debug_folder(home=None):
    """The one folder the inspect commands may write to."""
    return os.path.join(home or os.path.expanduser("~"), "Library", "Logs", DEBUG_FOLDER_NAME)


def debug_file(kind, home=None):
    return os.path.join(debug_folder(home), DEBUG_FILES[kind])

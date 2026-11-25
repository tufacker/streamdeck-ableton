#!/bin/zsh
set -euo pipefail

SCRIPT_DIR=${0:A:h}
REMOTE_SCRIPT_SOURCE="$SCRIPT_DIR/ableton/AbletonStreamDeckPlus"
# The User Library set in Live's Preferences > Library (or Live's default).
source "$SCRIPT_DIR/scripts/user-library.zsh"
USER_LIBRARY=$(ableton_user_library)
REMOTE_SCRIPTS_DIR="$USER_LIBRARY/Remote Scripts"
REMOTE_SCRIPT_DESTINATION="$REMOTE_SCRIPTS_DIR/AbletonStreamDeckPlus"
PLUGIN_PACKAGE="$SCRIPT_DIR/dist/Ableton-Control.streamDeckPlugin"

if [[ ! -f "$PLUGIN_PACKAGE" ]]; then
  print -u2 "Missing packaged plugin: $PLUGIN_PACKAGE"
  print -u2 "Run 'npm install && npm run verify' first, or use the release bundle."
  exit 1
fi

mkdir -p "$REMOTE_SCRIPTS_DIR"
/usr/bin/ditto --norsrc --noextattr "$REMOTE_SCRIPT_SOURCE" "$REMOTE_SCRIPT_DESTINATION"

print "Installed the Ableton Remote Script at:"
print "  $REMOTE_SCRIPT_DESTINATION"
print "Opening the Stream Deck plugin installer..."
/usr/bin/open "$PLUGIN_PACKAGE"

print ""
print "Next: restart Ableton Live, then choose AbletonStreamDeckPlus in"
print "Live Settings > Link, Tempo & MIDI > Control Surface."
print "Leave its Input and Output set to None."

# Prints the User Library folder set in Live's Preferences > Library, the same
# way ableton/AbletonStreamDeckPlus/paths.py finds it (newest Live version
# first; folders that aren't there are skipped), or Live's default.
# zsh only, no Python needed.  Usage: source it, then: ableton_user_library
ableton_user_library() {
  emulate -L zsh
  local cfg section parent name library
  # Newest version first: numeric sort (n), descending by name (On).
  for cfg in "$HOME/Library/Preferences/Ableton/"Live\ <->.<->*/Library.cfg(N.nOn); do
    section=$(/usr/bin/sed -n '/<UserLibrary>/,/<\/UserLibrary>/p' "$cfg")
    parent=$(print -r -- "$section" | /usr/bin/sed -n 's/.*<ProjectPath Value="\([^"]*\)".*/\1/p' | /usr/bin/head -n 1)
    name=$(print -r -- "$section" | /usr/bin/sed -n 's/.*<ProjectName Value="\([^"]*\)".*/\1/p' | /usr/bin/head -n 1)
    [[ -n "$parent" && -n "$name" ]] || continue
    library="${parent%/}/$name"
    library=$(print -r -- "$library" | /usr/bin/sed -e 's/&quot;/"/g' -e "s/&apos;/'/g" -e 's/&lt;/</g' -e 's/&gt;/>/g' -e 's/&#38;/\&/g' -e 's/&amp;/\&/g')
    if [[ -d "$library" ]]; then
      print -r -- "$library"
      return 0
    fi
  done
  print -r -- "$HOME/Music/Ableton/User Library"
}

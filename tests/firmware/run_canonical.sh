#!/usr/bin/env sh
set -eu
project_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
json_include=${ARDUINOJSON_INCLUDE:-${1:-}}
if [ -z "$json_include" ] && [ -f "$HOME/Documents/Arduino/libraries/ArduinoJson/src/ArduinoJson.h" ]; then
 json_include="$HOME/Documents/Arduino/libraries/ArduinoJson/src"
fi
if [ ! -f "$json_include/ArduinoJson.h" ]; then
 echo 'Set ARDUINOJSON_INCLUDE to the pinned ArduinoJson 7.4.3 src directory.' >&2
 exit 2
fi
binary_path=$(mktemp "${TMPDIR:-/tmp}/iah-canonical-test.XXXXXX")
trap 'rm -f "$binary_path"' EXIT HUP INT TERM
source_path="$project_root/tests/firmware/canonical_test.cpp"
if [ -n "${CXX:-}" ]; then
 "$CXX" -std=c++17 -Wall -Wextra -Werror -pedantic -I "$json_include" "$source_path" -o "$binary_path"
elif [ -x /Library/Developer/CommandLineTools/usr/bin/clang++ ] && [ -d /Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/usr/include/c++/v1 ]; then
 /Library/Developer/CommandLineTools/usr/bin/clang++ -std=c++17 \
  -isysroot /Library/Developer/CommandLineTools/SDKs/MacOSX.sdk -nostdinc++ \
  -isystem /Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/usr/include/c++/v1 \
  -Wall -Wextra -Werror -pedantic -I "$json_include" "$source_path" -o "$binary_path"
else
 c++ -std=c++17 -Wall -Wextra -Werror -pedantic -I "$json_include" "$source_path" -o "$binary_path"
fi
"$binary_path"

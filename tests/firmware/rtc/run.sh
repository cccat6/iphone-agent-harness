#!/usr/bin/env sh
set -eu
rtc_root=$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)
rtc_json=${ARDUINOJSON_INCLUDE:-${RTC_ARDUINOJSON_INCLUDE:-"$HOME/Documents/Arduino/libraries/ArduinoJson/src"}}
if [ ! -f "$rtc_json/ArduinoJson.h" ]; then
 echo 'Set ARDUINOJSON_INCLUDE to the pinned ArduinoJson 7.4.3 src directory.' >&2
 exit 2
fi
rtc_binary=$(mktemp "${TMPDIR:-/tmp}/iah-rtc-test.XXXXXX")
trap 'rm -f "$rtc_binary"' EXIT HUP INT TERM
set -- -std=c++17 -Wall -Wextra -Werror -pedantic
if [ "${RTC_SANITIZE:-0}" = 1 ]; then set -- "$@" -fsanitize=address,undefined -fno-omit-frame-pointer; fi
if [ -n "${CXX:-}" ]; then
 "$CXX" "$@" -I "$rtc_json" "$rtc_root/tests/firmware/rtc/protocol_test.cpp" -o "$rtc_binary"
elif [ -x /Library/Developer/CommandLineTools/usr/bin/clang++ ] && [ -d /Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/usr/include/c++/v1 ]; then
 /Library/Developer/CommandLineTools/usr/bin/clang++ "$@" \
  -isysroot /Library/Developer/CommandLineTools/SDKs/MacOSX.sdk -nostdinc++ \
  -isystem /Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/usr/include/c++/v1 \
  -I "$rtc_json" "$rtc_root/tests/firmware/rtc/protocol_test.cpp" -o "$rtc_binary"
else
 c++ "$@" -I "$rtc_json" "$rtc_root/tests/firmware/rtc/protocol_test.cpp" -o "$rtc_binary"
fi
"$rtc_binary"

python3 "$rtc_root/tests/firmware/rtc/bridge_slots_test.py"
ARDUINOJSON_INCLUDE="$rtc_json" python3 "$rtc_root/tests/firmware/rtc/rpc_allocation_test.py"

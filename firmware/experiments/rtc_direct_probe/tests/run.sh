#!/bin/sh
set -eu
rtc_root=$(CDPATH= cd -- "$(dirname -- "$0")/../../../.." && pwd)
rtc_cxx=${RTC_CXX:-/Library/Developer/CommandLineTools/usr/bin/clang++}
rtc_json=${RTC_ARDUINOJSON_INCLUDE:-"$HOME/Documents/Arduino/libraries/ArduinoJson/src"}
"$rtc_cxx" -std=c++17 -isysroot /Library/Developer/CommandLineTools/SDKs/MacOSX.sdk \
  -I"$rtc_json" "$rtc_root/firmware/experiments/rtc_direct_probe/tests/probe_message_test.cpp" \
  -o "$rtc_root/build/rtc-c3/probe_message_test"
"$rtc_root/build/rtc-c3/probe_message_test"

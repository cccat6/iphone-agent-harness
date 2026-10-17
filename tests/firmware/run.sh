#!/usr/bin/env sh
set -eu
project_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
binary_path=$(mktemp "${TMPDIR:-/tmp}/iah-core-test.XXXXXX")
trap 'rm -f "$binary_path"' EXIT HUP INT TERM
compile_test() {
source_path=$1
shift
if [ -n "${CXX:-}" ]; then
  "$CXX" -std=c++17 -Wall -Wextra -Werror -pedantic "$@" "$source_path" -o "$binary_path"
elif [ -x /Library/Developer/CommandLineTools/usr/bin/clang++ ] && [ -d /Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/usr/include/c++/v1 ]; then
  # Uses installed CLT directly. Does not accept or modify any Xcode license.
  /Library/Developer/CommandLineTools/usr/bin/clang++ -std=c++17 \
    -isysroot /Library/Developer/CommandLineTools/SDKs/MacOSX.sdk -nostdinc++ \
    -isystem /Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/usr/include/c++/v1 \
    -Wall -Wextra -Werror -pedantic "$@" "$source_path" -o "$binary_path"
else
  c++ -std=c++17 -Wall -Wextra -Werror -pedantic "$@" "$source_path" -o "$binary_path"
fi
}
for source_path in "$project_root/tests/firmware/core_test.cpp" "$project_root/tests/firmware/admission_test.cpp"; do
  compile_test "$source_path"
  "$binary_path"
done

# Exercise the legacy/portable 256-event bound as well as the current product bound below.
compile_test "$project_root/tests/firmware/core_test.cpp" -DIAH_MAX_EVENTS=256
"$binary_path"

# Current product has 128 events and a 7KB fail-closed replay filter.
compile_test "$project_root/tests/firmware/core_test.cpp" -DIAH_MAX_EVENTS=128 -DIAH_SEEN_BYTES=7168
"$binary_path"
compile_test "$project_root/tests/firmware/core_external_test.cpp"
"$binary_path"

compile_test "$project_root/tests/firmware/setup_state_test.cpp"
"$binary_path"

python3 "$project_root/tests/firmware/ble_router_test.py"

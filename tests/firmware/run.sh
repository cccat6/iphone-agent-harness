#!/usr/bin/env sh
set -eu
project_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
binary_path=$(mktemp "${TMPDIR:-/tmp}/iah-core-test.XXXXXX")
trap 'rm -f "$binary_path"' EXIT HUP INT TERM
if [ -n "${CXX:-}" ]; then
  "$CXX" -std=c++17 -Wall -Wextra -Werror -pedantic "$project_root/tests/firmware/core_test.cpp" -o "$binary_path"
elif [ -x /Library/Developer/CommandLineTools/usr/bin/clang++ ] && [ -d /Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/usr/include/c++/v1 ]; then
  # Uses installed CLT directly. Does not accept or modify any Xcode license.
  /Library/Developer/CommandLineTools/usr/bin/clang++ -std=c++17 \
    -isysroot /Library/Developer/CommandLineTools/SDKs/MacOSX.sdk -nostdinc++ \
    -isystem /Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/usr/include/c++/v1 \
    -Wall -Wextra -Werror -pedantic "$project_root/tests/firmware/core_test.cpp" -o "$binary_path"
else
  c++ -std=c++17 -Wall -Wextra -Werror -pedantic "$project_root/tests/firmware/core_test.cpp" -o "$binary_path"
fi
"$binary_path"

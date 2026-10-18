#!/bin/sh
set -eu
rtc_root=$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)
rtc_cli=${ARDUINO_CLI:-'/Applications/Arduino IDE.app/Contents/Resources/app/lib/backend/resources/arduino-cli'}
"$rtc_cli" compile --jobs 4 \
  --fqbn 'esp32:esp32:esp32c3:CDCOnBoot=cdc,FlashMode=dio,FlashSize=4M,PartitionScheme=huge_app' \
  --build-path "$rtc_root/build/rtc-c3/compiler" \
  --build-property tools.ctags.cmd.path=/usr/bin/true \
  "$rtc_root/build/rtc-c3/rtc_direct_probe"

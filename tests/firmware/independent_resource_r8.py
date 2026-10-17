#!/usr/bin/env python3
"""Independently preprocess effective pinned ESP32 NimBLE resource settings.

This is C header preprocessing only: no Arduino build or hardware operation.
"""
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
SDK = Path.home() / 'Library/Arduino15/packages/esp32/tools'
NIMBLE = ROOT / 'tools/libraries/NimBLE_Arduino-2.5.1/src'
CLANG = Path('/Library/Developer/CommandLineTools/usr/bin/clang')
source = r'''
#include "ResourceLimits.h"
#include "nimble/porting/nimble/include/syscfg/syscfg.h"
#if CONFIG_BT_NIMBLE_MAX_CONNECTIONS != 2 || CONFIG_NIMBLE_MAX_CONNECTIONS != 2 || MYNEWT_VAL_BLE_MAX_CONNECTIONS != 2
#error host_connections
#endif
#if CONFIG_BT_NIMBLE_MAX_BONDS != 2 || CONFIG_NIMBLE_MAX_BONDS != 2 || MYNEWT_VAL_BLE_STORE_MAX_BONDS != 2
#error host_bonds
#endif
#if CONFIG_BT_NIMBLE_ATT_PREFERRED_MTU != 23 || CONFIG_NIMBLE_ATT_PREFERRED_MTU != 23 || MYNEWT_VAL_BLE_ATT_PREFERRED_MTU != 23
#error mtu
#endif
#if CONFIG_BT_NIMBLE_MSYS_1_BLOCK_COUNT != 8 || CONFIG_BT_NIMBLE_MSYS1_BLOCK_COUNT != 8 || MYNEWT_VAL_MSYS_1_BLOCK_COUNT != 8
#error msys1
#endif
#if CONFIG_BT_NIMBLE_MSYS_2_BLOCK_COUNT != EXPECT_MSYS2 || MYNEWT_VAL_MSYS_2_BLOCK_COUNT != EXPECT_MSYS2
#error msys2
#endif
#if CONFIG_BT_NIMBLE_ROLE_CENTRAL != 0 || CONFIG_BT_NIMBLE_ROLE_OBSERVER != 0 || CONFIG_BT_NIMBLE_GATT_CLIENT != 0
#error peripheral_only
#endif
#if EXPECT_MSYS2 > 0 && CONFIG_BT_NIMBLE_MSYS_2_BLOCK_SIZE <= 0
#error enabled_pool_requires_size
#endif
'''
for chip in ('esp32c3', 'esp32s3', 'esp32c6', 'esp32'):
    expected = 0 if chip == 'esp32' else 8
    includes = [ROOT / 'firmware/IPhoneAutomationHarness', NIMBLE,
                SDK / f'{chip}-libs/3.3.11/dio_qspi/include']
    command = [str(CLANG), '-E', '-P', '-x', 'c', '-DESP_PLATFORM',
               f'-DEXPECT_MSYS2={expected}']
    for path in includes:
        command.extend(('-I', str(path)))
    command.append('-')
    subprocess.run(command, input=source, text=True, check=True,
                   stdout=subprocess.DEVNULL)
    print(f'{chip}: actual pinned host headers confirm 2 connections/bonds, MTU 23, MSYS 8/{expected}')

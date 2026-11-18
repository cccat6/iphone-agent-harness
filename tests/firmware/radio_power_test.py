"""Exercise C3/S3 maximum-power operations with controller readback."""
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
main = (ROOT / 'firmware/IPhoneAutomationHarness/main.cpp').read_text()

def function(signature):
    start = main.index(signature)
    brace = main.index('{', start)
    end, depth = brace + 1, 1
    while depth:
        depth += (main[end] == '{') - (main[end] == '}')
        end += 1
    return main[start:end]

source = r'''
#include <cassert>
#include <cstddef>
enum{WIFI_POWER_20dBm=80,ESP_PWR_LVL_P20=15,ESP_BLE_PWR_TYPE_ADV=1,ESP_BLE_PWR_TYPE_DEFAULT=2};
bool allowed=true;
bool radioMaintenanceAllowed(){return allowed;}
struct Prefs{
 int power=-1;bool ble=false,fail=false;unsigned writes=0;
 size_t putInt(const char*,int value){++writes;if(fail)return 0;power=value;return sizeof(int);}
 int getInt(const char*,int){return power;}
 size_t putBool(const char*,bool value){++writes;if(fail)return 0;ble=value;return 1;}
 bool getBool(const char*,bool){return ble;}
}preferences;
struct Wifi{int power=0;bool ok=true,mismatch=false;unsigned calls=0;
 bool setTxPower(int value){++calls;if(!ok)return false;power=value;return true;}
 int getTxPower(){return mismatch?72:power;}
}WiFi;
namespace NimBLEDevice{
 bool initialized=true,ok=true,mismatch=false;int adv=0,connection=0;unsigned calls=0;
 bool isInitialized(){return initialized;}
 bool setPowerLevel(int level,int type){++calls;if(!ok)return false;if(type==ESP_BLE_PWR_TYPE_ADV)adv=level;else connection=level;return true;}
 int getPowerLevel(int type){return mismatch?0:type==ESP_BLE_PWR_TYPE_ADV?adv:connection;}
}
FUNCTIONS
void reset(){preferences=Prefs{};WiFi=Wifi{};allowed=true;NimBLEDevice::initialized=NimBLEDevice::ok=true;NimBLEDevice::mismatch=false;NimBLEDevice::adv=NimBLEDevice::connection=0;NimBLEDevice::calls=0;}
int main(){
#if defined(CONFIG_IDF_TARGET_ESP32C3) || defined(CONFIG_IDF_TARGET_ESP32S3)
 reset();allowed=false;assert(!configureRadioMaximum());assert(WiFi.calls==0&&NimBLEDevice::calls==0&&preferences.writes==0);
 reset();NimBLEDevice::initialized=false;assert(!configureRadioMaximum());assert(WiFi.calls==0&&preferences.writes==0);
 reset();WiFi.ok=false;assert(!configureRadioMaximum());assert(NimBLEDevice::calls==0&&preferences.writes==0);
 reset();NimBLEDevice::ok=false;assert(!configureRadioMaximum());assert(preferences.writes==0);
 reset();WiFi.mismatch=true;assert(!configureRadioMaximum());assert(preferences.writes==0);
 reset();NimBLEDevice::mismatch=true;assert(!configureRadioMaximum());assert(preferences.writes==0);
 reset();preferences.fail=true;assert(!configureRadioMaximum());
 reset();assert(configureRadioMaximum());assert(WiFi.power==80);assert(NimBLEDevice::adv==ESP_PWR_LVL_P20&&NimBLEDevice::connection==ESP_PWR_LVL_P20);assert(preferences.power==80&&preferences.ble&&preferences.writes==2);
 NimBLEDevice::adv=NimBLEDevice::connection=0;assert(preferences.getBool("bleMax",false)&&applyBleMaximumPower());assert(NimBLEDevice::adv==ESP_PWR_LVL_P20&&NimBLEDevice::connection==ESP_PWR_LVL_P20);
#else
 reset();assert(!configureRadioMaximum());assert(WiFi.calls==0&&NimBLEDevice::calls==0&&preferences.writes==0);
#endif
}
'''.replace('FUNCTIONS', function('bool applyBleMaximumPower()') + '\n' + function('bool configureRadioMaximum()'))

with tempfile.TemporaryDirectory(prefix='iah-radio-power-') as directory:
    cpp, binary = Path(directory) / 'test.cpp', Path(directory) / 'test'
    cpp.write_text(source)
    compiler = os.environ.get('CXX')
    flags = ['-std=c++17', '-Wall', '-Wextra', '-Werror', '-pedantic']
    clt = Path('/Library/Developer/CommandLineTools')
    if not compiler and (clt / 'usr/bin/clang++').exists():
        compiler = str(clt / 'usr/bin/clang++')
        flags += ['-isysroot', str(clt / 'SDKs/MacOSX.sdk'), '-nostdinc++', '-isystem', str(clt / 'SDKs/MacOSX.sdk/usr/include/c++/v1')]
    for defines in [[], ['-DCONFIG_IDF_TARGET_ESP32C3=1'], ['-DCONFIG_IDF_TARGET_ESP32S3=1']]:
        subprocess.run([compiler or 'c++', *flags, *defines, str(cpp), '-o', str(binary)], check=True)
        subprocess.run([str(binary)], check=True)
print('C3/S3 maximum radio power: idle gating, controller readback, failures, persistence and other-chip rejection passed')

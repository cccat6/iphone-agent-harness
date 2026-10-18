"""Run the installed Arduino 3.3.11 String implementation on the host.
Only unused hardware/numeric conversion entry points are stubbed. String's
constructors, assignments, allocator, move and destructor are the SDK source.
"""
from pathlib import Path
import os, shutil, subprocess, tempfile
sdk=Path(os.environ.get('ARDUINO_ESP32_CORE',Path.home()/'Library/Arduino15/packages/esp32/hardware/esp32/3.3.11/cores/esp32'))
assert sdk.joinpath('WString.cpp').is_file(), 'Arduino ESP32 3.3.11 core required'
with tempfile.TemporaryDirectory(prefix='iah-string-r4-') as tmp:
 p=Path(tmp)
 for name in ['WString.cpp','WString.h','stdlib_noniso.h']:shutil.copyfile(sdk/name,p/name)
 (p/'Arduino.h').write_text('#include <cstdio>\n#include <cstdarg>\n#include <utility>\n')
 (p/'esp32-hal-log.h').write_text('#define log_e(...) ((void)0)\n#define log_w(...) ((void)0)\n')
 (p/'pgmspace.h').write_text('#pragma once\n#include <cstring>\n#define PSTR(x) (x)\n#define memcpy_P memcpy\n')
 (p/'stubs.cpp').write_text('''#include "stdlib_noniso.h"
extern "C" {
char* itoa(int,char*s,int){return s;} char* utoa(unsigned,char*s,int){return s;}
char* ltoa(long,char*s,int){return s;} char* ultoa(unsigned long,char*s,int){return s;}
char* lltoa(long long,char*s,int){return s;} char* ulltoa(unsigned long long,char*s,int){return s;}
char* dtostrf(double,int,unsigned,char*s){return s;}
}
''')
 (p/'test.cpp').write_text('''#include "WString.h"
#include <cassert>
#include <string>
#include <utility>
#include <iostream>
struct InspectedString: String {using String::String; using String::operator=; unsigned allocated()const{return capacity();}};
int main(){
 const std::string data(12288,'x');InspectedString value(data.c_str());
 const unsigned allocated=value.allocated();assert(allocated>=12288);
 value=String();assert(value.length()==0);assert(value.allocated()==allocated);
 value=data.c_str();value=static_cast<const char*>(nullptr);assert(value.length()==0);assert(value.allocated()<128);
 value=data.c_str();{String released(std::move(value));assert(released.length()==data.size());assert(value.length()==0);assert(value.allocated()<128);}
 assert(value.allocated()<128);
 std::cout<<"Arduino String: empty move assignment retains "<<allocated<<" bytes; nullptr assignment and scoped move construction release source capacity\\n";
}
''')
 clang=Path('/Library/Developer/CommandLineTools/usr/bin/clang++')
 sysroot=Path('/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk')
 cmd=[str(clang),'-std=c++17','-fsanitize=address,undefined','-isysroot',str(sysroot),'-nostdinc++','-isystem',str(sysroot/'usr/include/c++/v1'),'-I',str(p),str(p/'WString.cpp'),str(p/'stubs.cpp'),str(p/'test.cpp'),'-o',str(p/'test')]
 subprocess.run(cmd,check=True);subprocess.run([str(p/'test')],check=True)

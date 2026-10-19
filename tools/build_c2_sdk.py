#!/usr/bin/env python3
"""Build the missing official ESP32-C2 Arduino SDK in a private cache; no device access."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import urllib.request
ROOT=Path(__file__).resolve().parents[1]
LOCK=Path(__file__).with_name('c2_sdk.lock.json')
DEFAULT_CACHE=Path.home()/'.cache/iphone-agent-harness/c2-sdk'

def digest(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def recipe():return json.loads(LOCK.read_text())
def provenance(xtal=26):return {'format':'iah-c2-sdk-build/1','recipeSha256':digest(LOCK),'bootstrapSha256':digest(__file__),'componentsLockSha256':digest(LOCK.with_name('c2_sdk.components.lock')),'repositories':recipe()['repositories'],'toolchainVersion':recipe()['toolchainVersion'],'matrix':recipe()['matrix'],'xtalMHz':xtal}
def sdk_path(cache=DEFAULT_CACHE,xtal=26):return Path(cache).expanduser().resolve()/'sdks'/('esp32c2-'+str(xtal))
def sdk_files(output):
    return {p.relative_to(output).as_posix():digest(p) for p in sorted(output.rglob('*')) if p.is_file() and p.name!='iah-sdk-provenance.json'}
def verified_sdk(cache=DEFAULT_CACHE,xtal=26):
    output=sdk_path(cache,xtal);marker=output/'iah-sdk-provenance.json'
    if not marker.is_file():raise RuntimeError('ESP32-C2 SDK is missing. Run python3 tools/build_c2_sdk.py first.')
    value=json.loads(marker.read_text())
    if value.get('recipe')!=provenance(xtal) or not value.get('files') or value['files']!=sdk_files(output):raise RuntimeError('ESP32-C2 SDK is stale or modified; rebuild it with tools/build_c2_sdk.py.')
    for name in ['sdkconfig','flags/cpp_flags','flags/ld_libs','bin/bootloader_dio_60m.elf','dio_qspi/include/sdkconfig.h','lib/libbt.a','lib/libesp_wifi.a']:
        if not (output/name).is_file():raise RuntimeError('Incomplete ESP32-C2 SDK: '+name)
    if (output/'bin/bootloader_dio_60m.elf').read_bytes()[:4]!=b'\x7fELF':raise RuntimeError('Invalid ESP32-C2 bootloader ELF')
    for name in ['lib/libbt.a','lib/libesp_wifi.a']:
        if (output/name).read_bytes()[:8]!=b'!<arch>\n':raise RuntimeError('Invalid ESP32-C2 SDK static library')
    return output

def run(command,*,cwd=None,env=None,capture=False):
    print('+ '+' '.join(map(str,command)),flush=True)
    return subprocess.run(list(map(str,command)),cwd=cwd,env=env,check=True,text=True,stdout=subprocess.PIPE if capture else None).stdout

def checkout(git,spec,destination,env,recursive=False):
    destination=Path(destination)
    if not (destination/'.git').exists():
        command=[git,'clone','--depth','1']
        if spec.get('tag'):command+=['--branch',spec['tag']]
        else:command+=['--filter=blob:none','--no-checkout']
        command += [spec['url'],str(destination)]
        run(command,env=env)
    actual=run([git,'-C',destination,'rev-parse','HEAD'],env=env,capture=True).strip()
    if actual!=spec['commit']:
        run([git,'-C',destination,'fetch','--depth','1','origin',spec['commit']],env=env)
    # This is a dedicated generated dependency cache. Always materialize the
    # pinned tree and discard tracked changes left by a previous SDK attempt.
    run([git,'-C',destination,'checkout','--detach','--force',spec['commit']],env=env)
    if recursive:run([git,'-C',destination,'submodule','update','--init','--recursive','--force','--depth','1'],env=env)
    if run([git,'-C',destination,'rev-parse','HEAD'],env=env,capture=True).strip()!=spec['commit']:raise RuntimeError('Official repository pin mismatch')

def gnu_tools(cache,env,jobs):
    if sys.platform!='darwin':return None
    prefix=cache/'gnu-prefix';binary=prefix/'bin';binary.mkdir(parents=True,exist_ok=True)
    make='/Library/Developer/CommandLineTools/usr/bin/make'
    for tool in recipe()['gnuTools']:
        executable={'sed':'gsed','gawk':'gawk','coreutils':'grealpath'}[tool['name']]
        if (binary/executable).is_file():continue
        folder=cache/'gnu-tools';folder.mkdir(exist_ok=True);archive=folder/(tool['name']+'.tar.xz')
        if not archive.is_file():urllib.request.urlretrieve(tool['url'],archive)
        if digest(archive)!=tool['sha256']:raise RuntimeError('GNU source checksum mismatch: '+tool['name'])
        source=folder/(tool['name']+'-'+tool['version'])
        if not source.is_dir():
            with tarfile.open(archive) as package:package.extractall(folder,filter='data')
        options=['--prefix='+str(prefix)]
        if tool['name']!='gawk':options+=['--program-prefix=g']
        if not (source/'Makefile').is_file():run(['./configure',*options],cwd=source,env=env)
        target=['src/realpath'] if tool['name']=='coreutils' else []
        run([make,'-j'+str(jobs),*target],cwd=source,env=env)
        if target:shutil.copyfile(source/'src/realpath',binary/executable);(binary/executable).chmod(0o755)
        else:run([make,'install'],cwd=source,env=env)
    # The builder uses only GNU realpath -m. Python's canonicalizer provides
    # the same missing-path/symlink behavior without installing global coreutils.
    canonical=binary/'grealpath'
    canonical.write_text('#!'+sys.executable+'\nimport os,sys\nargs=sys.argv[1:]\nif not args or args.pop(0)!="-m" or not args:sys.exit(2)\nfor path in args:print(os.path.realpath(path))\n')
    canonical.chmod(0o755)
    return binary

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--cache',type=Path,default=DEFAULT_CACHE);parser.add_argument('--jobs',type=int,default=2);parser.add_argument('--toolchain',type=Path);parser.add_argument('--verify-only',action='store_true');parser.add_argument('--xtal',type=int,nargs='+',choices=[26,40],default=[26,40]);args=parser.parse_args()
    cache=args.cache.expanduser().resolve()
    if args.verify_only:
        for xtal in args.xtal:print(verified_sdk(cache,xtal))
        return 0
    if any(c.isspace() for c in str(cache)):raise RuntimeError('The ESP-IDF SDK cache path must not contain spaces')
    if not 1<=args.jobs<=8:raise RuntimeError('Use 1–8 build jobs')
    expected={xtal:provenance(xtal) for xtal in args.xtal}
    needed=[]
    for xtal in args.xtal:
        try:print('Reusing verified SDK: '+str(verified_sdk(cache,xtal)))
        except (RuntimeError,json.JSONDecodeError):needed.append(xtal)
    if not needed:return 0
    cache.mkdir(parents=True,exist_ok=True);env=os.environ.copy();env.pop('GITHUB_TOKEN',None);env.pop('GITHUB_REPOSITORY_OWNER',None)
    if sys.platform=='darwin':
        env.update(DEVELOPER_DIR='/Library/Developer/CommandLineTools',SDKROOT='/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk',CC='/Library/Developer/CommandLineTools/usr/bin/clang',CXX='/Library/Developer/CommandLineTools/usr/bin/clang++')
        git='/Library/Developer/CommandLineTools/usr/bin/git';hostbin=str(Path(git).parent)
    else:git=shutil.which('git') or 'git';hostbin=str(Path(git).parent)
    env['PATH']=hostbin+os.pathsep+env.get('PATH','')
    r=recipe()['repositories'];builder=cache/'lib-builder';checkout(git,r['builder'],builder,env);checkout(git,r['idf'],builder/'esp-idf',env,recursive=True);checkout(git,r['arduino'],builder/'components/arduino',env)
    shutil.copyfile(LOCK.with_name('c2_sdk.components.lock'),builder/'dependencies.lock')
    # Only the DIO/60 MHz SDK used by this product is built; no other chips or
    # optional Arduino frameworks are generated or installed globally.
    matrix=builder/'configs/builds.json';value=json.loads(matrix.read_text());value['targets']=[recipe()['matrix']];matrix.write_text(json.dumps(value,indent=2)+'\n')
    # This pinned upstream commit documents and implements -n but omits it
    # from getopts. Enable that existing option; no SDK source is changed.
    entry=builder/'build.sh';script=entry.read_text();script=script.replace('getopts ":A:I:i:c:t:b:D:sde"','getopts ":A:I:i:c:t:b:D:sden"');entry.write_text(script)
    tools=gnu_tools(cache,env,args.jobs)
    python_env=cache/'python-env';python_env.mkdir(exist_ok=True)
    env.update(IDF_PATH=str(builder/'esp-idf'),IDF_PYTHON_ENV_PATH=str(python_env),IDF_TOOLS_PATH=str(cache/'idf-tools'),IDF_TARGET='esp32c2',CHIP_VARIANT='esp32c2',CMAKE_BUILD_PARALLEL_LEVEL=str(args.jobs))
    python=python_env/('Scripts/python.exe' if os.name=='nt' else 'bin/python')
    if not python.is_file():run([sys.executable,builder/'esp-idf/tools/idf_tools.py','install-python-env','--features','core'],env=env)
    constraints=cache/'idf-tools/espidf.constraints.v5.5.txt';constraints.parent.mkdir(parents=True,exist_ok=True)
    if not constraints.is_file():urllib.request.urlretrieve(recipe()['constraints']['url'],constraints)
    if digest(constraints)!=recipe()['constraints']['sha256']:raise RuntimeError('ESP-IDF Python constraints changed; update the pinned recipe explicitly')
    # Prefer the exact official compiler already installed by Boards Manager.
    base=Path.home()/('Library/Arduino15' if sys.platform=='darwin' else '.arduino15')/'packages/esp32/tools/esp-rv32/2601'
    compiler=args.toolchain or base
    if not (compiler/'bin/riscv32-esp-elf-gcc').is_file():
        run([python,builder/'esp-idf/tools/idf_tools.py','install','riscv32-esp-elf'],env=env)
        compiler=cache/'idf-tools/tools/riscv32-esp-elf'/recipe()['toolchainVersion']/'riscv32-esp-elf'
    version=run([compiler/'bin/riscv32-esp-elf-gcc','--version'],env=env,capture=True)
    if recipe()['toolchainVersion'] not in version:raise RuntimeError('Unexpected ESP32-C2 compiler version')
    env['PATH']=os.pathsep.join(str(p) for p in [python.parent,compiler/'bin',builder/'esp-idf/tools',tools or hostbin,hostbin])+os.pathsep+env['PATH']
    original=(builder/'configs/defconfig.esp32c2').read_text()
    for xtal in needed:
        config=original if xtal==26 else original.replace('CONFIG_XTAL_FREQ_26=y','CONFIG_XTAL_FREQ_40=y').replace('CONFIG_XTAL_FREQ=26','CONFIG_XTAL_FREQ=40')
        (builder/'configs/defconfig.esp32c2').write_text(config)
        print('Building official ESP32-C2 SDK for '+str(xtal)+' MHz crystal',flush=True)
        run(['bash','./build.sh','-s','-n','-t','esp32c2'],cwd=builder,env=env)
        if provenance(xtal)!=expected[xtal]:raise RuntimeError('SDK recipe changed while compiling; refuse to label this output as current')
        if (builder/'dependencies.lock').read_bytes()!=LOCK.with_name('c2_sdk.components.lock').read_bytes():raise RuntimeError('SDK component resolution changed from the committed lock')
        built=builder/'out/tools/esp32-arduino-libs/esp32c2';output=sdk_path(cache,xtal);output.parent.mkdir(exist_ok=True,parents=True)
        pending=output.with_name(output.name+'.new')
        if pending.exists():shutil.rmtree(pending)
        shutil.copytree(built,pending)
        (pending/'iah-sdk-provenance.json').write_text(json.dumps({'recipe':expected[xtal],'files':sdk_files(pending)},indent=2)+'\n')
        if output.exists():shutil.rmtree(output)
        pending.rename(output);print('SDK ready: '+str(verified_sdk(cache,xtal)),flush=True)
    return 0

if __name__=='__main__':
    try:raise SystemExit(main())
    except (RuntimeError,OSError,subprocess.CalledProcessError) as error:raise SystemExit(str(error))

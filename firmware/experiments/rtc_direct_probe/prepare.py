#!/usr/bin/env python3
"""Stage the isolated probe with an explicitly supplied test certificate; never flash."""
import argparse, hashlib, json, os, shutil, subprocess
from pathlib import Path
source=Path(__file__).resolve().parent
root=source.parents[2]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--cert',type=Path,required=True)
parser.add_argument('--key',type=Path,required=True)
args=parser.parse_args()
cert=args.cert.resolve();key=args.key.resolve()
cert_public=subprocess.check_output(['openssl','x509','-in',str(cert),'-pubkey','-noout'])
key_public=subprocess.check_output(['openssl','pkey','-in',str(key),'-pubout'])
if cert_public!=key_public:raise SystemExit('Certificate and test key do not match')
fingerprint=subprocess.check_output(['openssl','x509','-in',str(cert),'-fingerprint','-sha256','-noout'],text=True).strip().split('=',1)[1]
staging=root/'build/rtc-c3/rtc_direct_probe'
staging.mkdir(parents=True,exist_ok=True)
allow=['main.cpp','rtc_direct_probe.ino','src/config.h','src/dtls_srtp.h','src/sctp.c','src/sctp.h','src/utils.h','src/ProbeMessage.h']
for name in allow:
 destination=staging/name;destination.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source/name,destination)
private=staging/'config.local.h'
fd=os.open(private,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600);os.fchmod(fd,0o600)
with os.fdopen(fd,'w') as stream:
 stream.write('#pragma once\nstatic const char RTC_CERT[]=R"RTC('+cert.read_text()+')RTC";\nstatic const char RTC_KEY[]=R"RTC('+key.read_text()+')RTC";\n')
record={'upstream':'sepfy/libpeer@5b849de378545c31d34759a145413846953e1366','sourceFiles':{name:hashlib.sha256((source/name).read_bytes()).hexdigest() for name in allow},'certificateFingerprint':fingerprint,'serialPortsOpened':False}
(root/'build/rtc-c3/source.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps({'staging':str(staging),'certificateFingerprint':fingerprint,'sourceFiles':len(allow)}))

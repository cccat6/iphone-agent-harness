#!/usr/bin/env python3
"""Reject a mixed 2 KiB project TLS / precompiled SDK TLS link; no device access."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[1]
TLS_UNITS=('debug.c','mps_reader.c','mps_trace.c','ssl_cache.c','ssl_ciphersuites.c','ssl_client.c','ssl_cookie.c','ssl_debug_helpers_generated.c','ssl_msg.c','ssl_ticket.c','ssl_tls.c','ssl_tls12_client.c','ssl_tls12_server.c','ssl_tls13_keys.c','ssl_tls13_server.c','ssl_tls13_client.c','ssl_tls13_generic.c','mbedtls_debug.c','esp_platform_time.c','net_sockets.c')
CRITICAL={
 'mbedtls_ssl_setup':'ssl_tls.c', 'mbedtls_ssl_handshake':'ssl_tls.c',
 'mbedtls_ssl_session_reset':'ssl_tls.c', 'mbedtls_ssl_read':'ssl_msg.c',
 'mbedtls_ssl_write':'ssl_msg.c', 'mbedtls_ssl_cookie_check':'ssl_cookie.c',
 'mbedtls_ssl_handshake_server_step':'ssl_tls12_server.c',
 'mbedtls_ssl_handshake_client_step':'ssl_tls12_client.c',
}

def verify_tls_link(build:Path,source:Path|None=None):
 build=Path(build);source=source or ROOT/'firmware/IPhoneAutomationHarness/src/RtcTls'
 config=(source/'RtcTlsConfig.h').read_text()
 for direction in ('IN','OUT'):
  if not re.search(r'(?m)^#define\s+MBEDTLS_SSL_'+direction+r'_CONTENT_LEN\s+2048\s*$',config):
   raise RuntimeError('RTC TLS record profile must be uniformly 2048 bytes')
 for name in TLS_UNITS:
  if not (source/name).read_bytes().startswith(b'#include "RtcTlsConfig.h"\n'):
   raise RuntimeError('RTC TLS unit does not load the uniform profile first: '+name)
  obj=build/'sketch/src/RtcTls'/(name+'.o')
  if not obj.is_file() or obj.stat().st_size==0:
   raise RuntimeError('Missing project TLS object: '+name)
 maps=list(build.glob('*.map'))
 if len(maps)!=1:raise RuntimeError('Exactly one linker map is required for RTC TLS verification')
 raw=maps[0].read_bytes();text=raw.decode('utf-8',errors='replace').replace('\\','/')
 sdk=sorted(set(re.findall(r'libmbedtls_\d+\.a\(([^)]+)\)',text)))
 sdk+=sorted(set(re.findall(r'libmbedtls\.a\((ssl_[^)]+)\)',text)))
 if sdk:raise RuntimeError('Precompiled SDK TLS members were linked: '+', '.join(sdk))
 owners={}
 lines=text.splitlines()
 for index,line in enumerate(lines[:-1]):
  section=line.strip()
  if not section.startswith('.text.') or section[6:] not in CRITICAL:continue
  fields=lines[index+1].strip().split(None,2)
  if len(fields)!=3:continue
  try:address=int(fields[0],16)
  except ValueError:continue
  if address:owners.setdefault(section[6:],[]).append(fields[2])
 for symbol,unit in CRITICAL.items():
  # Require a live (nonzero-address) code section, not a discarded symbol or LOAD.
  expected=('/sketch/src/RtcTls/'+unit+'.o','/sketch/src/RtcTls/objs.a('+unit+'.o)')
  if not any(owner.endswith(expected) for owner in owners.get(symbol,[])):
   raise RuntimeError('RTC TLS live symbol is not owned by the project: '+symbol)

 return {'recordContentBytes':2048,'tlsUnitsCompiled':len(TLS_UNITS),'sdkTlsMembers':[],
         'verifiedLiveSymbols':list(CRITICAL),'linkMapSha256':hashlib.sha256(raw).hexdigest()}

if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('build',type=Path)
 parser.add_argument('--source',type=Path)
 parser.add_argument('--output',type=Path)
 args=parser.parse_args()
 try:
  result=verify_tls_link(args.build,args.source)
  if args.output:args.output.write_text(json.dumps(result,indent=2)+'\n')
  print(json.dumps(result))
 except (RuntimeError,OSError) as error:
  raise SystemExit(str(error))

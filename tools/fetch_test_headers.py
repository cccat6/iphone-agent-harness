#!/usr/bin/env python3
"""Fetch checksum-pinned upstream test headers; no runtime installation."""
from pathlib import Path
from urllib.request import urlopen
from hashlib import sha256
ROOT=Path(__file__).resolve().parents[1]
ASSETS={
 'ArduinoJson.h':('https://github.com/bblanchon/ArduinoJson/releases/download/v7.4.3/ArduinoJson-v7.4.3.h','ab5fbb8268b846b5f4bc5a5fee11bb2c96f7b8b846f5bef6540afb6a9cc76a5b'),
 'ArduinoJson.hpp':('https://github.com/bblanchon/ArduinoJson/releases/download/v7.4.3/ArduinoJson-v7.4.3.hpp','cd13d649671a44d5bd727f1cf9429bc4658b644676bc7b953f17535c044946ac'),
}
def main():
 target=ROOT/'build/test-headers';target.mkdir(parents=True,exist_ok=True)
 for name,(url,expected) in ASSETS.items():
  path=target/name
  if path.exists() and sha256(path.read_bytes()).hexdigest()==expected:continue
  with urlopen(url,timeout=45) as response:data=response.read(2000001)
  if len(data)>2000000 or sha256(data).hexdigest()!=expected:raise RuntimeError('Upstream header checksum mismatch')
  temporary=path.with_suffix('.tmp');temporary.write_bytes(data);temporary.replace(path)
 print('Verified ArduinoJson 7.4.3 test headers (2 SHA-256 checks)')
if __name__=='__main__':main()

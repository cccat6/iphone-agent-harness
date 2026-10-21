#!/usr/bin/env python3
"""Copy the immutable firmware Release date into the static installer metadata."""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import firmware_release as releases


def publication(manifest, metadata, manifest_bytes):
    if metadata.get('draft') or not metadata.get('published_at'):
        raise ValueError('Firmware Release is not published')
    timestamp=datetime.fromisoformat(metadata['published_at'].replace('Z','+00:00'))
    if timestamp.tzinfo is None:
        raise ValueError('Release date must include a timezone')
    asset=next((a for a in metadata.get('assets',[]) if a.get('name')=='manifest.json'),None)
    expected='sha256:'+hashlib.sha256(manifest_bytes).hexdigest()
    if not asset or asset.get('digest')!=expected:
        raise ValueError('Published firmware manifest does not match the installer')
    return {'schemaVersion':1,'firmwareVersion':manifest['firmwareVersion'],'buildId':manifest['buildId'],
            'publishedAt':timestamp.astimezone(timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z')}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repository',default='cccat6/iphone-agent-harness')
    args=parser.parse_args()
    root=Path(__file__).resolve().parents[1]
    folder=root/'apps/web/firmware'
    tag='firmware-'+releases.key(json.loads((folder/'build-inputs.json').read_text()))
    metadata=releases.release(args.repository,tag)
    raw=(folder/'manifest.json').read_bytes()
    value=publication(json.loads(raw),metadata or {},raw)
    encoded=json.dumps(value,indent=2)+'\n'
    (root/'apps/web/firmware-publication.json').write_text(encoded)
    site=root/'build/site'
    if (site/'index.html').is_file():
        (site/'firmware-publication.json').write_text(encoded)
    print('Firmware publication metadata: '+value['publishedAt'])

if __name__=='__main__':main()

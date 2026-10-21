#!/usr/bin/env python3
"""Render the approved vector mark into browser and installed-app icons."""
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'design/logo-a/iphone-agent-harness-a.svg'
ICONS = ROOT / 'apps/web/icons'

def build():
    renderer = shutil.which('rsvg-convert')
    if not renderer:
        raise SystemExit('Install librsvg to regenerate the brand icons (rsvg-convert).')
    svg = SOURCE.read_text()
    ET.fromstring(svg)
    for target in (ICONS/'logo.svg', ICONS/'icon.svg', ROOT/'docs/media/logo.svg'):
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(svg)
    body = svg[svg.index('>')+1:svg.rfind('</svg>')]
    def plate(padding, rounded=False):
        size = 512-2*padding
        return ('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">'
            '<title>iPhone Agent Harness</title>'
            f'<rect width="512" height="512" rx="{96 if rounded else 0}" fill="#fffaf7"/>'
            f'<svg x="{padding}" y="{padding}" width="{size}" height="{size}" viewBox="128 58 410 410">{body}</svg></svg>\n')
    (ROOT/'docs/media/logo-card.svg').write_text(plate(32, rounded=True))
    (ICONS/'favicon.svg').write_text(plate(24, rounded=True))
    (ICONS/'maskable.svg').write_text(plate(64))
    with tempfile.TemporaryDirectory(prefix='iah-brand-') as temp:
        app_source = Path(temp)/'app.svg'
        app_source.write_text(plate(32))
        for size in (192,512):
            subprocess.run([renderer,'-w',str(size),'-h',str(size),'-o',str(ICONS/f'icon-{size}.png'),str(app_source)],check=True)
        subprocess.run([renderer,'-w','180','-h','180','-o',str(ICONS/'apple-touch-icon.png'),str(app_source)],check=True)
    subprocess.run([renderer,'-w','512','-h','512','-o',str(ICONS/'maskable-512.png'),str(ICONS/'maskable.svg')],check=True)
    images=[]
    for size in (16,32,48,64):
        path=ICONS/f'favicon-{size}.png'
        subprocess.run([renderer,'-w',str(size),'-h',str(size),'-o',str(path),str(ICONS/'favicon.svg')],check=True)
        images.append((size,path.read_bytes()))
    offset=6+16*len(images)
    entries=[]
    for size,data in images:
        entries.append(struct.pack('<BBBBHHII',size,size,0,0,1,32,len(data),offset))
        offset+=len(data)
    (ROOT/'apps/web/favicon.ico').write_bytes(struct.pack('<HHH',0,1,len(images))+b''.join(entries)+b''.join(data for _,data in images))
    print('Brand assets rendered: SVG, four ICO sizes, Apple Touch, PWA and maskable PNGs.')

if __name__ == '__main__':
    build()

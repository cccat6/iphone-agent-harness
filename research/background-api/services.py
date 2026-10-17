#!/usr/bin/env python3
"""Start/stop only this probe's processes; process identity checked before signal."""
import argparse, json, os, re, signal, subprocess, time
from pathlib import Path
ROOT=Path(__file__).resolve().parent
STATE=ROOT/'processes.local.json'

def start():
    if STATE.exists():
        old=json.loads(STATE.read_text())
        for row in old.get('processes',[]):
            cmd=subprocess.run(['ps','-p',str(row['pid']),'-o','command='],capture_output=True,text=True).stdout
            if row['identity'] in cmd: raise SystemExit('existing probe process; stop before starting')
    rows=[]
    specs=[('server',['python3',str(ROOT/'server.py'),'--port','18728'],str(ROOT/'server.py')),('tunnel',['/usr/local/bin/cloudflared','tunnel','--url','http://127.0.0.1:18728','--no-autoupdate'],'cloudflared tunnel --url http://127.0.0.1:18728')]
    for name,args,identity in specs:
        with (ROOT/(name+'.local.log')).open('w') as log:
            p=subprocess.Popen(args,cwd=ROOT,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
        rows.append({'name':name,'pid':p.pid,'args':args,'identity':identity})
    value={'started_at':time.time(),'processes':rows,'state':'starting'}
    STATE.write_text(json.dumps(value,indent=2))
    for _ in range(120):
        text=(ROOT/'tunnel.local.log').read_text()
        hit=re.search(r'https://[a-z0-9-]+\.trycloudflare\.com',text)
        if hit and (ROOT/'probe-token.local.json').exists():
            token=json.loads((ROOT/'probe-token.local.json').read_text())['token']
            value.update(url=hit.group(0)+'/'+token+'/',state='running');STATE.write_text(json.dumps(value,indent=2));print(json.dumps({'url':value['url'],'pids':[x['pid'] for x in rows]}));return
        time.sleep(.25)
    raise SystemExit('tunnel did not produce URL; inspect logs then stop')

def stop():
    value=json.loads(STATE.read_text())
    for row in value.get('processes',[]):
        cmd=subprocess.run(['ps','-p',str(row['pid']),'-o','command='],capture_output=True,text=True).stdout
        if row['identity'] in cmd: os.kill(row['pid'],signal.SIGTERM)
    time.sleep(.3)
    value['state']='stopped';value['stopped_at']=time.time();STATE.write_text(json.dumps(value,indent=2));print('stopped matching probe services')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=['start','stop']);args=parser.parse_args()
    start() if args.action=='start' else stop()

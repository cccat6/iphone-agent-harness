export class DeviceClient {
  constructor({baseUrl,fetchImpl=fetch}){this.baseUrl=new URL(baseUrl);this.fetchImpl=fetchImpl;this.bindingVerified=false;}
  async get(path){const r=await this.fetchImpl(new URL(path,this.baseUrl),{cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(8000)});if(!r.ok)throw new Error(`设备请求失败（${r.status}）`);return r.json();}
  identity(){return this.get('/v1/identity');}
  capabilities(){return this.get('/v1/capabilities');}
  async clockSync(samples=3){
    const results=[];for(let i=0;i<samples;i++){const start=performance.now(),value=await this.get('/v1/clock'),end=performance.now();if(typeof value.deviceTimeMs!=='number'||!value.bootId)throw new Error('设备时钟响应无效');results.push({bootId:value.bootId,offsetMs:value.deviceTimeMs-(start+end)/2,rttMs:end-start,uncertaintyMs:(end-start)/2});}
    if(new Set(results.map(r=>r.bootId)).size!==1)throw new Error('校时过程中设备重启，请重新连接');return results.sort((a,b)=>a.rttMs-b.rttMs)[0];
  }
}

// Portable device-code state and refresh handling. Provider endpoints and a
// registered public client are configuration, not borrowed Codex credentials.
export class DeviceCodeAuth {
  constructor({clientId,userCodeUrl,pollUrl,tokenUrl,verificationUrl,fetchImpl=fetch}){Object.assign(this,{clientId,userCodeUrl,pollUrl,tokenUrl,verificationUrl,fetchImpl});this.tokens=null;this.refreshing=null;}
  async post(url,body,signal,form=false){const r=await this.fetchImpl(url,{method:'POST',headers:{'content-type':form?'application/x-www-form-urlencoded':'application/json'},body:form?new URLSearchParams(body):JSON.stringify(body),signal,credentials:'omit',referrerPolicy:'no-referrer'});let data={};try{data=await r.json();}catch{}return {status:r.status,ok:r.ok,data};}
  async start(signal){if(!this.clientId||!this.userCodeUrl)throw new Error('设备码登录尚未配置可验证的 OAuth 客户端');const r=await this.post(this.userCodeUrl,{client_id:this.clientId},signal);if(!r.ok||!r.data.device_auth_id||!r.data.user_code)throw new Error(`设备码入口不可用（${r.status}）；尚未证明该入口支持此网页`);return {...r.data,verification_url:r.data.verification_url||this.verificationUrl};}
  async poll(device,signal,{maxWaitMs=900000,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
    const until=Date.now()+maxWaitMs;
    while(Date.now()<until){if(signal?.aborted)throw signal.reason;const r=await this.post(this.pollUrl,{device_auth_id:device.device_auth_id,user_code:device.user_code},signal);
      if(r.ok){if(!r.data.authorization_code||!r.data.code_verifier)throw new Error('设备码兑换结果不完整');const token=await this.post(this.tokenUrl,{grant_type:'authorization_code',client_id:this.clientId,code:r.data.authorization_code,code_verifier:r.data.code_verifier,redirect_uri:new URL('/deviceauth/callback',this.tokenUrl).href},signal,true);if(!token.ok)throw new Error(`登录令牌兑换失败（${token.status}）`);this.accept(token.data);return this.tokens;}
      if(![403,404,428,429].includes(r.status))throw new Error(`设备码轮询失败（${r.status}）`);await wait(Math.max(1000,Number(device.interval||5)*1000));
    }throw new Error('设备码已超时');
  }
  accept(tokens){if(!tokens.access_token)throw new Error('缺少访问令牌');this.tokens={...tokens,refresh_token:tokens.refresh_token||this.tokens?.refresh_token,expiresAt:Date.now()+Number(tokens.expires_in||3600)*1000};}
  async accessToken(signal){if(!this.tokens)throw new Error('尚未登录');if(this.tokens.expiresAt>Date.now()+60000)return this.tokens.access_token;
    if(!this.tokens.refresh_token)throw new Error('登录已到期，请重新登录');
    if(!this.refreshing)this.refreshing=(async()=>{const r=await this.post(this.tokenUrl,{grant_type:'refresh_token',client_id:this.clientId,refresh_token:this.tokens.refresh_token},signal,true);if(!r.ok)throw new Error(`登录刷新失败（${r.status}）`);this.accept(r.data);return this.tokens.access_token;})().finally(()=>{this.refreshing=null;});return this.refreshing;
  }
  logout(){this.tokens=null;}
}

// Optional local encrypted persistence: the passphrase is never stored.
export async function sealCredentials(value,passphrase){if(!passphrase)throw new Error('需要解锁口令');const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),key=await derive(passphrase,salt);const bytes=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(value)));return {version:1,salt:[...salt],iv:[...iv],data:[...new Uint8Array(bytes)]};}
export async function unsealCredentials(value,passphrase){if(value?.version!==1)throw new Error('不支持的凭据格式');const key=await derive(passphrase,new Uint8Array(value.salt));const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(value.iv)},key,new Uint8Array(value.data));return JSON.parse(new TextDecoder().decode(bytes));}
async function derive(passphrase,salt){const raw=await crypto.subtle.importKey('raw',new TextEncoder().encode(passphrase),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:210000,hash:'SHA-256'},raw,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}

export const LIMITS=Object.freeze({packageBytes:400000,files:40,fileBytes:100000});
export class CommunityError extends Error{constructor(code){super(code);this.name='CommunityError';this.code=code;}}
export const fail=code=>{throw new CommunityError(code);};
export function canonical(value){if(value===null||typeof value==='boolean'||typeof value==='string')return JSON.stringify(value);if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&Object.getPrototypeOf(value)===Object.prototype)return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';fail('INVALID_PAYLOAD');}
export const bytes=value=>new TextEncoder().encode(typeof value==='string'?value:canonical(value));
export async function digest(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export const to64=value=>btoa(String.fromCharCode(...new Uint8Array(value)));
export const from64=value=>{try{return Uint8Array.from(atob(value),c=>c.charCodeAt(0));}catch{fail('INVALID_PAYLOAD');}};
export function publicJwk(value){if(value?.kty!=='EC'||value.crv!=='P-256'||typeof value.x!=='string'||typeof value.y!=='string'||value.d)fail('INVALID_IDENTITY');return {kty:'EC',crv:'P-256',x:value.x,y:value.y};}
export const creatorIdFor=key=>digest(publicJwk(key));
export function validateSlug(slug){if(typeof slug!=='string'||!(/^[a-z0-9][a-z0-9-]{0,63}$/).test(slug))fail('INVALID_SLUG');return slug;}
function only(value,allowed){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!allowed.includes(k)))fail('INVALID_PAYLOAD');}
export function validatePackage(value){
 only(value,['format','creatorId','slug','name','description','version','files']);if(value.format!=='iah-skill/1'||!(/^[a-f0-9]{64}$/).test(value.creatorId))fail('INVALID_PACKAGE');validateSlug(value.slug);
 if(typeof value.name!=='string'||!value.name.trim()||value.name.length>120||typeof value.description!=='string'||value.description.length>2000||!(/^\d{1,6}\.\d{1,6}\.\d{1,6}$/).test(value.version))fail('INVALID_PACKAGE');
 if(!value.files||typeof value.files!=='object'||Array.isArray(value.files)||Object.keys(value.files).length>LIMITS.files||(typeof value.files['SKILL.md']!=='string'||!value.files['SKILL.md'].trim()))fail('INVALID_FILES');
 for(const [path,text]of Object.entries(value.files)){if(path.length>180||!/^[-A-Za-z0-9_/]+\.(md|json)$/.test(path)||path.startsWith('/')||path.includes('..')||path.includes('//')||typeof text!=='string')fail('INVALID_PATH');if(bytes(text).length>LIMITS.fileBytes)fail('PACKAGE_TOO_LARGE');}
 if(bytes(value).length>LIMITS.packageBytes)fail('PACKAGE_TOO_LARGE');return value;
}
export async function verifyEnvelope(envelope,{audience,now=Date.now(),fresh=false}={}){
 only(envelope,['publicKey','signature','payload']);only(envelope.publicKey,['kty','crv','x','y']);const key=publicJwk(envelope.publicKey),payload=envelope.payload;
 only(payload,['format','action','audience','creatorId','nonce','issuedAt','expiresAt','expectedRevision','previousDigest','package']);
 if(payload.format!=='iah-publication/1'||payload.action!=='publish'||typeof payload.audience!=='string'||payload.creatorId!==await creatorIdFor(key)||payload.creatorId!==payload.package?.creatorId||!(/^[a-zA-Z0-9_-]{20,100}$/).test(payload.nonce)||!Number.isInteger(payload.expectedRevision)||payload.expectedRevision<0||payload.expectedRevision>1000000000||typeof payload.previousDigest!=='string'||!/^([a-f0-9]{64})?$/.test(payload.previousDigest)||!Number.isFinite(payload.issuedAt)||!Number.isFinite(payload.expiresAt))fail('INVALID_PUBLICATION');
 if(audience&&payload.audience!==audience)fail('AUDIENCE_MISMATCH');if(fresh&&(payload.issuedAt>now+30000||payload.expiresAt<now||payload.expiresAt-payload.issuedAt>300000||payload.expiresAt<=payload.issuedAt))fail('PUBLICATION_EXPIRED');
 validatePackage(payload.package);
 try{const imported=await crypto.subtle.importKey('jwk',key,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},imported,from64(envelope.signature),bytes(payload)))fail('BAD_SIGNATURE');}catch(e){if(e.code)throw e;fail('BAD_SIGNATURE');}
 return {creatorId:payload.creatorId,package:payload.package,digest:await digest(payload.package),revision:payload.expectedRevision+1};
}

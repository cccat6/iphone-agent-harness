// Uses the product module, never prints credentials or generation output.
import {readFile} from 'node:fs/promises';
import {discoverModels} from '../apps/web/core/providers.js';
const config=JSON.parse(await readFile(new URL('../research/background-api/credentials.local.json',import.meta.url),'utf8'));
if(!config.key)throw new Error('Missing local test credential');
for(const protocol of ['openai','anthropic']){
 try{const models=await discoverModels({protocol,baseUrl:protocol==='openai'?'https://api.deepseek.com':'https://api.deepseek.com/anthropic',credential:config.key});console.log(JSON.stringify({protocol,modelIds:models.map(m=>m.id)}));}
 catch(e){console.error(JSON.stringify({protocol,error:'model_catalog_request_failed'}));process.exitCode=1;}
}

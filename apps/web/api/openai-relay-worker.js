import {serveOpenAIRelay} from './openai-relay.js';
export default {fetch(request,env){return serveOpenAIRelay(request,{allowedOrigins:env.ALLOWED_ORIGINS});}};

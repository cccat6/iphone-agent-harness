// Only these transport facts may reach local events. Never preserve arbitrary
// exception text, URLs, response content, request bodies, or credentials.
export function safeNetworkDiagnostics(value){
 if(!value||!['awaiting_response_headers','reading_response_stream'].includes(value.phase)||!Number.isInteger(value.attempts)||value.attempts<1||value.attempts>6||!Number.isFinite(value.durationMs)||value.durationMs<0||value.durationMs>3600000||!['TypeError','NetworkError','Error'].includes(value.errorName)||!(value.online===null||typeof value.online==='boolean')||!['visible','hidden','prerender','unknown'].includes(value.visibility))return null;
 return {phase:value.phase,attempts:value.attempts,durationMs:Math.round(value.durationMs),errorName:value.errorName,online:value.online,visibility:value.visibility,...(typeof value.recovered==='boolean'?{recovered:value.recovered}:{})};
}

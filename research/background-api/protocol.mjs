// Shared by browser and Node protocol verification. Never logs response content.
export class RecordDecoder {
  constructor(format, onRecord) { this.format = format; this.onRecord = onRecord; this.decoder = new TextDecoder(); this.pending = ''; this.done = false; this.records = 0; }
  push(bytes) { this.pending += this.decoder.decode(bytes, {stream:true}); this.drain(false); }
  finish() { this.pending += this.decoder.decode(); this.drain(true); if (this.pending.trim()) throw new Error('truncated-record'); if (!this.done) throw new Error('missing-terminal-marker'); }
  drain(final) {
    if (this.format === 'ndjson') {
      let i; while ((i=this.pending.indexOf('\n'))>=0) { const raw=this.pending.slice(0,i).trim(); this.pending=this.pending.slice(i+1); if(raw) this.parse(raw); }
      return;
    }
    let match; while ((match=/\r?\n\r?\n/.exec(this.pending))) {
      const block=this.pending.slice(0,match.index); this.pending=this.pending.slice(match.index+match[0].length);
      const data=block.split(/\r?\n/).filter(x=>x.startsWith('data:')).map(x=>x.slice(5).replace(/^ /,'')).join('\n');
      if(data) this.parse(data);
    }
  }
  parse(raw) {
    if(raw==='[DONE]') { this.done=true; this.onRecord({done:true}); return; }
    const value=JSON.parse(raw); this.records++;
    if(value.done===true || value.type==='message_stop' || value.type==='response.completed') this.done=true;
    this.onRecord({done:this.done, value});
  }
}

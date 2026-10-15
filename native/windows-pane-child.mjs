// This fixed launcher waits for stdin. The parent assigns its Windows job before
// sending anything; no Sim module or ACL helper loads before that assignment.
let size=0;const parts=[];
for await(const part of process.stdin){size+=part.length;if(size>65536)throw Error('Pane request exceeds 64 KiB.');parts.push(part);}
try{if(!size)throw Error('Pane request is required before Sim loads.');const {readPane}=await import('../tools/sim-view.mjs');await readPane(Buffer.concat(parts));}
catch{process.stderr.write('Native Sim pane reader unavailable.\n');process.exitCode=1;}

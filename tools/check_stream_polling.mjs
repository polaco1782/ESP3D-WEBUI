import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const base = new URL("../src/", import.meta.url);
const mod=async p=>import('data:text/javascript;base64,'+Buffer.from(readFileSync(new URL(p, base))).toString('base64'));
const {StreamPollingGuard}=await mod('hooks/streamPollingGuard.js');
const {httpAdapter}=await mod('adapters/httpAdapter.js');
let xhr;
globalThis.XMLHttpRequest=class {
 constructor(){xhr=this;this.upload={addEventListener(){}};this.responseType='';}
 addEventListener(){} open(){} setRequestHeader(){} send(){}
 get responseText(){if(this.responseType==='blob')throw Error('InvalidStateError');return 'Marlin stream owns printer connection; use ESP701';}
};
let req=httpAdapter('http://printer/command');
xhr.status=409; xhr.statusText='Conflict'; xhr.onload();
let details;try{await req.response}catch(e){details=e}
assert.equal(details.code,409);
const g=new StreamPollingGuard();
assert.equal(g.command('M105'),'M105');
assert.equal(g.failure('M105',details),true);
assert.equal(g.command('M105'),'[ESP701]json=yes');
assert.equal(g.command('M114'),'[ESP701]json=yes');
assert.equal(g.command('[ESP420]'),'[ESP420]');
for(const state of ['processing','pausing','pause','cancelling']){
 g.success('[ESP701]json=yes',JSON.stringify({cmd:'701',status:'ok',data:{status:state}}));
 assert.equal(g.command('M105'),'[ESP701]json=yes');
}
g.success('[ESP701]json=yes',JSON.stringify({cmd:'701',status:'error',data:{status:'no stream',code:'4'}}));
assert.equal(g.command('M105'),'[ESP701]json=yes');
g.success('[ESP701]json=yes','garbage');
assert.equal(g.command('M105'),'[ESP701]json=yes');
g.success('[ESP701]json=yes',JSON.stringify({cmd:'701',status:'ok',data:{status:'no stream',diagnostics:{error:0}}}));
assert.equal(g.command('M105'),'M105');
g.failure('M105',details);
g.success('[ESP701]json=yes',JSON.stringify({cmd:'701',status:'ok',data:'no stream'}));
assert.equal(g.command('M105'),'M105');
for(const error of [{code:409,responseText:'different conflict'},{code:500,responseText:details.responseText},{code:401},undefined]){
 assert.equal(g.failure('M105',error),false);
 assert.equal(g.command('M105'),'M105');
}
assert.equal(g.failure('[ESP701]',details),false);
req=httpAdapter('http://printer/download',{id:'download-test'});
xhr.status=409;xhr.statusText='Conflict';xhr.onload();
await assert.rejects(req.response,e=>e.code===409 && e.responseText===undefined);
console.log('PASS: actual HTTP error propagation, polling suppression, stream-status probes, fault lock, automatic resume, unrelated errors, binary downloads');

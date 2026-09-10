// Run one screening harness (geometry.ts or extremes.ts) for every generator, two at a time,
// each in its own Node process with a time limit. Resumable: generators whose previous batch
// record exited 0 are skipped; a partial JSONL from an interrupted run is kept as *.partial.jsonl.
//   node --import ./tests/register.mjs planning/box50-review-2026-09-09/expanded/batch.mjs <before|after> <geometry|extremes> [id ...]
import {spawn} from 'node:child_process'
import {generators} from '../../../src/patterns/index.ts'
import {writeFileSync,readFileSync,existsSync,renameSync} from 'node:fs'
const phase=process.argv[2]??'before',kind=process.argv[3]??'geometry',root=`planning/box50-review-2026-09-09/expanded/${phase}/`
const only=process.argv.slice(4)
const batchFile=`${root}${kind}-batch.json`
const previous=existsSync(batchFile)?JSON.parse(readFileSync(batchFile,'utf8')):[]
const done=new Set(previous.filter(r=>r.code===0&&!only.includes(r.id)).map(r=>r.id))
const queue=generators.map(g=>g.id).filter(id=>(only.length?only.includes(id):true)&&!done.has(id))
const results=previous.filter(r=>done.has(r.id))
console.log(kind,phase,`${done.size} already complete, ${queue.length} to run:`,queue.join(' '))
for(const id of queue){const f=`${root}${kind}-${id}.jsonl`;if(existsSync(f))renameSync(f,`${root}${kind}-${id}.partial.jsonl`)}
async function worker(){while(queue.length){const id=queue.shift();const started=Date.now();const result=await new Promise(resolve=>{
const child=spawn(process.execPath,['--import','./tests/register.mjs',`planning/box50-review-2026-09-09/expanded/${kind}.ts`,phase,id],{windowsHide:true,stdio:['ignore','pipe','pipe']});let log='';child.stdout.on('data',d=>{log+=d});child.stderr.on('data',d=>{log+=d});const timer=setTimeout(()=>child.kill(),kind==='geometry'?240000:180000);child.on('exit',(code,signal)=>{clearTimeout(timer);writeFileSync(`${root}${kind}-${id}.log`,log);const path=`${root}${kind}-${id}-current.json`;resolve({id,code,signal,ms:Date.now()-started,last:existsSync(path)?JSON.parse(readFileSync(path,'utf8')):null})})});results.push(result);console.log(kind,id,result.code,result.signal,`${(result.ms/1000).toFixed(0)}s`);writeFileSync(batchFile,JSON.stringify(results,null,2))}}
await Promise.all([worker(),worker()])
const failed=results.filter(r=>r.code!==0)
console.log(kind,phase,'finished:',results.length,'records,',failed.length,'not exited 0:',failed.map(r=>r.id).join(' '))

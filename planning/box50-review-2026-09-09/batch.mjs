import {spawn} from 'node:child_process'
import {generators} from '../../src/patterns/index.ts'
import {writeFileSync} from 'node:fs'
const queue=generators.map(g=>g.id), results=[]
async function worker(){while(queue.length){const id=queue.shift();const result=await new Promise(resolve=>{
const child=spawn(process.execPath,['--import','./tests/register.mjs','planning/box50-review-2026-09-09/run.ts',id],{stdio:['ignore','pipe','pipe'],windowsHide:true});let log='';child.stdout.on('data',d=>{log+=d;process.stdout.write(d)});child.stderr.on('data',d=>{log+=d});const timer=setTimeout(()=>child.kill(),480000);child.on('exit',(code,signal)=>{clearTimeout(timer);writeFileSync(`planning/box50-review-2026-09-09/${id}.log`,log);resolve({id,code,signal})})});results.push(result);writeFileSync('planning/box50-review-2026-09-09/batch.json',JSON.stringify(results,null,2))}}
await Promise.all([worker(),worker()])

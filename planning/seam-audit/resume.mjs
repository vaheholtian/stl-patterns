// Isolate unfinished cases with an explicit wall-clock budget.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { generators } from '../../src/patterns/index.ts'
import { cases } from './audit.mjs'
const root=new URL('./',import.meta.url)
const mode=process.argv[2]??'pipeline'
if(mode==='pipeline')for(const g of generators){
 const file=new URL(g.id+'.jsonl',root),configs=cases(g)
 const rows=existsSync(file)?readFileSync(file,'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l)):[]
 const done=new Set(rows.map(r=>r.index))
 for(let i=0;i<configs.length;i++)if(!done.has(i)){
   const run=spawnSync(process.execPath,['--import','./tests/register.mjs','planning/seam-audit/audit.mjs',g.id,'--resume',`--case=${i}`],{timeout:20000,encoding:'utf8'})
   if(run.error||run.signal){appendFileSync(file,JSON.stringify({index:i,config:configs[i],timeout:true,error:'Isolated case exceeded 20 second wall-clock budget',ms:20000})+'\n');console.log('TIMEOUT',g.id,i)}
   else if(run.status!==0)console.log('FAIL',g.id,i,run.stdout.trim().split('\n').filter(l=>!l.startsWith('COMPLETE')).join(' '))
 }
 console.log('FINISHED',g.id,configs.length)
}
if(mode==='targeted'){
 const file=new URL('targeted-results.json',root)
 for(let i=JSON.parse(readFileSync(file,'utf8')).length;i<114;i++){
  const run=spawnSync(process.execPath,['--import','./tests/register.mjs','planning/seam-audit/targeted.mjs','--resume',`--case=${i}`],{timeout:8000,encoding:'utf8'})
  if(run.error||run.signal){
   const j=i-60,height=[5,7,11][Math.floor(j/18)],width=[5,23,61][Math.floor(j/6)%3],order=[1,4,7][Math.floor(j/2)%3],rounded=!!(j%2)
   const rows=JSON.parse(readFileSync(file,'utf8'));rows.push({id:'hilbert',params:{width,height,order,rounded,ribWidth:6,seed:7},minFeature:0.84,timeout:true,error:'Isolated case exceeded 8 second wall-clock budget'});writeFileSync(file,JSON.stringify(rows,null,2));console.log('TIMEOUT targeted',i)
  }
 }
 console.log('FINISHED targeted 114')
}

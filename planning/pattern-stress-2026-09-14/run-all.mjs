// Runs stress.ts for every generator, N in parallel; restarts after wasm faults and kills configs that exceed the time budget.
// usage (repo root): node planning/pattern-stress-2026-09-14/run-all.mjs [nRandom] [parallel] [budgetMs] [ids...]
import {spawn} from 'node:child_process'
import {readFileSync,appendFileSync,existsSync,writeFileSync} from 'node:fs'
const [nRandom='40',par='10',budget='120000',...only]=process.argv.slice(2)
const ids=only.length?only:'diamondLattice squareGrid roundPerforations honeycomb roundedSlots lusona unicursalMaze celtic ammannBeenker hankin fermatSpirals gosper arrowhead terdragon greekKey voronoiTile delaunayTile truchet penroseApproximant hilbert moire guilloche sierpinski koch phyllotaxis hyperbolic apollonian penrose julia'.split(' ')
const res=id=>new URL(`./results/${id}`,import.meta.url)
const log=new URL('./results/runner.log',import.meta.url)
function once(id,start){return new Promise(done=>{
  const child=spawn(process.execPath,['--import','./tests/register.mjs','planning/pattern-stress-2026-09-14/stress.ts',id,nRandom,String(start)],{stdio:['ignore','ignore','pipe']})
  let err='';child.stderr.on('data',d=>err+=d)
  let last=-1,since=Date.now()
  const timer=setInterval(()=>{
    let cur;try{cur=JSON.parse(readFileSync(res(`${id}.current.json`),'utf8'))}catch{return}
    if(cur.i!==last){last=cur.i;since=Date.now()}
    else if(Date.now()-since>Number(budget)){
      appendFileSync(res(`${id}.jsonl`),JSON.stringify({id,i:cur.i,kind:cur.config.kind,label:cur.config.label,config:cur.config,error:`Timeout: no result within ${budget} ms`,ms:Number(budget)})+'\n')
      child.kill();clearInterval(timer);done({next:cur.i+1,n:cur.n})
    }
  },1000)
  child.on('exit',code=>{clearInterval(timer)
    let cur;try{cur=JSON.parse(readFileSync(res(`${id}.current.json`),'utf8'))}catch{}
    if(code&&code!==3&&!child.killed)appendFileSync(log,`${id} start=${start} exit=${code} ${err.slice(-800)}\n`)
    if(child.killed)return
    done(cur?.done?{next:Infinity}:{next:(cur?.i??start)+1,n:cur?.n})
  })
})}
async function gen(id){
  let start=0,restarts=0
  while(true){const r=await once(id,start);if(r.next===Infinity)break;if(r.n!==undefined&&r.next>=r.n)break;start=r.next;restarts++;if(restarts>200)break}
  appendFileSync(log,`${id} done restarts=${restarts}\n`);console.log(id,'done',restarts)
}
writeFileSync(log,'')
const queue=[...ids];await Promise.all(Array.from({length:Number(par)},async()=>{while(queue.length)await gen(queue.shift())}))
console.log('all done')

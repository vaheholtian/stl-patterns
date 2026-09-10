import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
import {connectBrowser} from './browser-session.mjs'
const b=await connectBrowser()
try{
  const result=await b.evaluate(`(async()=>{
    const {PreviewClient}=await import('/stl-patterns/src/worker/preview-client.ts');
    let workers=0;
    const client=new PreviewClient(()=>{workers++;return new Worker('/stl-patterns/src/worker/preview.worker.ts',{type:'module'})});
    const times=[];let empty=0;
    try {
      for(let i=0;i<100;i++){
        const start=performance.now();
        const result=await client.generate({def:{name:'Stress check',generatorId:['squareGrid','honeycomb','voronoiTile'][i%3],params:{width:24,height:37,seed:i},invert:!!(i%2),seamless:true},lineWidth:.42});
        if(!result.polygons.length)empty++;
        times.push(performance.now()-start);
      }
      return {requests:times.length,workers,empty,medianMs:[...times].sort((a,b)=>a-b)[50],maxMs:Math.max(...times),times};
    } finally {client.dispose()}
  })()`)
  assert.equal(result.requests,100);assert.equal(result.workers,1);assert.equal(result.empty,0)
  assert.equal(b.errors.length,0,JSON.stringify(b.errors))
  writeFileSync(new URL('./fixed/browser-preview-stress.json',import.meta.url),JSON.stringify(result,null,2))
  console.log(JSON.stringify({...result,times:undefined}))
}finally{b.close()}

// Print one line per record of results/<id>.jsonl
import {readFileSync} from 'node:fs'
for(const id of process.argv.slice(2))for(const l of readFileSync(new URL(`./results/${id}.jsonl`,import.meta.url),'utf8').trim().split('\n')){
  const r=JSON.parse(l)
  console.log(id,r.i,r.label,r.error?'ERR '+r.error.slice(0,120).replace(/\n/g,' | '):`${r.ms.toFixed(0)}ms polys=${r.polygons} pts=${r.points} area=${r.areaFraction?.toFixed(2)} matParts=${r.materialParts3x3} featParts=${r.featureParts3x3} thinF=${r.featureThinLoss?.toFixed(2)} thinM=${r.materialThinLoss?.toFixed(2)} seam=${r.edgeMax?.toFixed(3)}${r.seamFail?' SEAMFAIL':''} det=${r.deterministic} warn=${r.warnings?.length}`)
}

import assert from 'node:assert/strict'
import {readFileSync,readdirSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import Module from 'manifold-3d'
import {parseStl} from '../../src/io/stl.ts'
import {manifoldFromTriMesh} from '../../src/geom/manifold.ts'
const root=new URL('./',import.meta.url),m=await Module();m.setup()
const records=readdirSync(root).filter(p=>p.endsWith('.jsonl')).flatMap(p=>readFileSync(new URL(p,root),'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l)))
assert.equal(records.filter(r=>r.error).length,0)
const batch=JSON.parse(readFileSync(new URL('batch.json',root),'utf8'));assert.equal(batch.length,29);assert.ok(batch.every(r=>r.code===0))
const fixture=readFileSync(new URL('../../fixtures/box-50.stl',root));assert.equal(createHash('sha256').update(fixture).digest('hex'),'81a5a39c0d759a699d1a5b0e389f58423cd0699ec68fa25b4cd0089ae14ed6b7')
const files=readdirSync(new URL('meshes/',root)).filter(f=>f.endsWith('.stl')),checked=[]
for(const file of files){const b=readFileSync(new URL(`meshes/${file}`,root)),solid=manifoldFromTriMesh(m,parseStl(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)));assert.equal(solid.status(),'NoError',file);assert.ok(solid.volume()>0,file);checked.push({file,status:solid.status(),volume:solid.volume()});solid.delete()}
assert.equal(files.length,345)
const ridge=JSON.parse(readFileSync(new URL('ridge-probe.json',root),'utf8'))
assert.ok(ridge.find(r=>r.body==='box50'&&r.scale===.6).missingHeight>.319)
assert.ok(Math.abs(ridge.find(r=>r.body==='box50'&&r.scale===1).missingHeight)<1e-5)
assert.ok(ridge.find(r=>r.angle===135&&r.scale===1).missingHeight>1.22)
const margins=records.filter(r=>r.kind==='physical-margin');assert.deepEqual(margins.map(r=>r.extents[0].minZ),[1.5,2.5,4.25])
writeFileSync(new URL('verification.json',root),JSON.stringify({checkedAt:new Date().toISOString(),fixtureUnchanged:true,generators:batch.length,validExportedSTLs:checked.length,confirmedNotch:true,confirmedMarginScaling:true,files:checked},null,2))
console.log(`Verified ${checked.length} exported STL files: NoError, positive volume. All 29 batch processes exited 0. Fixture hash unchanged. Notch and margin reproductions confirmed.`)

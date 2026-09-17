// Repro of the app run at HEAD: box-50, four outer walls, Celtic plait,
// margin 3, scale 1, emboss 0.8, rotation 0, invert on, connect material off.
import {readFileSync} from 'node:fs'
import {m,selectByNormals,layoutOnBody,DEFAULTS} from '../helpers.ts'
import {manifoldFromTriMesh,triMeshFromManifold} from '../../../src/geom/manifold.ts'
import {parseStl} from '../../../src/io/stl.ts'
const bytes=readFileSync(new URL('../../../fixtures/box-50.stl',import.meta.url))
const body=manifoldFromTriMesh(m,parseStl(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)))
const mesh=triMeshFromManifold(body)
const ring={name:'box50-ring',body,mesh,faceNormals:[[0,-1,0],[1,0,0],[0,1,0],[-1,0,0]] as [number,number,number][],origin:[37,0,23] as [number,number,number],region:selectByNormals(mesh,[[0,-1,0],[1,0,0],[0,1,0],[-1,0,0]],(x,y)=>x<.001||y<.001||x>49.999||y>49.999)}
const s={...DEFAULTS,mode:'emboss' as const,rotationDeg:0,scale:1,margin:3,wallThickness:1.6,depth:.8,detail:2}
const {laid,log}=layoutOnBody(ring,'celtic',{},s,ring.origin,30,{invert:true,connectMaterial:false})
console.log('pieces laid:',laid.length)
console.log('closureJoined pieces:',laid.filter(l=>l.layout.closureJoined).length)
console.log('--- flatten log ---'); for(const l of log) console.log('   ',l)
console.log('--- layout notes ---'); for(const n of [...new Set(laid.flatMap(l=>l.layout.log))]) console.log('   ',n)
// --- apply and save, so the result can be compared against the tile itself ---
import {writeFileSync} from 'node:fs'
import {applyLaid} from '../helpers.ts'
import {writeBinaryStl} from '../../../src/io/stl.ts'
const raw=applyLaid(ring,laid,s),simple=raw.simplify(.005),parts=simple.decompose()
const vols=parts.map(p=>p.volume()),largest=Math.max(...vols)
const keep=parts.filter((p,i)=>vols[i]===largest||vols[i]>=5),solid=m.Manifold.compose(keep)
writeFileSync(new URL('after-final/meshes/celtic-app-repro.stl',import.meta.url),new Uint8Array(writeBinaryStl(triMeshFromManifold(solid))))
console.log('saved celtic-app-repro.stl  parts',keep.filter(p=>p.volume()>0).length,'status',solid.status())

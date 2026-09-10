import { writeFileSync } from 'node:fs'
import Module from 'manifold-3d'
import { generatorById, defaultParams } from '../../src/patterns/index.ts'
import { seededRandom } from '../../src/geom/random.ts'
import { tileToPolygons } from '../../src/patterns/pipeline.ts'
import { layoutTile, buildParameterization } from '../../src/geom/layout.ts'

const m=await Module();m.setup()
// An isometric developed wrap: left/right represent the same surface seam.
const flat={positions:new Float32Array([0,0,0,100,0,0,100,50,0,0,50,0]),indices:new Uint32Array([0,1,2,0,2,3]),normals:new Float32Array([0,0,1,0,0,1,0,0,1,0,0,1]),uv:new Float32Array([0,0,100,0,100,50,0,50]),period:[100,0],originTriangle:0,loops:[[0,1,2,3]],seamVertices:[0,1,2,3],topology:'seam',log:[],removedCap:new Uint32Array()}
function contains(polys,x,y){let inside=false;for(const p of polys)for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i][1]>y)!==(p[j][1]>y)&&x<(p[j][0]-p[i][0])*(y-p[i][1])/(p[j][1]-p[i][1])+p[i][0])inside=!inside;return inside}
const result=[]
for(const id of ['squareGrid','truchet','voronoiTile']){
  const g=generatorById(id),tile=g.generate({...defaultParams(g),width:23,height:37},{rand:seededRandom(1)})
  const polys=tileToPolygons(m,tile,{periodic:true,minFeature:0.84})
  for(const rotationDeg of [0,15,30,45,90,180])for(const scale of [0.5,1,2])for(const origin of [[0,0,0],[13,17,0]]){
    const settings={origin,rotationDeg,scale,margin:0,fitSeam:true,minScale:0}
    const laid=layoutTile(m,flat,polys,tile.width,tile.height,settings)
    const {period}=buildParameterization(flat,settings)
    let mismatches=0
    for(let j=0;j<500;j++){
      const y=(j+0.5)/10
      const a=laid.param.uvAt3D(0,1e-4,y,0),b=laid.param.uvAt3D(0,100-1e-4,y,0)
      if(contains(laid.polygons,...a)!==contains(laid.polygons,...b))mismatches++
    }
    result.push({id,rotationDeg,scale,origin,period,tileWidth:laid.tileWidth,tileHeight:laid.tileHeight,phase:[period[0]/laid.tileWidth,period[1]/laid.tileHeight],claimedFitted:laid.repeatsAround!==null,mismatches,samples:500,log:laid.log})
  }
}
writeFileSync(new URL((process.env.SEAM_AUDIT_OUTPUT??'./')+'layout-results.json',import.meta.url),JSON.stringify(result,null,2))
console.log(JSON.stringify({cases:result.length,failed:result.filter(r=>r.claimedFitted&&r.mismatches>1).length,unrotated:result.filter(r=>r.rotationDeg===0).map(r=>({id:r.id,scale:r.scale,mismatches:r.mismatches})),example:result.find(r=>r.id==='squareGrid'&&r.rotationDeg===30&&r.scale===1)},null,2))

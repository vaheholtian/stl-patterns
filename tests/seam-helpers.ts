import type { Pt } from '../src/patterns/types'
export function intervals(polys: Pt[][], axis: number, edge: number) {
  const list = []
  for (const poly of polys) for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    if (Math.abs(a[axis] - edge) < 1e-6 && Math.abs(b[axis] - edge) < 1e-6) {
      const lo = Math.min(a[1-axis], b[1-axis]), hi = Math.max(a[1-axis], b[1-axis])
      if (hi-lo > 1e-7) list.push([lo, hi])
    }
  }
  list.sort((a,b) => a[0]-b[0])
  const merged=[]
  for (const iv of list) {
    const last=merged.at(-1)
    if (last && iv[0]-last[1] < 1e-6) last[1]=Math.max(last[1],iv[1])
    else merged.push([...iv])
  }
  return merged
}
export function mismatch(a: number[][], b: number[][]) {
  const points=[...new Set([...a.flat(),...b.flat()])].sort((a,b)=>a-b)
  const diff=[]
  for (let i=1;i<points.length;i++) {
    const lo=points[i-1],hi=points[i],mid=(lo+hi)/2
    if(a.some(([l,h])=>l<mid&&mid<h) !== b.some(([l,h])=>l<mid&&mid<h)) {
      if(diff.length && Math.abs(diff.at(-1)[1]-lo)<1e-6)diff.at(-1)[1]=hi
      else diff.push([lo,hi])
    }
  }
  return { total:diff.reduce((s,[l,h])=>s+h-l,0), max:Math.max(0,...diff.map(([l,h])=>h-l)), intervals:diff }
}

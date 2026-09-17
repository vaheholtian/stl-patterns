import fs from 'fs'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const sharp = require('sharp')
const idx = JSON.parse(fs.readFileSync('patterns.json', 'utf8'))
const cols = ['#fff', '#6d4bd6', '#e2266b', '#03a9f4', '#f0c94a']
const S = 220
for (const p of idx) {
  const { width: w, height: h, mode } = p
  const layers = p.path.split('~')
  const k = S / (2.2 * Math.max(w, h))   // ~2.2 repeats along the long side
  for (const mono of [false, true]) {
    let g = ''
    layers.forEach((L, i) => {
      const c = mono ? '#111' : cols[i + 1]
      const st = mode === 'fill' ? `fill='${c}' stroke='none'` : `fill='none' stroke='${c}' stroke-width='1'` + (mode === 'stroke-join' ? ` stroke-linecap='square'` : '')
      g += L.replace('/>', ` ${st}/>`)
    })
    const bgc = mono ? '#fff' : cols[0]
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${S}' height='${S}'><defs><pattern id='a' patternUnits='userSpaceOnUse' width='${w}' height='${h}' patternTransform='scale(${k})'><rect width='100%' height='100%' fill='${bgc}'/>${g}</pattern></defs><rect width='100%' height='100%' fill='url(#a)'/></svg>`
    fs.writeFileSync(`thumbs/${p.slug}${mono ? '_mono' : ''}.svg`, svg)
    await sharp(Buffer.from(svg)).png().toFile(`thumbs/${p.slug}${mono ? '_mono' : ''}.png`)
  }
}
console.log('ok')

import fs from 'fs'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const sharp = require('sharp')
const idx = JSON.parse(fs.readFileSync('patterns.json', 'utf8'))
const only = process.argv[2]
const meta = []
for (const p of idx) {
  if (only && p.slug !== only) continue
  const { width: w, height: h, mode } = p
  const ppu = Math.min(15, Math.max(3, 400 / Math.max(w, h)))
  const layers = p.path.split('~')
  const strokes = mode === 'fill' ? [0] : [1, Math.max(1, p.maxStroke / 2)]
  const W = Math.round(3 * w * ppu), H = Math.round(3 * h * ppu)
  const files = []
  for (let li = 0; li < layers.length; li++) for (const s of strokes) for (const lay of ['one', 'nine']) for (const rule of mode === 'fill' ? ['nonzero', 'evenodd'] : ['nonzero']) {
    if (lay === 'one' && rule === 'evenodd') continue
    let style
    if (mode === 'fill') style = `fill='#fff' stroke='none' fill-rule='${rule}'`
    else if (mode === 'stroke-join') style = `fill='none' stroke='#fff' stroke-width='${s}' stroke-linecap='square'`
    else style = `fill='none' stroke='#fff' stroke-width='${s}'`
    const el = layers[li].replace('/>', ` ${style}/>`)
    let body = ''
    if (lay === 'one') body = `<g transform='translate(${w},${h})'>${el}</g>`
    else for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) body += `<g transform='translate(${i * w},${j * h})'>${el}</g>`
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}' viewBox='0 0 ${3 * w} ${3 * h}' shape-rendering='crispEdges'><rect width='100%' height='100%' fill='#000'/>${body}</svg>`
    const name = `r/${p.slug}_L${li}_s${s}_${lay}_${rule}.png`
    await sharp(Buffer.from(svg)).greyscale().png().toFile(name)
    files.push({ layer: li, stroke: s, lay, rule, name })
  }
  meta.push({ slug: p.slug, title: p.title, mode, w, h, ppu, W, H, vHeight: p.vHeight, nLayers: layers.length, maxStroke: p.maxStroke, maxSpacing: p.maxSpacing, tags: p.tags, date: p.creationDate, files })
}
fs.writeFileSync(only ? 'meta-one.json' : 'meta.json', JSON.stringify(meta))
console.log('done', meta.length)

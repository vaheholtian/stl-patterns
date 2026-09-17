import fs from 'fs'
const src = fs.readFileSync('svelte-svg-patterns/src/routes/_index.js','utf8').replace(/^const index = /,'').replace(/;\s*export default index;\s*$/,'')
const idx = JSON.parse(src)
fs.writeFileSync('patterns.json', JSON.stringify(idx))
const count = (f) => { const m = {}; for (const p of idx) { const k = f(p); m[k]=(m[k]||0)+1 } ; return m }
console.log(idx.length, count(p=>p.mode), count(p=>p.path.split('~').length), count(p=>p.vHeight>0))
const tags = {}; for (const p of idx) for (const e of p.path.match(/<\w+/g)) tags[e]=(tags[e]||0)+1
console.log(tags)
console.log(count(p=>/transform|fill=|stroke=/.test(p.path)))
console.log(count(p=>p.slug.replace(/-\d+$/,'')))

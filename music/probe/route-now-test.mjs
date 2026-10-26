// Offline check of the /now route: real SMTC reader + real NetEase lyrics,
// driven through the plugin's own handler with a fake cordis ctx.
// Play something first (browser or client), then run this.
import { readFile } from 'node:fs/promises'

const { apply } = await import('../dsh-netease/lib/index.js')

const routes = new Map()
const effects = []

const fakeC = {
  effect(fn, label) {
    effects.push({ label, dispose: fn() })
  },
  webServer: {
    register(route) {
      routes.set(route.path, route.handler)
      return () => routes.delete(route.path)
    },
  },
  fs: {
    async resolve(p) {
      return p
    },
    async readText(p) {
      return readFile(p, 'utf8')
    },
  },
}

apply({ inject(deps, cb) { cb(fakeC) } })
console.log('routes:', [...routes.keys()].join(', '))

function call(path) {
  return new Promise((resolve, reject) => {
    let body = ''
    const res = {
      writeHead(status) {
        this.status = status
      },
      end(chunk) {
        body += chunk ? String(chunk) : ''
        resolve({ status: this.status, body })
      },
    }
    Promise.resolve(routes.get(path)({ url: path, method: 'GET' }, res)).catch(reject)
  })
}

// give the SMTC child a moment to boot and emit its first line
await new Promise((r) => setTimeout(r, 3000))

for (let i = 0; i < 3; i++) {
  const out = await call('/api/dsh-netease/now')
  const d = JSON.parse(out.body)
  const pos = d.playing ? d.positionMs + (Date.now() - d.at) : d.positionMs
  const idx = (d.lines || []).findLastIndex?.((l) => l.t <= pos) ?? -1
  console.log(
    `[${i}] status=${out.status} playing=${d.playing} reason=${d.reason || '-'} ` +
      `title=${JSON.stringify(d.title || '')} artist=${JSON.stringify(d.artist || '')} ` +
      `songId=${d.songId} lines=${(d.lines || []).length} pos=${Math.round(pos)}ms cur=${JSON.stringify((d.lines || [])[idx]?.text || '')}`,
  )
  await new Promise((r) => setTimeout(r, 2000))
}

for (const e of effects) e.dispose?.()
process.exit(0)

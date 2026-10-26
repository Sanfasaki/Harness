// Offline harness: drive the plugin's real route handlers with a fake cordis ctx,
// so we can prove the data layer without going through DSH's authenticated server.
import { readFile } from 'node:fs/promises'
import { apply } from '../dsh-netease/lib/index.js'

const routes = new Map()

const fakeC = {
  effect(fn) {
    fn()
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

console.log('registered routes:', [...routes.keys()].join(', '))

function call(path, url) {
  return new Promise((resolve, reject) => {
    const body = []
    const res = {
      writeHead(status, headers) {
        this.status = status
        this.headers = headers
      },
      end(chunk) {
        resolve({ status: this.status, headers: this.headers, body: Buffer.concat(body).toString() + (chunk ? String(chunk) : '') })
      },
    }
    const req = { url, method: 'GET' }
    Promise.resolve(routes.get(path)(req, res)).catch(reject)
  })
}

for (const [path, url] of [
  ['/api/dsh-netease/status', '/api/dsh-netease/status'],
  ['/api/dsh-netease/daily', '/api/dsh-netease/daily'],
  ['/api/dsh-netease/recent', '/api/dsh-netease/recent?limit=5'],
  ['/api/dsh-netease/search', '/api/dsh-netease/search?q=' + encodeURIComponent('ヨルシカ') + '&limit=3'],
]) {
  const out = await call(path, url)
  let parsed
  try {
    parsed = JSON.parse(out.body)
  } catch {
    parsed = out.body
  }
  const summary = Array.isArray(parsed.songs)
    ? `${parsed.songs.length} songs; first=${JSON.stringify(parsed.songs[0]?.name)} cover=${(parsed.songs[0]?.cover || '').slice(0, 48)}`
    : JSON.stringify(parsed).slice(0, 200)
  console.log(`${out.status}\t${path}\t${summary}`)
}

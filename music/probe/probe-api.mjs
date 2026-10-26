// 直接验证 4 个网易云只读接口的形状（不经过 DSH），确认卡片数据层能拿到封面。
// 用法：node probe-api.mjs
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ENV = join(dirname(dirname(fileURLToPath(import.meta.url))), '.env')
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Safari/537.36'

function parseEnv(text) {
  const out = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const i = line.indexOf('=')
    let v = line.slice(i + 1).trim()
    const q = v[0]
    if (v.length >= 2 && (q === '"' || q === "'") && v[v.length - 1] === q) v = v.slice(1, -1)
    out[line.slice(0, i).trim()] = v
  }
  return out
}

const env = parseEnv(await readFile(ENV, 'utf8'))
const raw = (env.NETEASE_COOKIE || '').trim()
if (!raw) {
  console.log('[skip] .env 里 NETEASE_COOKIE 还是空的')
  process.exit(0)
}
const jar = new Map()
for (const p of raw.split(';')) {
  const i = p.indexOf('=')
  if (i > 0) jar.set(p.slice(0, i).trim(), p.slice(i + 1).trim())
}
if (env.NETEASE_CSRF && !jar.has('__csrf')) jar.set('__csrf', env.NETEASE_CSRF.trim())
const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
console.log('[cookie] keys:', [...jar.keys()].join(', '))

async function up(path) {
  const r = await fetch('https://music.163.com' + path, {
    headers: { 'user-agent': UA, referer: 'https://music.163.com/', cookie },
  })
  const t = await r.text()
  try {
    return JSON.parse(t)
  } catch {
    return { code: r.status, body: t.slice(0, 120) }
  }
}

const brief = (s) => ({
  id: s.id,
  name: s.name,
  artists: (s.ar || s.artists || []).map((a) => a.name).join(', '),
  album: (s.al || s.album || {}).name,
  cover: ((s.al || s.album || {}).picUrl || '').slice(0, 52),
})

// 1) 登录态
const acc = await up('/api/w/nuser/account/get')
console.log('\n[1] account  code=%s  nickname=%s  userId=%s',
  acc.code, (acc.profile || {}).nickname, (acc.account || {}).id)

// 2) 每日推荐
const daily = await up('/api/v3/discovery/recommend/songs')
const ds = ((daily.data || {}).dailySongs || [])
console.log('\n[2] daily     code=%s  count=%s', daily.code, ds.length)
if (ds[0]) console.log('    first:', JSON.stringify(brief(ds[0]), null, 0))

// 3) 最近在听
const recent = await up('/api/play-record/song/list?limit=5')
const rl = ((recent.data || {}).list || [])
console.log('\n[3] recent    code=%s  count=%s  msg=%s', recent.code, rl.length, recent.message || '')
if (rl[0]) {
  console.log('    record keys:', Object.keys(rl[0]).join(','))
  console.log('    first:', JSON.stringify(brief(rl[0].data || {}), null, 0))
  console.log('    playTime fields:', ['playTime', 'time', 'lastPlayTime'].filter((k) => rl[0][k]).join(',') || '(none)')
}

// 4) 搜歌 + detail 补封面
const search = await up('/api/search/get?s=' + encodeURIComponent('晴天') + '&type=1&limit=3&offset=0')
const ss = ((search.result || {}).songs || [])
const ids = ss.map((s) => s.id)
const detail = ids.length ? await up('/api/song/detail?ids=' + encodeURIComponent(JSON.stringify(ids))) : { songs: [] }
console.log('\n[4] search    code=%s  count=%s  detail_code=%s', search.code, ss.length, detail.code)
for (const s of detail.songs || []) console.log('    ', JSON.stringify(brief(s), null, 0))

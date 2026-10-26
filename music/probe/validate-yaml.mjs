// 验证 install.ps1 里那段 here-string：
//   1) 单独解析是合法 YAML，且恰好 2 条（mcp-netease / dsh-netease）
//   2) 不包含 !!js 之类的自定义标签（新 profile 的解析器不一定认）
//   3) 追加到一个"没有这两条"的基底后，仍然是合法的 2 条列表
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const dshHome = process.env.DSH_HOME || join(process.env.USERPROFILE || process.env.HOME || '.', '.dsh')
const yamlUrl = pathToFileURL(join(dshHome, 'profiles', 'node_modules', 'js-yaml', 'index.js')).href
const yaml = (await import(yamlUrl)).default

const ps = readFileSync(new URL('../install.ps1', import.meta.url), 'utf8')
const m = ps.match(/\$block = @'\r?\n([\s\S]*?)\r?\n'@/)
if (!m) throw new Error('block not found in install.ps1')
const block = m[1]

const ids = (doc) => doc.map((e) => (e.insert || []).map((i) => i.id)).flat().filter(Boolean)

const standalone = yaml.load(block)
console.log('1) standalone      :', Array.isArray(standalone) ? `array(${standalone.length})` : typeof standalone)
console.log('   ids             :', ids(standalone))
console.log('2) has custom tag  :', /!!js/.test(block) ? 'YES (bad)' : 'no')

const base = '# patch layer\n- insert:\n    - id: dsh-skin\n      name: \'dsh-skin\'\n'
const merged = yaml.load(base + block)
console.log('3) merged on base  :', Array.isArray(merged) ? `array(${merged.length})` : typeof merged)
console.log('   ids             :', ids(merged))

const dup = ids(merged).filter((v, i, a) => a.indexOf(v) !== i)
// base 里本来就有 1 条（dsh-skin），所以合并后应该是 3 条，且 netease 两条各出现一次
const ok = Array.isArray(merged) && merged.length === 3 &&
  ids(merged).filter((v) => v === 'mcp-netease').length === 1 &&
  ids(merged).filter((v) => v === 'dsh-netease').length === 1 &&
  !dup.length && !/!!js/.test(block)
console.log('\nRESULT:', ok ? 'PASS' : 'FAIL')
process.exit(ok ? 0 : 1)

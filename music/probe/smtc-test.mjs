// Verify the SMTC emitter through the exact channel the plugin will use (piped stdio),
// and prove Node can decode the UTF-8 JSON lines.
import { spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const smtc = join(here, '..', 'dsh-netease', 'scripts', 'smtc.ps1')
const child = spawn('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', [
  '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', smtc,
], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })

let buf = ''
let got = 0
const timer = setTimeout(() => {
  console.log('[timeout] lines received:', got)
  child.kill()
  process.exit(got > 0 ? 0 : 1)
}, 8000)

child.stdout.setEncoding('utf8')
child.stdout.on('data', (chunk) => {
  buf += chunk
  let idx
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim()
    buf = buf.slice(idx + 1)
    if (!line) continue
    console.log('[line]', line)
    if (++got >= 3) {
      clearTimeout(timer)
      child.kill()
      process.exit(0)
    }
  }
})

child.stderr.setEncoding('utf8')
child.stderr.on('data', (d) => console.log('[stderr]', d.trim().slice(0, 300)))
child.on('error', (e) => { console.error('[spawn error]', e.message); process.exit(1) })

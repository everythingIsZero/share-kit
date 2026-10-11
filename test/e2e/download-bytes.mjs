/**
 * download-bytes.mjs — `save.download` 字节级端到端验收（G2；Playwright headless，本地离线跑）
 *
 * 补 `test/web/execute.test.mjs` 的空白：那边只断言下载**来源**是 `blob:` / `fileUrl`
 * （stub 不解析 href），本脚本**真浏览器**触发下载 → `a[download]` 落盘 → 读回字节，断言：
 *   ① 确是图片（PNG magic `89 50 4E 47 0D 0A 1A 0A`）；
 *   ② 尺寸 8×8（解析 IHDR）；
 *   ③ 与本地 fixture `test/fixtures/download-fixture.png` **逐字节相等**
 *      —— 排除「下到整页 HTML」（页面 HTML 以 `<!DOCTYPE` 开头，字节数也不同）。
 *
 * 全离线：本地 node 静态服务（仓根）+ 本地 fixture + 本地 Playwright/Chromium，不依赖线上。
 *
 * 用法：make test-download-bytes（或 `node test/e2e/download-bytes.mjs`）
 * Playwright 解析顺序：`PLAYWRIGHT_PATH` 环境变量 → `playwright` 包 → 本机全局安装（browser-use 依赖）。
 * 未装浏览器 / 未装 Playwright 时如实报错退出，不伪造通过。
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../..', import.meta.url)) // 仓根（serve 起点）
const PAGE = '/test/e2e/download-fixture.html'
const FIXTURE = join(ROOT, 'test/fixtures/download-fixture.png')
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
}

/** 解析 Playwright（本机工具；不进 dependencies） */
async function loadChromium() {
  const candidates = [process.env.PLAYWRIGHT_PATH, 'playwright', '/opt/homebrew/lib/node_modules/browser-use/node_modules/playwright/index.mjs'].filter(Boolean)
  const errors = []
  for (const c of candidates) {
    try {
      const mod = await import(c)
      if (mod.chromium) return mod.chromium
    } catch (e) {
      errors.push(`${c}: ${e.message}`)
    }
  }
  throw new Error(`未找到可用的 Playwright（已尝试：${candidates.join(' / ')}）。请先 npm i -D playwright && npx playwright install chromium，或设 PLAYWRIGHT_PATH 指向 playwright 入口。\n${errors.join('\n')}`)
}

/** 仓根静态服务（只读、够本验收用） */
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname)
    const file = join(ROOT, pathname)
    // 防目录穿越：解析后必须仍在仓根内（ROOT 以分隔符结尾）
    if (!file.startsWith(ROOT)) throw new Error('越界')
    const data = await readFile(file)
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' })
    res.end(data)
  } catch {
    res.writeHead(404)
    res.end('not found')
  }
})

/** 从 PNG 的 IHDR 读宽高（字节偏移固定：8 签名 + 4 长度 + 4 'IHDR' + 宽 4 + 高 4） */
function pngSize(buf) {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? `（${detail}）` : ''}`)
}

let browser
try {
  const chromium = await loadChromium()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  const base = `http://127.0.0.1:${port}`
  const fixture = await readFile(FIXTURE)

  browser = await chromium.launch()
  // 与本仓 demo/verify-realworld.mjs 的 Mac Chrome 场景同口径（能力表 browser:macos → 可列 save.download）
  const ctx = await browser.newContext({
    acceptDownloads: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  })
  const page = await ctx.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))

  await page.goto(`${base}${PAGE}`, { waitUntil: 'load', timeout: 30000 })
  await page.waitForFunction(() => window.__fixture, null, { timeout: 15000 })
  if (pageErrors.length) throw new Error(`页面异常：${pageErrors[0]}`)
  const pageHtml = await page.content()

  // 打开分享按钮 → 海报预览层（图片产物点击先弹大图）；读层内方式，确认 save.download 在列
  await page.click('.share-kit-trigger', { timeout: 10000 })
  await page.waitForSelector('.share-kit-preview-btn', { timeout: 10000 })
  const actions = await page.$$eval('.share-kit-preview-btn', (els) => els.map((e) => e.dataset.action))
  check('预览层列出 save.download（真实点击路径可达）', actions.includes('save.download'), actions.join(','))

  // 真浏览器触发下载：等待 download 事件 + 点击同一手势
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.click('.share-kit-preview-btn[data-action="save.download"]'),
  ])
  const filename = download.suggestedFilename()
  const path = await download.path() // 浏览器把 a[download] 落盘后的文件
  const bytes = await readFile(path)

  // ── 断言（先看真实字节，再判数值）─────────────────────────────
  const magicOf = (buf) => buf.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)
  const magicOk = magicOf(bytes)
  const size = pngSize(bytes)
  const equalsFixture = bytes.equals(fixture)

  console.log(`   文件名：${filename}`)
  console.log(`   字节数：${bytes.length}（fixture ${fixture.length}）`)
  console.log(`   前 8 字节：${bytes.subarray(0, 8).toString('hex')}`)
  console.log(`   尺寸：${size.width}×${size.height}`)
  console.log(`   页面 HTML 字节数：${Buffer.byteLength(pageHtml)}`)

  check('① 下载内容确为 PNG（magic 89 50 4E 47 0D 0A 1A 0A）', magicOk, bytes.subarray(0, 8).toString('hex'))
  check('② 尺寸与 fixture 一致（8×8）', size.width === 8 && size.height === 8, `${size.width}×${size.height}`)
  check('③ 与 fixture 逐字节相等（非页面 HTML）', equalsFixture, `${bytes.length}B vs ${fixture.length}B`)
  check('④ 不是页面 HTML（magic 不是 <! / <html）', !bytes.subarray(0, 1).equals(Buffer.from('<')), bytes.subarray(0, 5).toString('latin1'))
  check('⑤ 下载文件名为 fixture 名', filename === 'download-fixture.png', filename)
  // 反例自检：magic 判定必须能拒绝「页面 HTML」字节——证明该断言有判定作用、非恒真
  check('反例自检：PNG magic 判定拒绝页面 HTML 字节', !magicOf(Buffer.from(pageHtml)), '页面以 <!DOCTYPE 开头')

  await ctx.close()
} catch (err) {
  check('脚本执行未抛异常', false, err && err.message ? err.message : String(err))
} finally {
  if (browser) await browser.close()
  await new Promise((resolve) => server.close(resolve))
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} 通过`)
process.exit(failed.length ? 1 : 0)

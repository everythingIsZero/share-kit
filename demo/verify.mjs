/**
 * demo/verify.mjs — render-dom 视觉验收（Playwright，本地手动跑）
 *
 * 用法：先 `make demo-bundle`（生成 render-dom.bundle.mjs），再 `make demo-verify`。
 * 断言三件（plan T6 acceptance）：
 *   ① 成品 canvas 尺寸符合 spec（750×600 card × scaleFor 整数倍率）；
 *   ② 二维码区有真实像素（黑白模块，不是纯色）；
 *   ③ 海报子树无 <svg>、无 relative / absolute 定位属性（微信铁律）。
 *
 * 注意：playwright 取自本机全局安装（browser-use 的依赖），路径写死属本地验收脚本，
 * 不进 CI；远端 CI 需自装 playwright 后把下面 import 改回 'playwright'。
 */
import { chromium } from '/opt/homebrew/lib/node_modules/browser-use/node_modules/playwright/index.mjs'
import { spawn } from 'node:child_process'

const PORT = 8899
const root = new URL('..', import.meta.url).pathname // 仓根（serve 起点，便于 /demo 与 /src 同源）

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', root], {
  stdio: 'ignore',
})

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? `（${detail}）` : ''}`)
}

try {
  // 等服务器就绪
  await new Promise((r) => setTimeout(r, 800))

  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.goto(`http://localhost:${PORT}/demo/index.html`, { waitUntil: 'load' })

  // 等海报生成完成（demo 页暴露 window.__poster；失败则暴露 __posterError）
  await page.waitForFunction(() => window.__poster || window.__posterError, null, { timeout: 30000 })
  const error = await page.evaluate(() => window.__posterError)
  if (error) throw new Error(`demo 页渲染失败：${error}`)

  const info = await page.evaluate(() => {
    const { canvas, spec } = window.__poster
    // ② 二维码区真实像素：码区位置从 DOM 实测取（海报 min-height 语义，可被内容撑高）
    const ctx = canvas.getContext('2d')
    const poster = document.getElementById('poster-host').firstElementChild
    const ir = poster.querySelector('img[alt="qrcode"]').getBoundingClientRect()
    const pr = poster.getBoundingClientRect()
    const scale = canvas.width / pr.width
    const qrX = Math.round((ir.left - pr.left) * scale)
    const qrY = Math.round((ir.top - pr.top) * scale)
    const data = ctx.getImageData(qrX, qrY, Math.round(ir.width * scale), Math.round(ir.height * scale)).data
    const colors = new Set()
    for (let i = 0; i < data.length; i += 40) {
      colors.add(`${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`) // 粗量化，忽略压缩噪声
    }
    // ③ 海报子树铁律断言（源 HTML 层面）
    const hostHtml = document.getElementById('poster-host').innerHTML.toLowerCase()
    return {
      canvasW: canvas.width,
      canvasH: canvas.height,
      specW: spec.size.w,
      specH: spec.size.h,
      qrColors: colors.size,
      hasSvg: hostHtml.includes('<svg'),
      hasRelative: hostHtml.includes('position:relative') || hostHtml.includes('position: relative'),
      hasAbsolute: hostHtml.includes('position:absolute') || hostHtml.includes('position: absolute'),
    }
  })

  // ① 尺寸：宽 = spec 宽 × 整数倍率；高 ≥ spec 高 × 同倍率（min-height 语义：内容撑高、绝不裁）
  const scale = info.canvasW / info.specW
  check(
    'canvas 尺寸符合 spec × 整数倍率（高可撑）',
    Number.isInteger(scale) && scale >= 2 && info.canvasH >= info.specH * scale,
    `${info.canvasW}×${info.canvasH}（scale ${scale}，spec ${info.specW}×${info.specH}）`
  )
  // ② 二维码区真实像素：黑白模块 → 量化颜色远多于 2 种
  check('二维码区有真实像素（非纯色）', info.qrColors > 2, `${info.qrColors} 种量化颜色`)
  // ③ 微信铁律：无 svg、无 relative / absolute
  check('海报子树无 <svg>', info.hasSvg === false)
  check('海报子树无 relative / absolute 定位', info.hasRelative === false && info.hasAbsolute === false)

  // 截图存档（人工复核视觉观感）
  await page.screenshot({ path: new URL('poster-verify.png', import.meta.url).pathname, fullPage: true })
  console.log('截图已存 demo/poster-verify.png')

  await browser.close()
} finally {
  server.kill()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} 通过`)
process.exit(failed.length ? 1 : 0)

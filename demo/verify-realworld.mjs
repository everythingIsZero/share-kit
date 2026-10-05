/**
 * demo/verify-realworld.mjs — 线上多 UA 全链路验收（Playwright，本地手动跑，不进 CI）
 *
 * 对线上 https://share.hxym18.com/demo/ 用七组真实 UA 逐场景断言：
 *   ① 环境识别四维（容器 / 系统 / 内核 / 版本带）——决策层 UA 规则的真机口径验证；
 *   ② 一环境一动作（primary / reason / hint 有无）；
 *   ③ 交互：微信内长按引导层、桌面真下载事件、stub 系统分享的调用参数、复制调用；
 *   ④ 移动布局（海报横向滚动 / 导出图加载）；
 *   ⑤ 二维码可识读（jsQR 解码导出画布右下码区，等价扫码器识读）。
 *
 * 用法：make demo-verify-realworld（需先部署最新 demo 到线上）
 */
import { chromium } from '/opt/homebrew/lib/node_modules/browser-use/node_modules/playwright/index.mjs'
import { readFileSync } from 'node:fs'

const BASE = 'https://share.hxym18.com/demo/'
// jsQR UMD 本地读文件注入浏览器侧解码（不依赖 CDN）；utf8 编码读出字符串
const jsqrCode = readFileSync(new URL('../node_modules/jsqr/dist/jsQR.js', import.meta.url), 'utf8')

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? `（${detail}）` : ''}`)
}

/** 打开验证台并等渲染完成（线上首访含 0.43MB bundle，超时放宽） */
async function openPage(ctx) {
  const page = await ctx.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  await page.goto(BASE, { waitUntil: 'load', timeout: 60000 })
  await page.waitForFunction(() => window.__poster || window.__posterError, null, { timeout: 60000 })
  const err = await page.evaluate(() => window.__posterError)
  if (err) throw new Error(`渲染失败：${err}`)
  if (pageErrors.length) throw new Error(`页面异常：${pageErrors[0]}`)
  return page
}

/** 环境识别 + 决策断言（expect.hint: 'null' | 'non-null' | 不查） */
function checkEnv(name, env, e) {
  const f = env.fingerprint
  check(`[${name}] 容器=${e.container}`, f.container === e.container, f.container)
  check(`[${name}] 系统=${e.os}`, f.os === e.os, f.os)
  check(`[${name}] 内核=${e.engine}`, f.engine === e.engine, f.engine)
  if (e.versionBand) check(`[${name}] 版本带=${e.versionBand}`, f.versionBand === e.versionBand, f.versionBand)
  check(`[${name}] 首帧动作=${e.primary}`, env.plan.primary === e.primary, env.plan.primary)
  if (e.reason) check(`[${name}] reason=${e.reason}`, env.plan.reason === e.reason, env.plan.reason)
  if (e.hint === 'null') check(`[${name}] hint 为 null（动作自明）`, env.plan.hint === null)
  if (e.hint === 'non-null') check(`[${name}] hint 有事前说明`, env.plan.hint != null)
}

/** 交互钩子：点击分享按钮（Playwright 真实输入，会激活 userActivation） */
async function clickShare(page) {
  await page.click('#share-btn', { timeout: 10000 })
}

const SCENARIOS = [
  {
    name: '微信iOS',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.49(0x18003133) NetType/WIFI Language/zh_CN',
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    expect: { container: 'wechat', os: 'ios', engine: 'wkwebview', versionBand: 'ios-17', primary: 'preview.longpress', reason: 'primary-available', hint: 'non-null' },
    async interact(page) {
      // 微信内：点击 → 长按引导层出 blob 大图 → 可关闭
      await clickShare(page)
      await page.waitForFunction(() => document.getElementById('longpress-overlay').style.display === 'flex', null, { timeout: 10000 })
      const blob = await page.evaluate(() => document.getElementById('overlay-img').src.startsWith('blob:'))
      check('[微信iOS] 长按引导层展示 blob 大图', blob)
      await page.click('#overlay-close')
      check('[微信iOS] 引导层可关闭', await page.evaluate(() => document.getElementById('longpress-overlay').style.display === 'none'))
      // 移动布局：海报 750px 原尺寸横向滚动 + 导出图完整加载
      const layout = await page.evaluate(() => ({
        scrollable: document.getElementById('poster-host').scrollWidth > document.getElementById('poster-host').clientWidth,
        imgLoaded: document.getElementById('result').complete && document.getElementById('result').naturalWidth > 0,
      }))
      check('[微信iOS] 海报横向滚动可用', layout.scrollable)
      check('[微信iOS] 导出图完整加载', layout.imgLoaded)
    },
  },
  {
    name: '微信Android',
    ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/122.0.0.0 Mobile Safari/537.36 XWEB/115 MMWEBSDK/20240404 MicroMessenger/8.0.49.2600(0x28003135)',
    viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true,
    expect: { container: 'wechat', os: 'android', engine: 'blink', versionBand: 'android-14', primary: 'preview.longpress', reason: 'primary-available', hint: 'non-null' },
  },
  {
    name: '微信桌面Mac',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) MicroMessenger/6.0.2',
    viewport: { width: 1280, height: 900 },
    expect: { container: 'wechat-desktop', os: 'macos', engine: 'unknown', versionBand: 'macos-10', primary: 'save.album', reason: 'signal-fallback', hint: 'null' },
    async interact(page) {
      // PC 微信：无长按无相册 → 信号兜底直接下载（Playwright 真 download 事件）
      const dl = page.waitForEvent('download', { timeout: 15000 })
      await clickShare(page)
      const download = await dl
      check('[微信桌面Mac] 触发真实下载', download.suggestedFilename() === 'share-kit-poster.png', download.suggestedFilename())
    },
  },
  {
    name: '小程序webview',
    ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/122.0.0.0 Mobile Safari/537.36 XWEB/115 MMWEBSDK/20240404 MicroMessenger/8.0.49.2600(0x28003135) miniProgram',
    viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true,
    // 小程序 webview 表内动作全不可用 → 落 copy.link 后被信号兜底成 save.album
    // （探到 a[download] 就给直接下载，出资人口径「不能分享就走下载」；hint 为 null）
    expect: { container: 'wechat-miniprogram-webview', os: 'android', engine: 'blink', versionBand: 'android-14', primary: 'save.album', reason: 'signal-fallback', hint: 'null' },
    async interact(page) {
      const dl = page.waitForEvent('download', { timeout: 15000 })
      await clickShare(page)
      const download = await dl
      check('[小程序webview] 信号兜底触发下载', download.suggestedFilename() === 'share-kit-poster.png', download.suggestedFilename())
    },
  },
  {
    name: 'iOS Safari(无头)',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    // 无头无 navigator.share → share.system 被信号闸 → 落长按预览（browser:ios 的可靠路径）
    expect: { container: 'browser', os: 'ios', engine: 'wkwebview', versionBand: 'ios-17', primary: 'preview.longpress' },
  },
  {
    name: 'Android Chrome+分享',
    ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
    viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true,
    expect: { container: 'browser', os: 'android', engine: 'blink', versionBand: 'android-14', primary: 'preview.longpress', reason: 'primary-available' },
    init: () => {
      // stub 系统分享：canShareFiles 探测过 → share.system 可过闸（点击瞬间 transient 激活后重决策）
      navigator.canShare = () => true
      navigator.share = (d) => {
        const f = d.files && d.files[0]
        window.__shareCalled = { name: f && f.name, type: f && f.type }
        return Promise.resolve()
      }
    },
    async interact(page) {
      await clickShare(page)
      await page.waitForFunction(() => window.__shareCalled, null, { timeout: 10000 })
      const called = await page.evaluate(() => window.__shareCalled)
      check('[Android Chrome] 系统分享收到 PNG 文件', called && called.name === 'share-kit-poster.png' && called.type === 'image/png', JSON.stringify(called))
      const clickPlan = await page.evaluate(() => window.__clickPlan && window.__clickPlan.primary)
      check('[Android Chrome] 点击瞬间重决策=share.system', clickPlan === 'share.system', String(clickPlan))
    },
  },
  {
    name: 'Mac Chrome',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    expect: { container: 'browser', os: 'macos', engine: 'blink', versionBand: 'macos-10', primary: 'save.album', reason: 'primary-available', hint: 'null' },
    async interact(page) {
      // 桌面：直接下载 + 二维码识读（jsQR 解码导出画布右下码区）
      const dl = page.waitForEvent('download', { timeout: 15000 })
      await clickShare(page)
      const download = await dl
      check('[Mac Chrome] 触发真实下载', download.suggestedFilename() === 'share-kit-poster.png', download.suggestedFilename())
      await page.addScriptTag({ content: jsqrCode })
      const decoded = await page.evaluate(() => {
        const { canvas } = window.__poster
        // 码区位置从 DOM 实测取：海报可被内容撑高（min-height 语义），不能假设距底固定值
        const poster = document.getElementById('poster-host').firstElementChild
        const ir = poster.querySelector('img[alt="qrcode"]').getBoundingClientRect()
        const pr = poster.getBoundingClientRect()
        const scale = canvas.width / pr.width
        const size = Math.round(ir.width * scale)
        const x = Math.round((ir.left - pr.left) * scale)
        const y = Math.round((ir.top - pr.top) * scale)
        const data = canvas.getContext('2d').getImageData(x, y, size, size)
        const r = window.jsQR(data.data, data.width, data.height)
        return r ? r.data : null
      })
      check('[Mac Chrome] 二维码可识读（jsQR）', decoded === 'https://share.hxym18.com/s/demo001', decoded)
    },
  },
]

const browser = await chromium.launch()
try {
  for (const s of SCENARIOS) {
    const ctx = await browser.newContext({
      userAgent: s.ua, viewport: s.viewport, isMobile: !!s.isMobile, hasTouch: !!s.hasTouch,
      acceptDownloads: true,
    })
    if (s.init) await ctx.addInitScript(s.init)
    const page = await openPage(ctx)
    const env = await page.evaluate(() => window.__verifyEnv)
    checkEnv(s.name, env, s.expect)
    if (s.interact) await s.interact(page)
    await ctx.close()
  }
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} 通过`)
process.exit(failed.length ? 1 : 0)

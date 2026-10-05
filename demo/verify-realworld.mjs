/**
 * demo/verify-realworld.mjs — 线上多 UA 全链路验收（Playwright，本地手动跑，不进 CI）
 *
 * 对线上 https://share.hxym18.com/demo/ 用七组真实 UA 逐场景断言：
 *   ① 环境识别四维（容器 / 系统 / 内核 / 版本带）——决策层 UA 规则的真机口径验证；
 *   ② 首帧决策（primary / reason / hint 有无 / 首帧可用方式）；
 *   ③ Action Sheet 交互：项与主推荐、二级长按引导层、唯一动作直出不弹列表、
 *      sheet 项点击后真下载 / stub 系统分享参数 / 复制调用；
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

/** 环境识别 + 首帧决策断言（expect.hint: 'null' | 'non-null' | 不查） */
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
  if (e.firstList) {
    const got = env.firstList.actions.map((a) => a.id).join(',')
    check(`[${name}] 首帧可用方式=${e.firstList}`, got === e.firstList, got)
  }
}

/** 点击分享按钮 → 弹出 Action Sheet → 返回项数据（Playwright 真实输入，会激活 userActivation） */
async function openSheet(page) {
  await page.click('.share-kit-trigger', { timeout: 10000 })
  await page.waitForSelector('.share-kit-sheet', { timeout: 10000 })
  return page.evaluate(() =>
    [...document.querySelectorAll('.share-kit-sheet-item')].map((b) => ({
      action: b.dataset.action,
      primary: b.classList.contains('primary'),
    }))
  )
}

/** 断言 sheet 项与主推荐（expect: [{ action, primary }]，顺序即偏好序） */
function checkSheet(name, items, expect) {
  const got = items ? items.map((i) => `${i.action}${i.primary ? '*' : ''}`).join(',') : '无 sheet'
  const ok =
    items && items.length === expect.length && expect.every((e, i) => items[i].action === e.action && items[i].primary === !!e.primary)
  check(`[${name}] sheet=${expect.map((e) => e.action).join(',')}${expect.some((e) => e.primary) ? '（首项主推荐）' : ''}`, ok, got)
}

const SCENARIOS = [
  {
    name: '微信iOS',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.49(0x18003133) NetType/WIFI Language/zh_CN',
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    expect: { container: 'wechat', os: 'ios', engine: 'wkwebview', versionBand: 'ios-17', primary: 'preview.longpress', reason: 'primary-available', hint: 'non-null', firstList: 'preview.longpress,copy.link' },
    async interact(page) {
      // 微信内主推荐是长按保存（引导型）：不弹方式列表，直接弹大图长按引导层（最短路径）
      await page.click('.share-kit-trigger', { timeout: 10000 })
      await page.waitForSelector('.share-kit-longpress img', { timeout: 10000 })
      check('[微信iOS] 主推荐长按：直接弹大图（无 sheet 中转）', await page.evaluate(() => !document.querySelector('.share-kit-sheet')))
      check('[微信iOS] 长按引导层展示 blob 大图', await page.evaluate(() => document.querySelector('.share-kit-longpress img').src.startsWith('blob:')))
      check('[微信iOS] 层内有「复制链接」次要方式', await page.evaluate(() => document.querySelector('.share-kit-longpress-secondary').textContent === '复制链接'))
      await page.click('.share-kit-longpress-close')
      // 关闭有 260ms 退场动画，等 DOM 真正移除
      await page.waitForFunction(() => !document.querySelector('.share-kit-longpress'), null, { timeout: 5000 })
      check('[微信iOS] 引导层可关闭', true)
      // 移动布局：海报 750px 原稿缩放到一屏全貌 + 导出图完整加载
      const layout = await page.evaluate(() => {
        const host = document.getElementById('poster-host')
        return {
          fitted: host.firstElementChild.getBoundingClientRect().width <= host.clientWidth + 1,
          imgLoaded: document.getElementById('result').complete && document.getElementById('result').naturalWidth > 0,
        }
      })
      check('[微信iOS] 海报缩放到一屏全貌', layout.fitted)
      check('[微信iOS] 导出图完整加载', layout.imgLoaded)
    },
  },
  {
    name: '微信Android',
    ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/122.0.0.0 Mobile Safari/537.36 XWEB/115 MMWEBSDK/20240404 MicroMessenger/8.0.49.2600(0x28003135)',
    viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true,
    expect: { container: 'wechat', os: 'android', engine: 'blink', versionBand: 'android-14', primary: 'preview.longpress', reason: 'primary-available', hint: 'non-null', firstList: 'preview.longpress,copy.link' },
    async interact(page) {
      // 微信内直出冒烟：点击即弹大图长按引导层
      await page.click('.share-kit-trigger', { timeout: 10000 })
      await page.waitForSelector('.share-kit-longpress img', { timeout: 10000 })
      check('[微信Android] 主推荐长按：直接弹大图（无 sheet 中转）', await page.evaluate(() => !document.querySelector('.share-kit-sheet')))
    },
  },
  {
    name: '微信桌面Mac',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) MicroMessenger/6.0.2',
    viewport: { width: 1280, height: 900 },
    expect: { container: 'wechat-desktop', os: 'macos', engine: 'unknown', versionBand: 'macos-10', primary: 'save.album', reason: 'signal-fallback', hint: 'null', firstList: 'save.album,copy.link' },
    async interact(page) {
      // PC 微信：无长按无相册 → sheet 信号兜底给「保存图片」→ 选择后真实下载
      const items = await openSheet(page)
      checkSheet('微信桌面Mac', items, [{ action: 'save.album', primary: true }, { action: 'copy.link', primary: false }])
      const dl = page.waitForEvent('download', { timeout: 15000 })
      await page.click('.share-kit-sheet-item[data-action="save.album"]')
      const download = await dl
      check('[微信桌面Mac] 选择保存后触发真实下载', download.suggestedFilename() === 'share-kit-poster.png', download.suggestedFilename())
    },
  },
  {
    name: '小程序webview',
    ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/122.0.0.0 Mobile Safari/537.36 XWEB/115 MMWEBSDK/20240404 MicroMessenger/8.0.49.2600(0x28003135) miniProgram',
    viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true,
    // 小程序 webview 表内动作全不可用（save.album 是文档级 false，信号兜底不得推翻）→ 唯一动作 copy.link
    expect: { container: 'wechat-miniprogram-webview', os: 'android', engine: 'blink', versionBand: 'android-14', primary: 'copy.link', reason: 'fallback-only', hint: 'non-null', firstList: 'copy.link' },
    init: () => {
      navigator.clipboard.writeText = (t) => {
        window.__copied = t
        return Promise.resolve()
      }
    },
    async interact(page) {
      // 唯一可用动作：不弹 sheet 直接执行复制，反馈落在按钮
      await page.click('.share-kit-trigger', { timeout: 10000 })
      await page.waitForFunction(() => window.__copied, null, { timeout: 10000 })
      check('[小程序webview] 唯一动作直出：复制了页面链接', await page.evaluate(() => window.__copied === location.href))
      check('[小程序webview] 未弹方式列表', await page.evaluate(() => !document.querySelector('.share-kit-sheet')))
      check('[小程序webview] 按钮反馈「链接已复制」', await page.evaluate(() => document.querySelector('.share-kit-trigger').textContent === '链接已复制'))
    },
  },
  {
    name: 'iOS Safari(无头)',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    // 无头环境 stub 掉 canShare，确定性模拟 iOS 无系统分享 → 首选落长按预览（browser:ios 的可靠路径）
    expect: { container: 'browser', os: 'ios', engine: 'wkwebview', versionBand: 'ios-17', primary: 'preview.longpress', firstList: 'preview.longpress,copy.link' },
    init: () => {
      navigator.canShare = () => false
    },
    async interact(page) {
      // 无系统分享的 iOS 浏览器：主推荐也是长按保存 → 直出大图引导层
      await page.click('.share-kit-trigger', { timeout: 10000 })
      await page.waitForSelector('.share-kit-longpress img', { timeout: 10000 })
      check('[iOS Safari] 主推荐长按：直接弹大图（无 sheet 中转）', await page.evaluate(() => !document.querySelector('.share-kit-sheet')))
    },
  },
  {
    name: 'Android Chrome+分享',
    ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
    viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true,
    expect: { container: 'browser', os: 'android', engine: 'blink', versionBand: 'android-14', primary: 'preview.longpress', reason: 'primary-available', firstList: 'preview.longpress,copy.link' },
    init: () => {
      // stub 系统分享：canShareFiles 探测过 → 点击瞬间（transient 激活）share.system 入列成为主推荐
      navigator.canShare = () => true
      navigator.share = (d) => {
        const f = d.files && d.files[0]
        window.__shareCalled = { name: f && f.name, type: f && f.type }
        return Promise.resolve()
      }
    },
    async interact(page) {
      const items = await openSheet(page)
      checkSheet('Android Chrome', items, [{ action: 'share.system', primary: true }, { action: 'preview.longpress', primary: false }, { action: 'copy.link', primary: false }])
      await page.click('.share-kit-sheet-item[data-action="share.system"]')
      await page.waitForFunction(() => window.__shareCalled, null, { timeout: 10000 })
      const called = await page.evaluate(() => window.__shareCalled)
      check('[Android Chrome] sheet 选系统分享：收到 PNG 文件', called && called.name === 'share-kit-poster.png' && called.type === 'image/png', JSON.stringify(called))
    },
  },
  {
    name: 'Mac Chrome',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    expect: { container: 'browser', os: 'macos', engine: 'blink', versionBand: 'macos-10', primary: 'save.album', reason: 'primary-available', hint: 'null', firstList: 'save.album,copy.link' },
    async interact(page) {
      // 桌面：sheet 主推荐取决于无头环境是否探得 canShare（两者都合法），保存项恒在 → 选择后下载 + 二维码识读
      const items = await openSheet(page)
      check('[Mac Chrome] sheet 主推荐=偏好序首个可用项', items.length >= 2 && items[0].primary === true && ['share.system', 'save.album'].includes(items[0].action), items.map((i) => `${i.action}${i.primary ? '*' : ''}`).join(','))
      const dl = page.waitForEvent('download', { timeout: 15000 })
      await page.click('.share-kit-sheet-item[data-action="save.album"]')
      const download = await dl
      check('[Mac Chrome] 选择保存后触发真实下载', download.suggestedFilename() === 'share-kit-poster.png', download.suggestedFilename())
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

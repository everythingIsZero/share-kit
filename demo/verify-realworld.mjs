/**
 * demo/verify-realworld.mjs — 线上多 UA 全链路验收（Playwright，本地手动跑，不进 CI）
 *
 * 对线上 https://share.hxym18.com/demo/ 用七组真实 UA 逐场景断言：
 *   ① 环境识别四维（容器 / 系统 / 内核 / 版本带）——决策层 UA 规则的真机口径验证；
 *   ② 首帧决策（primary / reason / hint 有无 / 首帧可用方式）；
 *   ③ 预览层交互：点击先弹海报大图（blob 图源 / 长按提示 / 层内方式按钮与主推荐），
 *      层内按钮点击后真下载 / stub 系统分享参数（只传图不带 url）/ 复制调用；
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

/** 点击分享按钮 → 弹出海报预览层 → 返回层内按钮数据（Playwright 真实输入，会激活 userActivation） */
async function openPreview(page) {
  await page.click('.share-kit-trigger', { timeout: 10000 })
  await page.waitForSelector('.share-kit-preview img', { timeout: 10000 })
  return page.evaluate(() => ({
    blob: document.querySelector('.share-kit-preview img').src.startsWith('blob:'),
    tip: document.querySelector('.share-kit-preview-tip') ? document.querySelector('.share-kit-preview-tip').textContent : null,
    btns: [...document.querySelectorAll('.share-kit-preview-btn')].map((b) => ({
      action: b.dataset.action,
      primary: b.classList.contains('primary'),
    })),
  }))
}

/** 断言层内按钮与主推荐（expect: [{ action, primary }]，顺序即偏好序剔长按项） */
function checkLayer(name, layer, expect) {
  const got = layer ? layer.btns.map((b) => `${b.action}${b.primary ? '*' : ''}`).join(',') : '无预览层'
  const ok =
    layer && layer.btns.length === expect.length && expect.every((e, i) => layer.btns[i].action === e.action && layer.btns[i].primary === !!e.primary)
  check(`[${name}] 层内方式=${expect.map((e) => e.action).join(',')}${expect.some((e) => e.primary) ? '（首项主推荐）' : ''}`, ok, got)
}

const SCENARIOS = [
  {
    name: '微信iOS',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.49(0x18003133) NetType/WIFI Language/zh_CN',
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    expect: { container: 'wechat', os: 'ios', engine: 'wkwebview', versionBand: 'ios-17', primary: 'preview.longpress', reason: 'primary-available', hint: 'non-null', firstList: 'preview.longpress,copy.link' },
    async interact(page) {
      // 微信内：点按钮先弹海报预览层（图是基本操作），长按保存即大图本身，复制链接收在层内
      const layer = await openPreview(page)
      check('[微信iOS] 点击先弹海报大图（无 sheet 中转）', await page.evaluate(() => !document.querySelector('.share-kit-sheet')))
      check('[微信iOS] 预览层展示 blob 大图', layer.blob)
      check('[微信iOS] 层内有长按提示（保存 + 发送给朋友）', layer.tip && layer.tip.includes('长按') && layer.tip.includes('发送给朋友'), layer.tip)
      checkLayer('微信iOS', layer, [{ action: 'copy.link', primary: false }])
      await page.click('.share-kit-preview-close')
      // 关闭有 260ms 退场动画，等 DOM 真正移除
      await page.waitForFunction(() => !document.querySelector('.share-kit-preview'), null, { timeout: 5000 })
      check('[微信iOS] 预览层可关闭', true)
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
      // 微信内直出冒烟：点击先弹海报大图预览层（长按可保存 / 发送给朋友）
      const layer = await openPreview(page)
      check('[微信Android] 点击先弹海报大图（无 sheet 中转）', await page.evaluate(() => !document.querySelector('.share-kit-sheet')))
      check('[微信Android] 预览层展示 blob 大图', layer.blob)
      check('[微信Android] 层内有长按提示', !!layer.tip, layer.tip)
    },
  },
  {
    name: '微信桌面Mac',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) MicroMessenger/6.0.2',
    viewport: { width: 1280, height: 900 },
    expect: { container: 'wechat-desktop', os: 'macos', engine: 'unknown', versionBand: 'macos-10', primary: 'save.album', reason: 'signal-fallback', hint: 'null', firstList: 'save.album,copy.link' },
    async interact(page) {
      // PC 微信：无长按无相册 → 预览层内主推荐=信号兜底的「保存图片」→ 点击真实下载
      const layer = await openPreview(page)
      check('[微信桌面Mac] 预览层展示 blob 大图', layer.blob)
      check('[微信桌面Mac] PC 无长按菜单不出长按提示', layer.tip === null, layer.tip)
      checkLayer('微信桌面Mac', layer, [{ action: 'save.album', primary: true }, { action: 'copy.link', primary: false }])
      const dl = page.waitForEvent('download', { timeout: 15000 })
      await page.click('.share-kit-preview-btn[data-action="save.album"]')
      const download = await dl
      check('[微信桌面Mac] 层内选保存后触发真实下载', download.suggestedFilename() === 'share-kit-poster.png', download.suggestedFilename())
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
      // 唯一可用动作 copy.link：图片产物仍先弹海报大图（图是基本操作），复制收在层内按钮
      const layer = await openPreview(page)
      check('[小程序webview] 点击先弹海报大图（无 sheet）', await page.evaluate(() => !document.querySelector('.share-kit-sheet')))
      checkLayer('小程序webview', layer, [{ action: 'copy.link', primary: true }])
      await page.click('.share-kit-preview-btn[data-action="copy.link"]')
      await page.waitForFunction(() => window.__copied, null, { timeout: 10000 })
      check('[小程序webview] 层内复制链接：复制了页面链接', await page.evaluate(() => window.__copied === location.href))
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
      // 无系统分享的 iOS 浏览器：主推荐也是长按保存 → 点击先弹大图预览层
      const layer = await openPreview(page)
      check('[iOS Safari] 主推荐长按：点击先弹大图（无 sheet 中转）', await page.evaluate(() => !document.querySelector('.share-kit-sheet')))
      check('[iOS Safari] 预览层展示 blob 大图', layer.blob)
      check('[iOS Safari] 层内有长按提示', !!layer.tip, layer.tip)
    },
  },
  {
    name: 'Android Chrome+分享',
    ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
    viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true,
    expect: { container: 'browser', os: 'android', engine: 'blink', versionBand: 'android-14', primary: 'preview.longpress', reason: 'primary-available', firstList: 'preview.longpress,copy.link' },
    init: () => {
      // stub 系统分享：canShareFiles 探测过 → 点击瞬间（transient 激活）share.system 入列成为主推荐；
      // 同时记录 url 是否混入——分享图就是图，url 混传会让 iOS 面板把链接当主体
      navigator.canShare = () => true
      navigator.share = (d) => {
        const f = d.files && d.files[0]
        window.__shareCalled = { name: f && f.name, type: f && f.type, url: d.url ?? null }
        return Promise.resolve()
      }
    },
    async interact(page) {
      const layer = await openPreview(page)
      checkLayer('Android Chrome', layer, [{ action: 'share.system', primary: true }, { action: 'copy.link', primary: false }])
      await page.click('.share-kit-preview-btn[data-action="share.system"]')
      await page.waitForFunction(() => window.__shareCalled, null, { timeout: 10000 })
      const called = await page.evaluate(() => window.__shareCalled)
      check('[Android Chrome] 层内点「分享」：收到 PNG 文件', called && called.name === 'share-kit-poster.png' && called.type === 'image/png', JSON.stringify(called))
      check('[Android Chrome] 分享只传图不带 url（图是主体）', called && called.url === null, JSON.stringify(called && called.url))
    },
  },
  {
    name: 'Mac Chrome',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    expect: { container: 'browser', os: 'macos', engine: 'blink', versionBand: 'macos-10', primary: 'save.album', reason: 'primary-available', hint: 'null', firstList: 'save.album,copy.link' },
    async interact(page) {
      // 桌面：预览层主推荐取决于无头环境是否探得 canShare（两者都合法），保存项恒在 → 层内选择后下载 + 二维码识读
      const layer = await openPreview(page)
      check('[Mac Chrome] 层内主推荐=偏好序首个可用项', layer.btns.length >= 2 && layer.btns[0].primary === true && ['share.system', 'save.album'].includes(layer.btns[0].action), layer.btns.map((b) => `${b.action}${b.primary ? '*' : ''}`).join(','))
      const dl = page.waitForEvent('download', { timeout: 15000 })
      await page.click('.share-kit-preview-btn[data-action="save.album"]')
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
  {
    name: 'Mac Chrome link 产物',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    expect: { container: 'browser', os: 'macos', engine: 'blink', versionBand: 'macos-10', primary: 'save.album', reason: 'primary-available', hint: 'null', firstList: 'save.album,copy.link' },
    init: () => {
      // 模拟真实桌面 Chrome 的分享能力分裂：share 接口存在（Level 1：url/text），
      // canShare({files}) 返回 false（桌面不支持文件分享）——link 过杀修复（2026-10-05）的现场
      navigator.share = () => Promise.resolve()
      navigator.canShare = (d) => !(d && d.files && d.files.length)
    },
    async interact(page) {
      // 决策层 bug 用决策层验证：页面上下文里直接调 core/web 模块，断言三产物口径
      const r = await page.evaluate(async () => {
        const web = await import('/src/web/index.mjs')
        const core = await import('/src/core/index.mjs')
        const s = web.collectSignals()
        const { fingerprint } = core.normalizeFingerprint(s)
        // 点击瞬间语义：一次性用户激活为 true（完整列表只在点击瞬间可信）
        const signals = { ...s, hasTransientActivation: true }
        const of = (kind) => core.listActions({ fingerprint, artifactKind: kind, signals }).actions.map((a) => a.id)
        return { hasShare: s.hasShare, canShareFiles: s.canShareFiles, link: of('link'), image: of('image'), video: of('video') }
      })
      check('[Mac Chrome link] 信号分裂采集：hasShare=true / canShareFiles=false', r.hasShare === true && r.canShareFiles === false, JSON.stringify({ hasShare: r.hasShare, canShareFiles: r.canShareFiles }))
      check('[Mac Chrome link] link 产物含「分享」（share({url}) 本可用，不得过杀）', r.link.includes('share.system'), r.link.join(','))
      check('[Mac Chrome link] image/video 不含「分享」（文件分享探否，如实闸）', !r.image.includes('share.system') && !r.video.includes('share.system'), `${r.image.join(',')} | ${r.video.join(',')}`)
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

/**
 * render.mjs — DOM → canvas 渲染器（浏览器专用；渲染管线抽自 zbh PosterRenderer 实战）
 *
 * ===== 微信铁律（WKWebView 实测结论，违反必炸）=====
 * ① 底色必须显式给不透明色：png 无背景、jpeg 透明区会被直接编成黑（renderOptions 已强制）；
 * ② 海报子树不得出现 <svg> 图标（XWeb 旧内核解析易炸，posterHtml 已固化断言）；
 * ③ 海报子树不得使用 position:relative / absolute（微信内截屏错位，posterHtml 已固化断言）；
 * ④ 二维码必须用 <img> 直绘（html2canvas 对 bg-image 先缩到 CSS 尺寸再放大，边缘发糊压低扫码率）；
 * ⑤ 外链图必须换同源代理（跨域图污染 canvas，导出 toBlob 抛安全错误）——当前 schema 无图片字段，
 *    未来加图片字段时必须经 hooks.resolveImage 归一后才可进 DOM；
 * ⑥ 画布面积必须压进 iOS 上限（RAM<256MB 为 3MP、≥256MB 为 5MP；scaleFor 按预算反推整数倍率）。
 *
 * 纯逻辑部分（scaleFor / renderOptions / posterHtml）零 DOM 依赖，node:test 可覆盖；
 * capture 依赖 html2canvas-pro 与真实 DOM，视觉验收走 Playwright（demo 页）。
 */

import { resolveSpec, DEFAULT_CTA, DEFAULT_HEADLINE } from '../poster/spec.mjs'

/** 画布面积预算（iOS 上限留一成余量；单位：像素数） */
export const BUDGETS = Object.freeze({
  CLARITY: 4_500_000, // 清晰度优先档（近年 iPhone 按 FAQ 属 5MP 档）
  CONSERVATIVE: 3_000_000, // 兜底档：高倍率在旧机型截断时降档重试
})

/** 1 CSS px 最多铺 4 设备 px（已 ≥ @3x 原生，再高只增体积） */
export const MAX_SCALE = 4

/** 倍率硬底：再小肉眼必糊（产物比屏幕原生分辨率还窄） */
export const MIN_SCALE = 2

/**
 * 按面积预算反推整数倍率（必须向下取整：连续倍率会把内容画在亚像素网格上，
 * 整图发虚、二维码模块黑白粘连到无法识别）。
 */
export function scaleFor(w, h, budget) {
  const area = Math.max(Number(w) * Number(h), 1) // 除零防护
  const raw = Math.sqrt(budget / area)
  return Math.max(MIN_SCALE, Math.floor(Math.min(raw, MAX_SCALE)))
}

/**
 * 归一 html2canvas 配置（铁律①的落点：backgroundColor 恒为不透明 6 位 hex，
 * 传入 null / 非法色值一律换成白色兜底，绝不透传给 html2canvas）。
 */
export function renderOptions(options = {}) {
  const o = options && typeof options === 'object' ? options : {}
  const bg = typeof o.backgroundColor === 'string' && /^#[0-9A-Fa-f]{6}$/.test(o.backgroundColor)
    ? o.backgroundColor
    : '#FFFFFF'
  return {
    backgroundColor: bg,
    useCORS: true, // 允许跨域图（配合同源代理铁律⑤）
    logging: false,
    // ③ 显式给 windowWidth/windowHeight，避免按窗口尺寸截断（FAQ「canvas empty or cuts off」）
    windowWidth: typeof o.windowWidth === 'number' && o.windowWidth > 0 ? o.windowWidth : 0,
    windowHeight: typeof o.windowHeight === 'number' && o.windowHeight > 0 ? o.windowHeight : 0,
  }
}

/** 文本转义（业务数据不得裸进 HTML） */
function esc(v) {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * PosterSpec → 海报 HTML 字符串（纯函数；微信铁律②③④的落点）。
 *
 * @param spec resolveSpec 的冻结快照（非法输入自动走兜底 spec）
 * @param options.qrDataUrl 二维码 data URL（qr.mjs 的 qrDataUrl 生成后传入；
 *        缺省时不渲染码位——空内容码是假功能）
 * @param options.hooks.resolveImage 预留：外链图换同源代理的钩子（铁律⑤，见文件头注释）
 */
export function posterHtml(spec, options = {}) {
  const s = spec && typeof spec === 'object' && spec.content ? spec : resolveSpec(null)
  const o = options && typeof options === 'object' ? options : {}
  const qrSrc = typeof o.qrDataUrl === 'string' && o.qrDataUrl.startsWith('data:image/') ? o.qrDataUrl : ''
  const c = s.content
  const p = s.palette

  const factsHtml = c.facts
    .map(
      (f) =>
        `<div style="display:flex;justify-content:space-between;align-items:baseline;padding:10px 0;border-bottom:1px solid ${esc(p.primary)}22;">` +
        `<span style="font-size:24px;color:${esc(p.onPrimary)}99;">${esc(f.label)}</span>` +
        `<span style="font-size:26px;font-weight:600;color:${esc(p.onPrimary)};">${esc(f.value)}</span>` +
        `</div>`
    )
    .join('')

  // 二维码区：img 直绘（铁律④）；无码源整块不渲染（不留空壳）
  const qrHtml = qrSrc
    ? `<div style="display:flex;align-items:center;justify-content:space-between;margin-top:28px;">` +
      `<div style="flex:1;">` +
      `<div style="font-size:22px;color:${esc(p.onPrimary)}99;margin-bottom:6px;">${esc(c.owner ? `发起人 · ${c.owner}` : '')}</div>` +
      `<div style="font-size:30px;font-weight:700;color:${esc(p.primary)};">${esc(c.cta || DEFAULT_CTA)}</div>` +
      `</div>` +
      `<img src="${qrSrc}" alt="qrcode" style="width:150px;height:150px;background:#FFFFFF;padding:8px;" />` +
      `</div>`
    : `<div style="margin-top:28px;">` +
      `<div style="font-size:22px;color:${esc(p.onPrimary)}99;margin-bottom:6px;">${esc(c.owner ? `发起人 · ${c.owner}` : '')}</div>` +
      `<div style="font-size:30px;font-weight:700;color:${esc(p.primary)};">${esc(c.cta || DEFAULT_CTA)}</div>` +
      `</div>`

  return (
    // 版式高度用 min-height：内容不足时保持版式高，超出时撑高——绝不裁内容。
    // （固定 height 时 flex 子项 min-height:auto 不收缩，4 条 facts 即溢出 76px，
    //  垫底的二维码被 html2canvas 裁掉半截、导出图扫不出码——jsQR 线上验收实证）
    `<div style="width:${s.size.w}px;min-height:${s.size.h}px;background:${esc(p.background)};box-sizing:border-box;padding:48px 44px;display:flex;flex-direction:column;font-family:-apple-system,'PingFang SC','Helvetica Neue',sans-serif;">` +
    // L1 主色块：headline + subline
    `<div style="background:${esc(p.primary)};border-radius:20px;padding:32px 28px;">` +
    `<div style="font-size:44px;font-weight:800;color:${esc(p.onPrimary)};line-height:1.3;">${esc(c.headline || DEFAULT_HEADLINE)}</div>` +
    (c.subline ? `<div style="font-size:26px;color:${esc(p.onPrimary)}CC;margin-top:12px;">${esc(c.subline)}</div>` : '') +
    `</div>` +
    // L2 关键信息
    `<div style="margin-top:32px;flex:1;">${factsHtml}</div>` +
    // L3/L4 署名 + CTA + 二维码
    qrHtml +
    `</div>`
  )
}

/**
 * 画布疑似空白检测（iOS 越限时 html2canvas 不一定抛错，而是返回「尺寸正常但内容空白」
 * 的画布）：5×5 网格采样，几乎同色即判定没画上。真实海报必有文字与分隔线。
 */
function looksBlank(canvas) {
  try {
    const ctx = canvas.getContext('2d')
    if (!ctx) return false
    const samples = new Set()
    for (let i = 1; i <= 5; i++) {
      for (let j = 1; j <= 5; j++) {
        const d = ctx.getImageData(Math.floor((canvas.width * i) / 6), Math.floor((canvas.height * j) / 6), 1, 1).data
        samples.add(`${d[0]},${d[1]},${d[2]},${d[3]}`)
      }
    }
    return samples.size <= 2
  } catch {
    return false // 取不到像素（如被污染）时不误判，交给上层
  }
}

/**
 * 抓取海报画布：先按清晰度档渲染，疑似空白（iOS 越限静默失败）再退保守档重试一次。
 * 依赖真实 DOM 与 html2canvas-pro（动态 import，不进 node 测试链）。
 *
 * @returns {Promise<HTMLCanvasElement|null>} 两档都失败返回 null（调用方必须提示重试，绝不静默）
 */
export async function capture(el, options = {}) {
  const html2canvas = (await import('html2canvas-pro')).default
  const rect = el.getBoundingClientRect()
  const base = renderOptions(options)
  // windowWidth/windowHeight 缺省时按元素所在窗口给全（防按窗口截断）
  const win = el.ownerDocument?.defaultView
  const windowWidth = base.windowWidth || (win ? win.document.documentElement.clientWidth : 0)
  const windowHeight = base.windowHeight || (win ? el.scrollHeight || rect.height : rect.height)

  for (const budget of [BUDGETS.CLARITY, BUDGETS.CONSERVATIVE]) {
    const canvas = await html2canvas(el, {
      ...base,
      windowWidth,
      windowHeight,
      scale: typeof options.scale === 'number' && options.scale > 0 ? options.scale : scaleFor(rect.width, rect.height, budget),
    })
    if (canvas.width >= 100 && !looksBlank(canvas)) return canvas
    console.warn(`海报捕获疑似空白（预算 ${budget}），降档重试`)
  }
  return null
}

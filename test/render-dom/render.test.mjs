/**
 * test/render-dom/render.test.mjs — 渲染器纯逻辑（node:test）
 * 覆盖：scale 预算（iOS 画布上限）、渲染配置归一（不透明底色铁律）、海报 HTML 结构与微信铁律断言
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  BUDGETS,
  MAX_SCALE,
  MIN_SCALE,
  posterHtml,
  renderOptions,
  scaleFor,
} from '../../src/render-dom/render.mjs'
import { resolveSpec } from '../../src/poster/spec.mjs'

/** 构造一份带完整内容的 spec */
function spec(overrides = {}) {
  return resolveSpec({
    format: 'card',
    themeId: 'outdoor',
    content: {
      headline: '周末爬山局',
      subline: '新增 3 个地点',
      facts: [
        { label: '时间', value: '周六 09:00' },
        { label: '地点', value: '北高峰' },
      ],
      owner: '阿强',
      cta: '长按识别二维码 · 报名',
    },
    qr: { url: 'https://share.hxym18.com/s/abc123' },
    ...overrides,
  })
}

test('scaleFor：按面积预算反推整数倍率，结果夹在 [MIN_SCALE, MAX_SCALE]', () => {
  // 375×667：sqrt(4.5e6 / 250125) ≈ 4.24 → 4
  assert.equal(scaleFor(375, 667, BUDGETS.CLARITY), 4)
  // 750×1334：sqrt(4.5e6 / 1000500) ≈ 2.12 → 2
  assert.equal(scaleFor(750, 1334, BUDGETS.CLARITY), 2)
  // 小面积也封顶 MAX_SCALE
  assert.equal(scaleFor(100, 100, BUDGETS.CLARITY), MAX_SCALE)
  // 大面积压不过硬底 MIN_SCALE
  assert.equal(scaleFor(2000, 2000, BUDGETS.CLARITY), MIN_SCALE)
  // 面积为 0 不炸（除零防护）
  assert.equal(scaleFor(0, 0, BUDGETS.CLARITY), MAX_SCALE)
})

test('scaleFor 产物面积不超预算（除硬底档外），且倍率恒为整数', () => {
  for (const [w, h] of [[375, 667], [414, 896], [750, 600], [750, 1334], [1200, 630]]) {
    const s = scaleFor(w, h, BUDGETS.CLARITY)
    assert.equal(Number.isInteger(s), true, `(${w}×${h}) 倍率必须整数：${s}`)
    if (s > MIN_SCALE) {
      assert.ok(w * h * s * s <= BUDGETS.CLARITY, `(${w}×${h})×${s}² 超出面积预算`)
    }
  }
})

test('renderOptions：底色恒为不透明色值（微信铁律①：png 透明区会被编成黑）', () => {
  const def = renderOptions()
  assert.ok(/^#[0-9A-Fa-f]{6}$/.test(def.backgroundColor), '默认底色应为 6 位 hex')
  assert.equal(def.useCORS, true)
  assert.equal(def.logging, false)

  // 传 null / 非法色值都会被换成兜底色，绝不允许 null 透传给 html2canvas
  for (const bad of [null, undefined, 42, 'red-ish', '']) {
    const o = renderOptions({ backgroundColor: bad })
    assert.ok(/^#[0-9A-Fa-f]{6}$/.test(o.backgroundColor), `非法底色 ${JSON.stringify(bad)} 必须被替换`)
  }
  // 合法色值原样保留
  assert.equal(renderOptions({ backgroundColor: '#FCFDFF' }).backgroundColor, '#FCFDFF')
})

test('posterHtml：headline / facts / owner / cta / 色板色值全部注入', () => {
  const html = posterHtml(spec(), { qrDataUrl: 'data:image/png;base64,FAKE' })
  assert.ok(html.includes('周末爬山局'))
  assert.ok(html.includes('新增 3 个地点'))
  assert.ok(html.includes('时间'))
  assert.ok(html.includes('周六 09:00'))
  assert.ok(html.includes('地点'))
  assert.ok(html.includes('北高峰'))
  assert.ok(html.includes('阿强'))
  assert.ok(html.includes('长按识别二维码 · 报名'))
  // outdoor 主题色板
  assert.ok(html.includes('#7BE084'), 'primary 色应注入')
  assert.ok(html.includes('#12351B'), 'onPrimary 色应注入')
})

test('posterHtml 微信铁律：无 <svg>、无 relative / absolute 定位、二维码用 <img> 直绘', () => {
  const html = posterHtml(spec(), { qrDataUrl: 'data:image/png;base64,FAKE' })
  assert.equal(/<svg/i.test(html), false, '海报子树不得出现 svg（WKWebView 解析易炸）')
  assert.equal(/position:\s*relative/i.test(html), false, '不得使用 relative 定位')
  assert.equal(/position:\s*absolute/i.test(html), false, '不得使用 absolute 定位')
  // 二维码必须是 <img>：html2canvas 对 bg-image 先缩到 CSS 尺寸再放大，边缘发糊压低扫码率
  assert.ok(/<img[^>]+src="data:image\/png;base64,FAKE"/.test(html), '二维码应以 img + data URL 直绘')
})

test('posterHtml：无二维码源时隐藏码位（不留空壳），纯函数性', () => {
  const withoutQr = posterHtml(spec(), {})
  assert.equal(/<img/.test(withoutQr), false, '无码源不应渲染 img')
  assert.equal(/<svg/i.test(withoutQr), false)

  // 同输入两次输出相等
  const a = posterHtml(spec(), { qrDataUrl: 'data:image/png;base64,FAKE' })
  const b = posterHtml(spec(), { qrDataUrl: 'data:image/png;base64,FAKE' })
  assert.equal(a, b)
})

test('posterHtml：非法 spec 输入不抛错（渲染器永远拿到可渲染结构）', () => {
  assert.doesNotThrow(() => posterHtml(null, {}))
  assert.doesNotThrow(() => posterHtml(undefined, {}))
  const html = posterHtml(null, {})
  assert.ok(html.length > 0, '兜底输出仍应是完整 HTML')
  assert.ok(/<img/.test(html) === false)
})

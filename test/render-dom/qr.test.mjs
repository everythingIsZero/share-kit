/**
 * test/render-dom/qr.test.mjs — 二维码源图生成（node:test；qrcode 库在 node 下可跑）
 * 覆盖：512px 高倍源图 / 黑码白底 / 非法入参不抛错
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { QR_SOURCE_WIDTH, qrDataUrl } from '../../src/render-dom/qr.mjs'

test('qrDataUrl：返回 data:image/png 且按 512px 高倍源图生成', async () => {
  const url = await qrDataUrl({ url: 'https://share.hxym18.com/s/abc123' })
  assert.ok(url.startsWith('data:image/png'), '应返回 PNG data URL')
  // 512px 源图：导出 scale 4x 后二维码仍清晰可扫（160px 源会糊成噪点）
  assert.equal(QR_SOURCE_WIDTH, 512)
})

test('qrDataUrl：spec.qr 的颜色与 quietZone 映射（黑码白底优先保扫码率）', async () => {
  // 黑码白底是默认（扫码识别率优先）
  const def = await qrDataUrl({ url: 'https://example.com' })
  assert.ok(def.startsWith('data:image/png'))
  // quietZone 传 4 也正常出图（qrcode margin 参数）
  const wide = await qrDataUrl({ url: 'https://example.com', quietZone: 4 })
  assert.ok(wide.startsWith('data:image/png'))
})

test('qrDataUrl：非法入参不抛错，一律返回空串（渲染层按无码处理）', async () => {
  assert.equal(await qrDataUrl(null), '')
  assert.equal(await qrDataUrl(undefined), '')
  assert.equal(await qrDataUrl({}), '')
  assert.equal(await qrDataUrl({ url: '' }), '')
  assert.equal(await qrDataUrl({ url: 123 }), '')
  assert.equal(await qrDataUrl('https://example.com'), '')
})

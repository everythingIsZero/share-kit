/**
 * tests/copy.test.mjs — 文案表边界（node:test，零依赖）
 * 覆盖 Unit 1 第 2、3、4 条：默认正文不含系统菜单项名 / 已验证覆盖豁免且留痕 / 每条有 id 与中文正文
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  COPY,
  COPY_IDS,
  DEFAULT_MENU_TERM_DENYLIST,
  STRONG_GUIDANCE_COPY_IDS,
  getCopy,
  isStrongGuidance,
  renderCopy,
  resolveCopy,
  COPY_TIERS,
} from '../../src/core/copy.mjs'

test('默认正文不含任何系统菜单项字符串（逐词扫描，命中数为 0）', () => {
  const allText = COPY_IDS.map((id) => COPY[id].text).join('\n')
  const hits = DEFAULT_MENU_TERM_DENYLIST.filter((word) => allText.includes(word))
  assert.deepEqual(hits, [])
})

test('覆盖豁免：verifiedMenuItem 原样保留、默认条目不受影响、带显式标记', () => {
  const overridden = resolveCopy('longpress-image', {
    verifiedMenuItem: '存储图像',
    verified: true,
    reason: '2026-09-17 iPhone iOS 26 实测面板里确有此项',
  })
  assert.equal(overridden.verifiedMenuItem, '存储图像')
  assert.equal(overridden.verifiedOverride, true)
  assert.equal(overridden.overrideRejected, false)
  assert.ok(overridden.overrideReason.includes('实测'))

  // 默认单源不被覆盖污染，且默认正文仍不含该字符串
  assert.equal(COPY['longpress-image'].verifiedMenuItem, null)
  assert.equal(COPY['longpress-image'].text.includes('存储图像'), false)
  assert.equal(overridden.text, COPY['longpress-image'].text, '未传 text 时正文应沿用默认')
})

test('覆盖缺原因或未标 verified 时，菜单项名被丢弃并留痕（不静默放行）', () => {
  const noReason = resolveCopy('longpress-image', { verifiedMenuItem: '存储图像', verified: true })
  assert.equal(noReason.verifiedMenuItem, null)
  assert.equal(noReason.overrideRejected, true)

  const noVerify = resolveCopy('longpress-image', { verifiedMenuItem: '存储图像', reason: '随手改的' })
  assert.equal(noVerify.verifiedMenuItem, null)
  assert.equal(noVerify.overrideRejected, true)

  // 覆盖正文照常生效（只是菜单项名不生效）
  const withText = resolveCopy('longpress-image', { text: '按住了别松手', reason: '文案 A/B' })
  assert.equal(withText.text, '按住了别松手')
  assert.equal(withText.verifiedMenuItem, null)
})

test('文案表每条都有 id 与中文正文、时机合法、params 为数组', () => {
  assert.ok(COPY_IDS.length > 0)
  for (const id of COPY_IDS) {
    const entry = COPY[id]
    assert.equal(typeof entry.id, 'string')
    assert.ok(entry.id.length > 0)
    assert.equal(entry.id, id, 'id 必须与键一致')
    assert.ok(/[\u4e00-\u9fff]/.test(entry.text), `${id} 的正文应含中文`)
    assert.ok(COPY_TIERS.includes(entry.tier), `${id} 的 tier 越界`)
    assert.ok(Array.isArray(entry.params))
    assert.equal(entry.verifiedMenuItem, null, `${id} 默认不得带菜单项名`)
  }
})

test('renderCopy：占位替换、缺参不留半截占位符、未知 id 返回空串', () => {
  const text = renderCopy('external-open-video', { container: '微信' })
  assert.equal(text.includes('{container}'), false)
  assert.ok(text.includes('微信'))
  assert.equal(renderCopy('external-open-video').includes('{container}'), false)
  assert.equal(renderCopy('不存在的-id'), '')
})

test('getCopy / isStrongGuidance：未知输入返回 null 与 false，不抛错', () => {
  assert.equal(getCopy('longpress-image').id, 'longpress-image')
  assert.equal(getCopy('nope'), null)
  assert.equal(getCopy(null), null)
  assert.equal(isStrongGuidance('longpress-image'), true)
  assert.equal(isStrongGuidance('fail-retry'), false)
  for (const id of STRONG_GUIDANCE_COPY_IDS) {
    assert.ok(getCopy(id), `强引导清单里的 ${id} 必须在文案表里存在`)
  }
})

test('微信内 link 引导文案在表内且不含系统菜单项名（2026-09-18 首次接入补）', () => {
  const entry = getCopy('card-wx-link')
  assert.ok(entry, 'card-wx-link 必须存在——微信内 link 产物唯一的事前引导')
  assert.equal(entry.tier, 'pre')
  assert.deepEqual(DEFAULT_MENU_TERM_DENYLIST.filter((w) => entry.text.includes(w)), [])
})

test('两条结果文案齐备：直接保存与复制链接都报得出结果（2026-09-18 首次接入补）', () => {
  for (const id of ['done-saved', 'done-copied']) {
    const entry = getCopy(id)
    assert.ok(entry, `${id} 必须存在——成功结果要如实落在按钮上（R9）`)
    assert.equal(entry.tier, 'result')
  }
  // 走系统面板的动作不得借用这两条：面板里发生什么我们不知道（R7）
  assert.equal(getCopy('done-share-system'), null)
})

test('闸门判定不可达的文案条目不得留在表里（死条目防回归）', () => {
  // share.card.wx 只对 link 开放（ARTIFACT_ACTION_GATES），share.card.miniapp 在任何环境行都不可用
  // （capability-table），故这三条 image/video 变体永远不可达——留着会让人误以为图片场景已覆盖
  for (const dead of ['card-wx-image', 'card-wx-video', 'card-miniapp-image']) {
    assert.equal(getCopy(dead), null, `${dead} 不可达，不应留在文案表`)
  }
})
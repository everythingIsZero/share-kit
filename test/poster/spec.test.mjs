/**
 * test/poster/spec.test.mjs — 海报冻结快照（node:test，零依赖）
 * 覆盖：业务输入 → 深冻结快照 / 未知主题与版式回落 / 非法入参不抛错 / facts 与 qr 归一
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_FORMAT,
  DEFAULT_THEME_ID,
  POSTER_FORMATS,
  POSTER_SIZES,
  POSTER_THEMES,
  resolveSpec,
} from '../../src/poster/spec.mjs'

/** 构造一份合法的业务输入（模拟业务站传来的海报数据） */
function bizInput(overrides = {}) {
  return {
    format: 'card',
    themeId: 'celebration',
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
  }
}

test('业务输入 → 冻结快照：输出递归冻结，写入被拒绝（防渲染期幽灵数据）', () => {
  const spec = resolveSpec(bizInput())
  assert.equal(Object.isFrozen(spec), true)
  assert.equal(Object.isFrozen(spec.size), true)
  assert.equal(Object.isFrozen(spec.palette), true)
  assert.equal(Object.isFrozen(spec.content), true)
  assert.equal(Object.isFrozen(spec.content.facts), true)
  assert.equal(Object.isFrozen(spec.content.facts[0]), true)
  assert.equal(Object.isFrozen(spec.qr), true)
  // ESM 严格模式下，对冻结属性的赋值必须抛 TypeError
  assert.throws(() => {
    spec.content.headline = '篡改'
  }, TypeError)
})

test('未知主题回落 general、未知版式回落 card（不用默认值冒充已知主题）', () => {
  const spec = resolveSpec(bizInput({ themeId: '不存在的主题', format: 'poster' }))
  assert.deepEqual(spec.palette, {
    primary: POSTER_THEMES[DEFAULT_THEME_ID].primary,
    background: POSTER_THEMES[DEFAULT_THEME_ID].background,
    onPrimary: POSTER_THEMES[DEFAULT_THEME_ID].onPrimary,
    emphasis: POSTER_THEMES[DEFAULT_THEME_ID].emphasis,
  })
  assert.deepEqual(spec.size, POSTER_SIZES[DEFAULT_FORMAT])
})

test('非法入参不抛错：null / 字符串 / 数字 / 数组 / 空对象都返回可渲染的兜底 spec', () => {
  for (const bad of [null, undefined, 'string', 42, [], {}]) {
    const spec = resolveSpec(bad)
    assert.equal(typeof spec.content.headline, 'string', `${JSON.stringify(bad)} 应有 headline 回落`)
    assert.ok(spec.content.headline.length > 0)
    assert.deepEqual(spec.size, POSTER_SIZES[DEFAULT_FORMAT])
    assert.deepEqual(spec.palette, {
      primary: POSTER_THEMES[DEFAULT_THEME_ID].primary,
      background: POSTER_THEMES[DEFAULT_THEME_ID].background,
      onPrimary: POSTER_THEMES[DEFAULT_THEME_ID].onPrimary,
      emphasis: POSTER_THEMES[DEFAULT_THEME_ID].emphasis,
    })
    assert.ok(Array.isArray(spec.content.facts))
  }
})

test('纯函数性：入参不被改动、同输入两次输出完全相等', () => {
  const input = bizInput()
  const snapshot = JSON.parse(JSON.stringify(input))
  const a = resolveSpec(input)
  const b = resolveSpec(input)
  assert.deepEqual(input, snapshot, '入参必须原样不动')
  assert.equal(JSON.stringify(a), JSON.stringify(b))
})

test('facts 归一：非对象项与缺 label / value 的项被丢弃，顺序保持', () => {
  const spec = resolveSpec(
    bizInput({
      content: {
        headline: 'x',
        facts: [
          null,
          'nope',
          { label: '时间', value: '周六 09:00' },
          { label: '只有 label' },
          { label: '数值 value', value: 1 },
          { value: '只有 value' },
          { label: '地点', value: '北高峰' },
        ],
      },
    })
  )
  assert.deepEqual(spec.content.facts, [
    { label: '时间', value: '周六 09:00' },
    { label: '地点', value: '北高峰' },
  ])
})

test('qr 归一：缺省字段填默认（黑码白底 + quietZone），url 非法回落空串', () => {
  const spec = resolveSpec(bizInput())
  assert.deepEqual(spec.qr, {
    url: 'https://share.hxym18.com/s/abc123',
    foreground: '#000000',
    background: '#FFFFFF',
    quietZone: 2,
  })

  // url 类型非法 → 回落空串（渲染层按「无二维码」处理，不抛错）
  const badQr = resolveSpec(bizInput({ qr: { url: 123 } }))
  assert.equal(badQr.qr.url, '')

  // 整个 qr 字段缺失 → 全默认
  const { qr: _omit, ...noQr } = bizInput()
  const withoutQr = resolveSpec(noQr)
  assert.equal(withoutQr.qr.url, '')
  assert.equal(withoutQr.qr.quietZone, 2)
})

test('主题色板：六组主题齐备，每组成员完整（name + 四色均为 6 位 hex）', () => {
  const ids = Object.keys(POSTER_THEMES)
  assert.equal(ids.length, 6)
  assert.ok(ids.includes(DEFAULT_THEME_ID))
  for (const id of ids) {
    const theme = POSTER_THEMES[id]
    assert.equal(typeof theme.name, 'string')
    assert.ok(theme.name.length > 0)
    for (const key of ['primary', 'background', 'onPrimary', 'emphasis']) {
      assert.ok(/^#[0-9A-Fa-f]{6}$/.test(theme[key]), `${id}.${key} 应为 6 位 hex 色值`)
    }
  }
})

test('版式尺寸：card / long / og 三档，宽高均为正整数', () => {
  assert.deepEqual([...POSTER_FORMATS], ['card', 'long', 'og'])
  for (const [format, size] of Object.entries(POSTER_SIZES)) {
    assert.ok(POSTER_FORMATS.includes(format))
    assert.ok(Number.isInteger(size.w) && size.w > 0, `${format}.w 应为正整数`)
    assert.ok(Number.isInteger(size.h) && size.h > 0, `${format}.h 应为正整数`)
  }
})

test('headline / subline / owner / cta 归一：字符串原样保留，其余类型按空串处理', () => {
  const spec = resolveSpec(
    bizInput({
      content: { headline: 42, subline: null, owner: ['a'], cta: '长按识别二维码' },
    })
  )
  assert.equal(spec.content.headline.length > 0, true, 'headline 非法时应回落默认文案而不是空串')
  assert.equal(spec.content.subline, '')
  assert.equal(spec.content.owner, '')
  assert.equal(spec.content.cta, '长按识别二维码')
})

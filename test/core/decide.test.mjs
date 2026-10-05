/**
 * tests/decide.test.mjs — 动作决策与提示计划（node:test，零依赖）
 * 覆盖 Unit 3 的 9 条：各环境唯一动作、兜底与中性说明、产物闸、纯函数性
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  ARTIFACT_PREFERENCE,
  FALLBACK_ACTION,
  INTUITIVE_CONFLICT_ENVS,
  NEUTRAL_HINT_IDS,
  PRE_HINTS,
  REASON_CODES,
  SIGNAL_FALLBACK,
  UNCONDITIONAL_ACTIONS,
  decideAction,
  listActions,
} from '../../src/core/decide.mjs'
import { ACTIONS } from '../../src/core/actions.mjs'
import { DEFAULT_MENU_TERM_DENYLIST, getCopy, isStrongGuidance } from '../../src/core/copy.mjs'
import { CAPABILITY_TABLE, ENV_KEYS } from '../../src/core/capability-table.mjs'

/** 指纹构造（只给判定用到的维度） */
function fp(container, os, engine = 'unknown') {
  return { container, os, engine, versionBand: 'unknown', unknown: [] }
}

test('iOS Safari 且产物是图片：primary=share.system，且带事前说明', () => {
  const plan = decideAction({ fingerprint: fp('browser', 'ios', 'wkwebview'), artifactKind: 'image' })
  assert.equal(plan.primary, 'share.system')
  assert.ok(plan.hint, 'iOS 上分享面板还要再选一次，必须给事前说明')
  assert.equal(plan.hint.copyId, 'share-system-image')
  assert.equal(plan.hint.tier, 'pre')
  assert.equal(plan.reason, REASON_CODES.primaryAvailable)
  assert.equal(plan.fallback, FALLBACK_ACTION)
  // 不得出现「已保存」这类断言式文案
  assert.equal(/已保存|saved/.test(JSON.stringify(plan)), false)
})

test('微信内置浏览器且产物是图片：primary=preview.longpress，绝不落 save.album', () => {
  const plan = decideAction({ fingerprint: fp('wechat', 'ios', 'wkwebview'), artifactKind: 'image' })
  assert.equal(plan.primary, 'preview.longpress')
  assert.notEqual(plan.primary, 'save.album')
  assert.equal(plan.fallback, 'copy.link')
  assert.equal(plan.hint.copyId, 'longpress-image')
  assert.equal(plan.reason, REASON_CODES.primaryAvailable)
})

test('微信内置浏览器且产物是视频：primary=copy.link，说明去外部浏览器，无「已保存」语义', () => {
  const plan = decideAction({ fingerprint: fp('wechat', 'ios', 'wkwebview'), artifactKind: 'video' })
  assert.equal(plan.primary, 'copy.link')
  assert.equal(plan.fallback, null, 'primary 已是兜底动作时不再给 fallback')
  assert.equal(plan.reason, REASON_CODES.artifactNotSupported)
  assert.equal(plan.hint.copyId, 'external-open-video')
  assert.ok(plan.hint.params.container, '需填 {container} 占位')
  assert.equal(/已保存|saved/.test(JSON.stringify(plan)), false)
  const text = getCopy(plan.hint.copyId).text
  assert.ok(/浏览器/.test(text), '文案要说清替代路径')
})

test('微信桌面版：不给长按引导（AE2）', () => {
  const plan = decideAction({ fingerprint: fp('wechat-desktop', 'macos', 'blink'), artifactKind: 'image' })
  assert.ok(plan.hint === null || plan.hint.copyId !== 'longpress-image')
  assert.notEqual(plan.primary, 'preview.longpress')
  assert.equal(plan.primary, 'copy.link')
})

test('未知环境：primary=copy.link，提示为中性文案且不含禁用词', () => {
  const plan = decideAction({
    fingerprint: { container: 'unknown', os: 'unknown', engine: 'unknown', versionBand: 'unknown', unknown: ['container', 'os', 'engine', 'versionBand'] },
    artifactKind: 'image',
  })
  assert.equal(plan.primary, 'copy.link')
  assert.equal(plan.reason, REASON_CODES.unknownEnv)
  assert.equal(plan.hint.copyId, NEUTRAL_HINT_IDS.image)
  assert.equal(isStrongGuidance(plan.hint.copyId), false, '未知环境不得给强引导')
  const text = getCopy(plan.hint.copyId).text
  assert.deepEqual(DEFAULT_MENU_TERM_DENYLIST.filter((w) => text.includes(w)), [])
})

test('非微信浏览器且可分享文件：primary=share.system', () => {
  const withSignal = decideAction({
    fingerprint: fp('browser', 'macos', 'blink'),
    artifactKind: 'image',
    signals: { canShareFiles: true },
  })
  assert.equal(withSignal.primary, 'share.system')

  // 信号明确否决时降级到下一顺位，且原因如实标注
  const denied = decideAction({
    fingerprint: fp('browser', 'macos', 'blink'),
    artifactKind: 'image',
    signals: { canShareFiles: false },
  })
  assert.equal(denied.primary, 'save.album')
  assert.equal(denied.reason, REASON_CODES.primaryAvailable)

  // 连下一顺位也被否决（无 a[download]）→ 落复制链接，原因标为信号否决
  const allDenied = decideAction({
    fingerprint: fp('browser', 'macos', 'blink'),
    artifactKind: 'image',
    signals: { canShareFiles: false, hasDownloadAttr: false },
  })
  assert.equal(allDenied.primary, 'copy.link')
  assert.equal(allDenied.reason, REASON_CODES.signalGated)
})

test('信号闸按产物区分：canShareFiles=false 只闸带文件的产物，link 的 share.system 不被过杀', () => {
  // 桌面 Chrome 现场：navigator.share 存在（Level 1：url/text/title），
  // canShare({files})===false（桌面不支持文件分享）——两信号分裂
  const base = {
    fingerprint: fp('browser', 'macos', 'blink'),
    signals: { hasShare: true, canShareFiles: false, hasTransientActivation: true, hasDownloadAttr: true },
  }
  // link 不带文件：share({url}) 本可用，必须入列（此前被无差别闸掉，与能力表矛盾）
  const link = listActions({ ...base, artifactKind: 'link' })
  assert.deepEqual(link.actions.map((a) => a.id), ['share.system', 'copy.link'])
  // image / video 要带文件：canShareFiles 如实闸掉，落下一顺位
  for (const kind of ['image', 'video']) {
    const r = listActions({ ...base, artifactKind: kind })
    assert.equal(r.actions.some((a) => a.id === 'share.system'), false, `${kind} 不该有 share.system`)
    assert.equal(r.actions[0].id, 'save.album')
  }
  // navigator.share 不存在（Firefox / Safari 桌面）：link 也无路可走，不得列必失败项
  const noShare = listActions({ ...base, artifactKind: 'link', signals: { ...base.signals, hasShare: false } })
  assert.deepEqual(noShare.actions.map((a) => a.id), ['copy.link'])
  assert.equal(noShare.reason, REASON_CODES.signalGated)
})

test('iOS 装到桌面的 PWA 且产物是图片：唯一动作 share.system，提示按本环境给', () => {
  const plan = decideAction({ fingerprint: fp('pwa-standalone', 'ios', 'wkwebview'), artifactKind: 'image' })
  assert.equal(plan.primary, 'share.system')
  assert.equal(plan.hint.copyId, 'share-system-image')
  assert.equal(INTUITIVE_CONFLICT_ENVS.includes('pwa-standalone:ios'), true)

  // 不照搬微信内与桌面浏览器：桌面点一下就好，不需要事前说明
  const wechat = decideAction({ fingerprint: fp('wechat', 'ios', 'wkwebview'), artifactKind: 'image' })
  const desktop = decideAction({ fingerprint: fp('browser', 'macos', 'blink'), artifactKind: 'image' })
  assert.notEqual(plan.hint.copyId, wechat.hint.copyId)
  assert.equal(desktop.hint, null, '桌面浏览器操作符合直觉，不该给事前说明')
  assert.equal(desktop.reason, REASON_CODES.primaryAvailable)
})

test('未实测格不给强引导：整行未实测的环境一律中性兜底', () => {
  const plan = decideAction({ fingerprint: fp('douyin', 'harmony', 'unknown'), artifactKind: 'image' })
  assert.equal(plan.primary, 'copy.link')
  assert.equal(plan.reason, REASON_CODES.unknownEnv)
  assert.equal(isStrongGuidance(plan.hint.copyId), false)
  assert.equal(plan.hint.copyId, NEUTRAL_HINT_IDS.image)
})

test('非法产物种类：中性兜底，不抛错', () => {
  const plan = decideAction({ fingerprint: fp('browser', 'ios'), artifactKind: 'audio' })
  assert.equal(plan.primary, 'copy.link')
  assert.equal(plan.reason, REASON_CODES.noArtifactKind)
  assert.equal(plan.hint.copyId, NEUTRAL_HINT_IDS.link)
  assert.equal(decideAction(null).reason, REASON_CODES.noArtifactKind)
  assert.equal(decideAction().primary, 'copy.link')
})

test('纯函数性：同输入两次输出相等，两次调用互不影响', () => {
  const fingerprint = fp('wechat', 'ios', 'wkwebview')
  const a = decideAction({ fingerprint, artifactKind: 'image' })
  const b = decideAction({ fingerprint, artifactKind: 'video' })
  const a2 = decideAction({ fingerprint, artifactKind: 'image' })
  assert.equal(JSON.stringify(a), JSON.stringify(a2))
  assert.notEqual(a.primary, b.primary)
  assert.equal(JSON.stringify(a), JSON.stringify(decideAction({ fingerprint, artifactKind: 'image' })))
  assert.deepEqual(fingerprint, fp('wechat', 'ios', 'wkwebview'), '入参不得被改动')
})

test('表结构自洽：偏好序覆盖六项动作、闸表与提示表里的动作与文案都存在', () => {
  const known = new Set(Object.keys(ACTIONS))
  for (const [kind, order] of Object.entries(ARTIFACT_PREFERENCE)) {
    assert.equal(order[order.length - 1], FALLBACK_ACTION, `${kind} 的偏好序必须以兜底动作收尾`)
    for (const id of order) assert.ok(known.has(id), `${kind} 偏好序出现未知动作 ${id}`)
  }
  assert.deepEqual([...UNCONDITIONAL_ACTIONS], [FALLBACK_ACTION])
  for (const [envKey, copyId] of Object.entries(PRE_HINTS)) {
    assert.ok(envKey.includes('|'), '提示表键必须是 `<环境键>|<产物种类>`')
    assert.ok(getCopy(copyId), `提示表引用了不存在的文案 ${copyId}`)
  }
  for (const copyId of Object.values(NEUTRAL_HINT_IDS)) {
    assert.ok(getCopy(copyId), `中性文案缺失 ${copyId}`)
    assert.equal(isStrongGuidance(copyId), false, '中性文案不得进强引导清单')
  }
  // 能力表的每个环境键都必须能过决策而不抛错
  for (const key of ENV_KEYS) {
    const [container, os] = key.split(':')
    const plan = decideAction({ fingerprint: fp(container, os), artifactKind: 'link' })
    assert.ok(known.has(plan.primary), `${key} 决策出未知动作`)
  }
})

test('决策层不出现任何平台接口名（人工核对项固化为断言）', () => {
  const src = readFileSync(new URL('../../src/core/decide.mjs', import.meta.url), 'utf8')
  // 只认标识符形态，避免误伤 `wechat-desktop:windows` 这类环境键
  const banned = [/\bnavigator\b/, /\bdocument\b/, /\bwindow\b(?!s)/, /\bwx\./, /\btt\./]
  for (const pattern of banned) {
    assert.equal(pattern.test(src), false, `decide.mjs 不得出现 ${pattern}`)
  }
})

test('微信内 link：primary=share.card.wx 且带 card-wx-link 事前说明（2026-09-18 补）', () => {
  for (const os of ['ios', 'android']) {
    const plan = decideAction({ fingerprint: fp('wechat', os), artifactKind: 'link' })
    assert.equal(plan.primary, 'share.card.wx')
    assert.equal(plan.hint.copyId, 'card-wx-link')
    assert.equal(plan.fallback, 'copy.link')
  }
})

test('PC 微信 link：同样出 card-wx-link 事前说明（点按钮不会弹面板）', () => {
  for (const os of ['macos', 'windows']) {
    const plan = decideAction({ fingerprint: fp('wechat-desktop', os), artifactKind: 'link' })
    assert.equal(plan.primary, 'share.card.wx')
    assert.equal(plan.hint.copyId, 'card-wx-link')
  }
})

test('小程序 web-view link：不出微信卡片提示，落中性说明', () => {
  const plan = decideAction({ fingerprint: fp('wechat-miniprogram-webview', 'ios'), artifactKind: 'link' })
  assert.equal(plan.primary, 'copy.link')
  assert.equal(plan.hint.copyId, NEUTRAL_HINT_IDS.link)
})

test('每条事前说明都指向表内存在的文案（防悬空 id）', () => {
  for (const [key, copyId] of Object.entries(PRE_HINTS)) {
    assert.ok(getCopy(copyId), `${key} 指向不存在的文案 ${copyId}`)
  }
})

// —— 信号兜底（2026-09-18 出资人口径：「能分享才给分享，不能分享就走下载」）——

test('PC 微信打开海报：无分享动作可用时靠信号落下载，不再只能复制链接', () => {
  for (const os of ['macos', 'windows']) {
    const plan = decideAction({
      fingerprint: fp('wechat-desktop', os),
      artifactKind: 'image',
      signals: { hasDownloadAttr: true },
    })
    assert.equal(plan.primary, 'save.album', `${os}：图片产物应落下载`)
    assert.equal(plan.reason, REASON_CODES.signalFallback)
    assert.equal(plan.hint, null, '下载是自明动作，不该给事前说明（更不能拿「复制链接」的中性文案冒充）')
    assert.equal(plan.fallback, 'copy.link', '复制链接仍作次选保留')
  }
})

test('信号说探不到 a[download]：如实退回复制链接，不硬给下载', () => {
  const plan = decideAction({
    fingerprint: fp('wechat-desktop', 'macos'),
    artifactKind: 'image',
    signals: { hasDownloadAttr: false },
  })
  assert.equal(plan.primary, 'copy.link')
  assert.equal(plan.hint.copyId, NEUTRAL_HINT_IDS.image)
})

test('没传 signals 的调用不猜：首帧中性计划仍落复制链接', () => {
  // fang 首帧用 neutralPlan(kind)（不传 signals）兜底，若这里改判下载，微信内的按钮会先闪一下「保存到本机」
  const plan = decideAction({ artifactKind: 'image' })
  assert.equal(plan.primary, 'copy.link')
  assert.equal(plan.reason, REASON_CODES.unknownEnv)
})

test('信号兜底只管图片与视频：链接没有「存到本地」的语义', () => {
  assert.deepEqual(Object.keys(SIGNAL_FALLBACK).sort(), ['image', 'video'])
  const plan = decideAction({
    fingerprint: fp('wechat-miniprogram-webview', 'ios'),
    artifactKind: 'link',
    signals: { hasDownloadAttr: true },
  })
  assert.equal(plan.primary, 'copy.link', 'link 产物即使探得到 a[download] 也不走下载')
})

test('PC 微信的 save.album 不得再被判成确定不可用（「无相册」是手机语义的理由）', () => {
  for (const key of ['wechat-desktop:macos', 'wechat-desktop:windows']) {
    assert.equal(CAPABILITY_TABLE[key]['save.album'].evidence, '未实测', `${key} 的 save.album 应如实留未实测`)
    assert.equal(CAPABILITY_TABLE[key]['save.album'].available, null)
  }
})

// —— listActions（Action Sheet 决策单源，红线 2）——

/** 点击瞬间的信号形态：一次性用户激活已发生、特性探测已可做 */
const CLICK_SIGNALS = { canShareFiles: true, hasTransientActivation: true, hasDownloadAttr: true }

test('listActions 与 decideAction 永远一致：主推荐 = decideAction 的 primary', () => {
  const cases = [
    ['browser', 'ios', 'image', CLICK_SIGNALS],
    ['browser', 'ios', 'image', null],
    ['wechat', 'ios', 'image', null],
    ['wechat', 'android', 'video', null],
    ['wechat-desktop', 'macos', 'link', null],
    ['browser', 'macos', 'image', CLICK_SIGNALS],
    ['wechat-miniprogram-webview', 'ios', 'link', null],
    ['douyin', 'harmony', 'image', null],
  ]
  for (const [container, os, kind, signals] of cases) {
    const plan = decideAction({ fingerprint: fp(container, os), artifactKind: kind, signals: signals || undefined })
    const list = listActions({ fingerprint: fp(container, os), artifactKind: kind, signals: signals || undefined })
    assert.equal(list.actions[0].id, plan.primary, `${container}:${os} ${kind} 主推荐必须与 primary 一致`)
    assert.equal(list.reason, plan.reason)
    assert.equal(list.actions.filter((a) => a.isPrimary).length, 1, '主推荐恰一个')
  }
})

test('iOS 浏览器图片·点击瞬间：[系统分享(主), 查看大图, 复制链接]，绝不列会失败的项', () => {
  const list = listActions({ fingerprint: fp('browser', 'ios', 'wkwebview'), artifactKind: 'image', signals: CLICK_SIGNALS })
  assert.deepEqual(list.actions.map((a) => a.id), ['share.system', 'preview.longpress', 'copy.link'])
  assert.equal(list.actions[0].isPrimary, true)
  // save.album 在 iOS 浏览器能力表为 false（落「文件」不进相册），不得入列
  assert.equal(list.actions.some((a) => a.id === 'save.album'), false)
})

test('iOS 浏览器图片·首帧（无激活）：系统分享被信号闸挡，不在列', () => {
  const list = listActions({ fingerprint: fp('browser', 'ios', 'wkwebview'), artifactKind: 'image', signals: { hasTransientActivation: false, canShareFiles: true, hasDownloadAttr: true } })
  assert.deepEqual(list.actions.map((a) => a.id), ['preview.longpress', 'copy.link'])
})

test('微信 iOS 图片：[查看大图(主), 复制链接]（卡片带不动图片，被产物闸挡）', () => {
  const list = listActions({ fingerprint: fp('wechat', 'ios', 'wkwebview'), artifactKind: 'image', signals: CLICK_SIGNALS })
  assert.deepEqual(list.actions.map((a) => a.id), ['preview.longpress', 'copy.link'])
  assert.equal(list.actions.some((a) => a.id === 'share.card.wx'), false, 'share.card.wx 只带 link')
})

test('微信 iOS 链接：[转发卡片(主), 复制链接]', () => {
  const list = listActions({ fingerprint: fp('wechat', 'ios', 'wkwebview'), artifactKind: 'link', signals: CLICK_SIGNALS })
  assert.deepEqual(list.actions.map((a) => a.id), ['share.card.wx', 'copy.link'])
})

test('桌面浏览器图片·点击瞬间：[系统分享(主), 保存本机, 复制链接]', () => {
  const list = listActions({ fingerprint: fp('browser', 'macos', 'blink'), artifactKind: 'image', signals: CLICK_SIGNALS })
  assert.deepEqual(list.actions.map((a) => a.id), ['share.system', 'save.album', 'copy.link'])
})

test('小程序 web-view：唯一动作复制链接，主推荐落在它身上', () => {
  const list = listActions({ fingerprint: fp('wechat-miniprogram-webview', 'ios'), artifactKind: 'image', signals: CLICK_SIGNALS })
  assert.deepEqual(list.actions.map((a) => a.id), ['copy.link'])
  assert.equal(list.actions[0].isPrimary, true)
})

test('信号兜底入列：PC 微信图片 + 探得 a[download] → [保存本机(主), 复制链接]', () => {
  const list = listActions({ fingerprint: fp('wechat-desktop', 'macos'), artifactKind: 'image', signals: { hasDownloadAttr: true } })
  assert.deepEqual(list.actions.map((a) => a.id), ['save.album', 'copy.link'])
  assert.equal(list.reason, REASON_CODES.signalFallback)
})

test('文档级否决优先于运行时信号：能力表明确 false 的环境不走信号兜底', () => {
  // 小程序 web-view 的 save.album 是文档级 false（H5 不能写相册）；
  // a[download] 特性探测为 true 不代表下载不被宿主屏蔽——绝不列会失败的项（红线 2）
  const list = listActions({ fingerprint: fp('wechat-miniprogram-webview', 'ios'), artifactKind: 'image', signals: { hasDownloadAttr: true } })
  assert.deepEqual(list.actions.map((a) => a.id), ['copy.link'])
  const plan = decideAction({ fingerprint: fp('wechat-miniprogram-webview', 'android'), artifactKind: 'video', signals: { hasDownloadAttr: true } })
  assert.equal(plan.primary, 'copy.link', '微信内视频同样不得凭特性探测承诺下载')
})

test('非法产物种类：只列复制链接，不抛错', () => {
  const list = listActions({ fingerprint: fp('browser', 'ios'), artifactKind: 'audio' })
  assert.deepEqual(list.actions.map((a) => a.id), ['copy.link'])
  assert.equal(list.reason, REASON_CODES.noArtifactKind)
  assert.equal(listActions(null).actions[0].id, 'copy.link')
})

test('copy.link 恒在列：全部环境键 × 三种产物逐一断言（Action Sheet 绝不空列）', () => {
  for (const key of ENV_KEYS) {
    const [container, os] = key.split(':')
    for (const kind of ['image', 'video', 'link']) {
      const list = listActions({ fingerprint: fp(container, os), artifactKind: kind, signals: CLICK_SIGNALS })
      assert.ok(list.actions.length >= 1, `${key} ${kind} 不得空列`)
      assert.ok(list.actions.some((a) => a.id === FALLBACK_ACTION), `${key} ${kind} 必须含复制链接`)
      const order = ARTIFACT_PREFERENCE[kind]
      const ids = list.actions.map((a) => a.id)
      assert.deepEqual([...ids].sort((a, b) => order.indexOf(a) - order.indexOf(b)), ids, `${key} ${kind} 必须保持偏好序`)
    }
  }
})

test('listActions 纯函数性：同输入同输出、不改入参', () => {
  const fingerprint = fp('wechat', 'ios', 'wkwebview')
  const a = listActions({ fingerprint, artifactKind: 'image', signals: CLICK_SIGNALS })
  const b = listActions({ fingerprint, artifactKind: 'image', signals: CLICK_SIGNALS })
  assert.equal(JSON.stringify(a), JSON.stringify(b))
  assert.deepEqual(fingerprint, fp('wechat', 'ios', 'wkwebview'), '入参不得被改动')
})
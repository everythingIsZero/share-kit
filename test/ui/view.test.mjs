/**
 * view.test.mjs — Action Sheet 视图模型（node:test，零依赖纯函数）
 * 覆盖：标签映射与覆盖、唯一动作直出按钮文案、sheet 项结构与主推荐标记。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { SHEET_LABELS, buttonLabelOf, sheetItemsOf, sheetTitleOf } from '../../src/ui/view.mjs'
import { listActions } from '../../src/core/decide.mjs'

/** 指纹构造（只给判定用到的维度） */
function fp(container, os, engine = 'unknown') {
  return { container, os, engine, versionBand: 'unknown', unknown: [] }
}

const CLICK = { canShareFiles: true, hasTransientActivation: true, hasDownloadAttr: true }

test('sheetItemsOf：项数据带标签与主推荐标记，保持偏好序', () => {
  const list = listActions({ fingerprint: fp('browser', 'ios', 'wkwebview'), artifactKind: 'image', signals: CLICK })
  const items = sheetItemsOf(list, 'image')
  assert.deepEqual(items.map((i) => i.id), ['share.system', 'preview.longpress', 'copy.link'])
  assert.deepEqual(
    items.map((i) => i.label),
    ['系统分享', '查看大图', '复制链接']
  )
  assert.equal(items[0].isPrimary, true)
  assert.equal(items.filter((i) => i.isPrimary).length, 1)
})

test('save.album 标签按产物区分：图片「保存图片」、视频「保存视频」', () => {
  const image = sheetItemsOf(listActions({ fingerprint: fp('browser', 'macos', 'blink'), artifactKind: 'image', signals: CLICK }), 'image')
  const video = sheetItemsOf(listActions({ fingerprint: fp('browser', 'macos', 'blink'), artifactKind: 'video', signals: CLICK }), 'video')
  assert.equal(image.find((i) => i.id === 'save.album').label, '保存图片')
  assert.equal(video.find((i) => i.id === 'save.album').label, '保存视频')
})

test('labels.actions 覆盖项文案，labels.button 覆盖多项时的按钮文案', () => {
  const list = listActions({ fingerprint: fp('browser', 'ios', 'wkwebview'), artifactKind: 'image', signals: CLICK })
  const labels = { button: '分享海报', actions: { 'share.system': '更多方式' } }
  const items = sheetItemsOf(list, 'image', labels)
  assert.equal(items.find((i) => i.id === 'share.system').label, '更多方式')
  assert.equal(items.find((i) => i.id === 'copy.link').label, '复制链接', '未覆盖的用默认')
  assert.equal(buttonLabelOf(list, 'image', labels), '分享海报')
})

test('buttonLabelOf：唯一动作直出动作名（小程序 web-view → 复制链接）', () => {
  const list = listActions({ fingerprint: fp('wechat-miniprogram-webview', 'ios'), artifactKind: 'image', signals: CLICK })
  assert.deepEqual(list.actions.map((a) => a.id), ['copy.link'])
  assert.equal(buttonLabelOf(list, 'image'), '复制链接')
})

test('buttonLabelOf：多项动作给通用「分享」，不预示具体方式', () => {
  const list = listActions({ fingerprint: fp('wechat', 'ios', 'wkwebview'), artifactKind: 'image', signals: CLICK })
  assert.equal(buttonLabelOf(list, 'image'), '分享')
})

test('非法输入不抛错：缺列表时按复制链接兜底成项', () => {
  const items = sheetItemsOf(null, 'image')
  assert.deepEqual(items, [{ id: 'copy.link', label: '复制链接', isPrimary: true }])
  assert.equal(buttonLabelOf(undefined, 'video'), '复制链接')
})

test('sheetTitleOf：默认「选择分享方式」，可覆盖', () => {
  assert.equal(sheetTitleOf(), '选择分享方式')
  assert.equal(sheetTitleOf({ sheetTitle: '分享这张海报' }), '分享这张海报')
})

test('全部动作都有默认标签（sheet 不出现裸 id）', () => {
  for (const id of ['share.system', 'save.album', 'preview.longpress', 'share.card.wx', 'share.card.miniapp', 'copy.link']) {
    assert.ok(SHEET_LABELS[id], `${id} 缺默认标签`)
  }
})

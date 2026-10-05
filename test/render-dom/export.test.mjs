/**
 * test/render-dom/export.test.mjs — 导出降级链（node:test）
 * 覆盖：blob URL 优先 / toBlob 回调 null（iOS 内存不足）降级 dataURL / 异常不外抛
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { canvasToBlob, exportPng } from '../../src/render-dom/export.mjs'

/** 造一个假 canvas：toBlob / toDataURL 行为可控 */
function fakeCanvas({ blob = null, blobThrows = false, dataUrl = 'data:image/png;base64,FALLBACK' } = {}) {
  return {
    toBlob(cb) {
      if (blobThrows) throw new Error('toBlob exploded')
      // 模拟浏览器异步回调
      queueMicrotask(() => cb(blob))
    },
    toDataURL() {
      return dataUrl
    },
  }
}

test('canvasToBlob：toBlob 回调 null（iOS 大画布内存不足）时返回 null 而不是悬挂', async () => {
  assert.equal(await canvasToBlob(fakeCanvas({ blob: null })), null)
})

test('canvasToBlob：toBlob 抛错时吞掉并返回 null（不让异常烧到调用方）', async () => {
  assert.equal(await canvasToBlob(fakeCanvas({ blobThrows: true })), null)
})

test('exportPng：无 createObjectURL 环境走 dataURL 分支（临时摘除 API 模拟）', async () => {
  const original = URL.createObjectURL
  URL.createObjectURL = undefined // node 25 起原生提供此 API，需手动摘除才能模拟无 API 环境
  try {
    const result = await exportPng(fakeCanvas({ blob: new Blob(['x'], { type: 'image/png' }) }))
    assert.equal(result.kind, 'data-url')
    assert.equal(result.url, 'data:image/png;base64,FALLBACK')
  } finally {
    URL.createObjectURL = original // 测完即还原，不污染其它测试
  }
})

test('exportPng：blob 为 null 时降级 dataURL（绝不静默无反应）', async () => {
  const result = await exportPng(fakeCanvas({ blob: null }))
  assert.equal(result.kind, 'data-url')
  assert.equal(result.url, 'data:image/png;base64,FALLBACK')
})

test('exportPng：有 createObjectURL 时 blob URL 优先（体积小、避 JPEG 黑边坑）', async () => {
  const original = URL.createObjectURL
  URL.createObjectURL = () => 'blob:fake-url' // 临时 patch（node 原生没有此 API）
  try {
    const result = await exportPng(fakeCanvas({ blob: new Blob(['x'], { type: 'image/png' }) }))
    assert.equal(result.kind, 'blob-url')
    assert.equal(result.url, 'blob:fake-url')
  } finally {
    URL.createObjectURL = original // 测完即还原，不污染其它测试
  }
})

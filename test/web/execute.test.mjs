/**
 * execute.test.mjs — 动作执行（Unit 5 场景 5-7）
 *
 * 重点是 R14 的同步阶段契约：调用必须在同一个同步段里发出，`await` 只出现在其后。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { executeAction, ACTION_DEP_MAP, GUIDANCE_ACTIONS } from '../../src/web/execute.mjs'

test('复制动作调用注入实现：链接原样传给 copy，返回成功', async () => {
  let seen = null
  const result = await executeAction('copy.link', {
    url: 'https://example.com/a?p=1',
    copy: (t) => {
      seen = t
      return true
    },
  })
  assert.equal(seen, 'https://example.com/a?p=1')
  assert.equal(result.ok, true)
  assert.equal(result.outcome, 'done')
  assert.equal(result.action, 'copy.link')
})

test('取消判为取消而非失败：AbortError 落 cancelled', async () => {
  const result = await executeAction('share.system', {
    share: () => Promise.reject(Object.assign(new Error('user abort'), { name: 'AbortError' })),
  })
  assert.equal(result.ok, false)
  assert.equal(result.outcome, 'cancelled')
})

test('同步阶段契约：注入实现先同步被调用，await 只在其后', async () => {
  let calledBeforeAwait = false
  // 注意：这里**不 await**，先断言调用已经发出
  const pending = executeAction('share.system', {
    share: () => {
      calledBeforeAwait = true
      return Promise.resolve()
    },
  })
  assert.equal(calledBeforeAwait, true, '调用必须在同步段内发出（R14）')

  const result = await pending
  assert.equal(calledBeforeAwait, true)
  assert.equal(result.ok, true)
  assert.equal(result.outcome, 'done')
})

test('系统分享传参：有 files 只传图不带 url（防 iOS 面板把链接当主体），无 files 才传 url', async () => {
  let seen = null
  const deps = (extra) => ({ url: 'https://example.com/p', ...extra, share: (d) => { seen = d; return Promise.resolve() } })
  // 有文件：分享图就是图，url 不得混入
  await executeAction('share.system', deps({ files: [{ name: 'poster.png' }] }))
  assert.equal(seen.url, undefined, '有 files 时不得传 url')
  assert.equal(seen.files.length, 1)
  // 无文件（link 产物）：url 是分享主体
  await executeAction('share.system', deps({ files: undefined }))
  assert.equal(seen.url, 'https://example.com/p')
  assert.equal(seen.files, undefined)
})

test('引导类动作不调用外部实现：mode 为 guidance，outcome 为 guidance（非 done）', async () => {
  const result = await executeAction('preview.longpress', {})
  assert.equal(result.mode, 'guidance')
  assert.equal(result.ok, true)
  assert.equal(result.outcome, 'guidance', '引导类不得报 done')
  assert.notEqual(result.outcome, 'done')
})

test('引导类动作一律不碰注入实现：给了 share 也不调用，空 deps 也不抛错', async () => {
  // 回归：share.card.wx / share.card.miniapp 曾被误映射到 'share'，
  // 结果在微信内（navigator.share 不存在）真的去调了 share，抛错后 mode 落回 invoked，
  // 界面拿不到 guidance，浮层引导不弹。
  let shareCalls = 0
  for (const action of GUIDANCE_ACTIONS) {
    assert.equal(ACTION_DEP_MAP[action], null, `${action} 的依赖键必须是 null`)
    const withDep = await executeAction(action, { share: () => { shareCalls += 1 } })
    assert.equal(withDep.mode, 'guidance')
    assert.equal(withDep.outcome, 'guidance', `${action} 不得报 done`)
    assert.equal(withDep.ok, true)
    const bare = await executeAction(action, {})
    assert.equal(bare.mode, 'guidance', `${action} 空 deps 也必须给引导`)
    assert.equal(bare.outcome, 'guidance', `${action} 空 deps 也不得报 done`)
    assert.equal(bare.ok, true)
  }
  assert.equal(shareCalls, 0, '引导类动作不得调用注入实现')
})

test('缺注入实现不抛到调用方：转成失败结果', async () => {
  const result = await executeAction('share.system', {})
  assert.equal(result.ok, false)
  assert.equal(result.outcome, 'failed')
})

test('save.download 下载文件源：有 files 用 files[0] 现造 blob，不落页面 url', async () => {
  const seen = []
  const blob = new Blob(['x'], { type: 'image/png' })
  const deps = {
    url: 'https://page/private?token=x',
    fileUrl: 'blob:file',
    files: [blob],
    filename: 'p.png',
    download: (a) => seen.push(a),
  }
  await executeAction('save.download', deps)
  assert.ok(seen[0].url.startsWith('blob:'), '下载源应是文件 blob')
  assert.notEqual(seen[0].url, 'https://page/private?token=x', '不得下载页面 URL')
  assert.notEqual(seen[0].url, 'blob:file', '有 files[0] 时优先于 fileUrl')
  assert.equal(seen[0].filename, 'p.png')
})

test('save.download 无 files 时用 fileUrl，仍不落页面 url', async () => {
  const seen = []
  const deps = {
    url: 'https://page/private?token=x',
    fileUrl: 'blob:file',
    filename: 'p.png',
    download: (a) => seen.push(a),
  }
  await executeAction('save.download', deps)
  assert.equal(seen[0].url, 'blob:file')
  assert.notEqual(seen[0].url, 'https://page/private?token=x', '不得下载页面 URL')
})

test('save.download 无文件源时给空串，绝不回退到 url（页面 HTML）', async () => {
  const seen = []
  await executeAction('save.download', { url: 'https://page/private?token=x', download: (a) => seen.push(a) })
  assert.equal(seen[0].url, '', '无文件源不得拿页面 url 顶替')
})

test('copy.link 空 url 稳健：execute 传空串而非 undefined（不得复制出字面量 "undefined"）', async () => {
  let seen = 'SENTINEL'
  await executeAction('copy.link', { copy: (t) => { seen = t } })
  assert.equal(seen, '', '缺 url 时注入实现应收到空串，而不是 undefined')
})

test('save.download 用 files[0] 现造 blob 后释放对象 URL（不泄漏）', async () => {
  const revoked = []
  const orig = URL.revokeObjectURL
  URL.revokeObjectURL = (u) => revoked.push(u)
  try {
    const blob = new Blob(['x'], { type: 'image/png' })
    const seen = []
    await executeAction('save.download', { files: [blob], filename: 'p.png', download: (a) => seen.push(a) })
    await new Promise((r) => setTimeout(r, 5))
    assert.ok(seen[0].url.startsWith('blob:'), '下载源应是现造的 blob URL')
    assert.deepEqual(revoked, [seen[0].url], '现造的对象 URL 应在用毕后释放')
  } finally {
    URL.revokeObjectURL = orig
  }
})

test('save.download 用 fileUrl 时不释放对象 URL（所有权归调用方）', async () => {
  const revoked = []
  const orig = URL.revokeObjectURL
  URL.revokeObjectURL = (u) => revoked.push(u)
  try {
    await executeAction('save.download', { fileUrl: 'blob:file', download: () => {} })
    await new Promise((r) => setTimeout(r, 5))
    assert.deepEqual(revoked, [], '调用方给的 fileUrl 不得由本包释放')
  } finally {
    URL.revokeObjectURL = orig
  }
})

test('save.album 走系统面板：注入 share 收到 files；缺文件也不拿 url 顶替', async () => {
  let seen = null
  await executeAction('save.album', {
    url: 'https://page/private?token=x',
    files: [{ name: 'p.png' }],
    share: (d) => {
      seen = d
      return Promise.resolve()
    },
  })
  assert.equal(seen.files.length, 1, 'save.album 用文件（系统面板保存）')
  assert.equal(seen.url, undefined, 'save.album 是文件保存，绝不带 url')

  let bare = null
  await executeAction('save.album', {
    url: 'https://page/private?token=x',
    share: (d) => {
      bare = d
      return Promise.resolve()
    },
  })
  assert.equal(bare.url, undefined, '缺 files 时也不得退化成分享链接')
  assert.equal(bare.files, undefined)
})

test('ACTION_DEP_MAP：save.album → share（系统面板），save.download → download（a[download]）', () => {
  assert.equal(ACTION_DEP_MAP['save.album'], 'share')
  assert.equal(ACTION_DEP_MAP['save.download'], 'download')
  assert.notEqual(ACTION_DEP_MAP['save.album'], ACTION_DEP_MAP['save.download'])
})

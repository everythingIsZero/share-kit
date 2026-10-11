/**
 * execute.test.mjs — 动作执行（Unit 5 场景 5-7）
 *
 * 重点是 R14 的同步阶段契约：调用必须在同一个同步段里发出，`await` 只出现在其后。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { executeAction, ACTION_DEP_MAP, GUIDANCE_ACTIONS } from '../../src/web/execute.mjs'

test('复制动作调用注入实现：公开分享链原样传给 copy，返回成功', async () => {
  let seen = null
  const result = await executeAction('copy.link', {
    url: 'https://share.hxym18.com/s/a?p=1',
    copy: (t) => {
      seen = t
      return true
    },
  })
  assert.equal(seen, 'https://share.hxym18.com/s/a?p=1')
  assert.equal(result.ok, true)
  assert.equal(result.outcome, 'done')
  assert.equal(result.action, 'copy.link')
})

test('取消判为取消而非失败：AbortError 落 cancelled', async () => {
  const result = await executeAction('share.system', {
    url: 'https://share.hxym18.com/s/p',
    share: () => Promise.reject(Object.assign(new Error('user abort'), { name: 'AbortError' })),
  })
  assert.equal(result.ok, false)
  assert.equal(result.outcome, 'cancelled')
})

test('同步阶段契约：注入实现先同步被调用，await 只在其后', async () => {
  let calledBeforeAwait = false
  // 注意：这里**不 await**，先断言调用已经发出
  const pending = executeAction('share.system', {
    url: 'https://share.hxym18.com/s/p',
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
  const deps = (extra) => ({ url: 'https://share.hxym18.com/s/p', ...extra, share: (d) => { seen = d; return Promise.resolve() } })
  // 有文件：分享图就是图，url 不得混入
  await executeAction('share.system', deps({ files: [{ name: 'poster.png' }] }))
  assert.equal(seen.url, undefined, '有 files 时不得传 url')
  assert.equal(seen.files.length, 1)
  // 无文件（link 产物）：url 是分享主体
  await executeAction('share.system', deps({ files: undefined }))
  assert.equal(seen.url, 'https://share.hxym18.com/s/p')
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
  // S3：卡片动作用到分享链，必须给公开链才进引导；无公开链时被闸门拦下（见下条测试）。
  const PUBLIC_URL = 'https://share.hxym18.com/s/app/1'
  let shareCalls = 0
  for (const action of GUIDANCE_ACTIONS) {
    assert.equal(ACTION_DEP_MAP[action], null, `${action} 的依赖键必须是 null`)
    const url = action === 'preview.longpress' ? undefined : PUBLIC_URL
    const withDep = await executeAction(action, { url, share: () => { shareCalls += 1 } })
    assert.equal(withDep.mode, 'guidance')
    assert.equal(withDep.outcome, 'guidance', `${action} 不得报 done`)
    assert.equal(withDep.ok, true)
  }
  assert.equal(shareCalls, 0, '引导类动作不得调用注入实现')
  // preview.longpress 不依赖任何入参：空 deps 也必须给引导
  const bare = await executeAction('preview.longpress', {})
  assert.equal(bare.mode, 'guidance', 'preview.longpress 空 deps 也必须给引导')
  assert.equal(bare.outcome, 'guidance')
  assert.equal(bare.ok, true)
})

test('缺注入实现不抛到调用方：转成失败结果', async () => {
  const result = await executeAction('share.system', { url: 'https://share.hxym18.com/s/p' })
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

test('save.download 无文件源时拒绝执行：不调注入实现、返回失败（绝不下到页面 HTML）', async () => {
  let called = false
  const result = await executeAction('save.download', {
    url: 'https://page/private?token=x',
    download: () => { called = true },
  })
  // 真判定：旧代码把空串传给 download，真实浏览器把 `a.href=''` 解析成当前文档 URL → 下到整页 HTML。
  assert.equal(called, false, '无文件源时不得调用下载实现')
  assert.equal(result.ok, false)
  assert.equal(result.outcome, 'failed')
})

test('copy.link 无公开链时拒绝执行：不复制空串 / undefined / 私有页地址', async () => {
  let seen = 'SENTINEL'
  const result = await executeAction('copy.link', { copy: (t) => { seen = t } })
  assert.equal(seen, 'SENTINEL', '缺 url 时不得调用 copy（旧代码把空串复制出去，或复制出字面量 "undefined"）')
  assert.equal(result.ok, false)
  assert.equal(result.outcome, 'blocked')
})

test('S3 闸门（最低公共层）：copy.link 私有页 / token / 非允许域 / 空串均被拦，注入实现不被调用', async () => {
  for (const url of ['https://fang.hxym18.com/ledger?token=secret', 'https://evil.com/x', '', undefined]) {
    let called = 0
    const r = await executeAction('copy.link', { url, copy: () => { called += 1 } })
    assert.equal(called, 0, `不得复制：${String(url)}`)
    assert.equal(r.ok, false)
    assert.equal(r.outcome, 'blocked', `${String(url)} 应判 blocked`)
    assert.equal(r.mode, 'invoked')
  }
})

test('S3 闸门：share.system 无 files 用 url → 私有页被拦；有 files 用文件 → 不误拦', async () => {
  let calls = 0
  const share = () => { calls += 1; return Promise.resolve() }
  const blocked = await executeAction('share.system', { url: 'https://fang.hxym18.com/p?token=s', share })
  assert.equal(calls, 0, '私有 url 不得系统分享')
  assert.equal(blocked.outcome, 'blocked')
  const ok = await executeAction('share.system', { url: 'https://fang.hxym18.com/p?token=s', files: [{ name: 'p.png' }], share })
  assert.equal(calls, 1, '有 files 时走文件、不看 url')
  assert.equal(ok.ok, true)
})

test('S3 闸门：卡片动作（自组 UI 直调 executeAction）私有 url 被拦，不给引导', async () => {
  for (const action of ['share.card.wx', 'share.card.miniapp']) {
    const r = await executeAction(action, { url: 'https://fang.hxym18.com/p?token=s' })
    assert.equal(r.ok, false, `${action} 私有 url 必须被拦`)
    assert.equal(r.outcome, 'blocked', `${action} 不得报 guidance`)
    assert.equal(r.mode, 'invoked', '被拦不是引导')
  }
})

test('S3 闸门：deps.publicHosts 追加站点公开域后放行；未声明仍被拦', async () => {
  let seen = null
  const ok = await executeAction('copy.link', {
    url: 'https://cdn.example.com/s/1',
    publicHosts: ['cdn.example.com'],
    copy: (t) => { seen = t },
  })
  assert.equal(seen, 'https://cdn.example.com/s/1')
  assert.equal(ok.ok, true)
  const blocked = await executeAction('copy.link', { url: 'https://cdn.example.com/s/1', copy: () => {} })
  assert.equal(blocked.outcome, 'blocked')
})

test('S3 闸门：deps.sensitiveQueryKeys 追加敏感键后拦 ?sig=；未追加不改既有行为，默认三键仍在', async () => {
  const url = 'https://share.hxym18.com/s/1?sig=abc'
  // 未追加 sig：按现有行为放行（本用例锚定「追加不做替换、也不改变未追加时的行为」）
  let seen = null
  const ok = await executeAction('copy.link', { url, copy: (t) => { seen = t } })
  assert.equal(seen, url, '未追加 sig 时不得改变既有放行行为')
  assert.equal(ok.ok, true)

  // 追加 sig：带 sig 的链被拦，注入实现不被调用
  let called = 0
  const blocked = await executeAction('copy.link', {
    url,
    sensitiveQueryKeys: ['sig'],
    copy: () => { called += 1 },
  })
  assert.equal(called, 0, '追加 sig 后不得复制带 sig 的链')
  assert.equal(blocked.ok, false)
  assert.equal(blocked.outcome, 'blocked')

  // 追加 sig 不放松默认三键：token 仍被拦（追加是并集，不替换）
  const stillBlocked = await executeAction('copy.link', {
    url: 'https://share.hxym18.com/s/1?token=s',
    sensitiveQueryKeys: ['sig'],
    copy: () => { called += 1 },
  })
  assert.equal(called, 0)
  assert.equal(stillBlocked.outcome, 'blocked', '追加清单不得替换默认三键')
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

test('save.album 走系统面板：有 files 才调 share（只带文件）；无 files 直接失败，绝不发文本', async () => {
  let seen = null
  const ok = await executeAction('save.album', {
    url: 'https://page/private?token=x',
    files: [{ name: 'p.png' }],
    share: (d) => {
      seen = d
      return Promise.resolve()
    },
  })
  assert.equal(ok.ok, true)
  assert.equal(seen.files.length, 1, 'save.album 用文件（系统面板保存）')
  assert.equal(seen.url, undefined, 'save.album 是文件保存，绝不带 url')

  // 无 files：直接失败，不静默发文本分享（与决策层 files 守卫同口径）
  let called = false
  const bare = await executeAction('save.album', {
    url: 'https://page/private?token=x',
    share: () => {
      called = true
      return Promise.resolve()
    },
  })
  assert.equal(called, false, '无 files 不得调用 share')
  assert.equal(bare.ok, false)
  assert.equal(bare.outcome, 'failed')
})

test('ACTION_DEP_MAP：save.album → share（系统面板），save.download → download（a[download]）', () => {
  assert.equal(ACTION_DEP_MAP['save.album'], 'share')
  assert.equal(ACTION_DEP_MAP['save.download'], 'download')
  assert.notEqual(ACTION_DEP_MAP['save.album'], ACTION_DEP_MAP['save.download'])
})

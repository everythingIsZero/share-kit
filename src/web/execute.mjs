/**
 * execute.mjs — 动作执行（R14 的落点）
 *
 * 红线（R14）：点击回调里必须**同步**调用注入的实现，`await` 只允许出现在调用之后——
 * 任何先 `await` 再调用的写法都会烧掉一次性用户激活，iOS 上直接 NotAllowedError。
 * 本文件把「发起调用」与「等待结果」拆成两段：`invoke` 是纯同步段，`settle` 才碰 Promise。
 *
 * 本包不做决策：执行哪个动作由调用方按 core 的执行计划传进来。
 */

import { classifyOutcome } from '../core/index.mjs'
import { actionUsesShareUrl, isPublicShareUrl } from '../core/share-url.mjs'

/**
 * 动作 → 依赖键的映射；值为 null 表示「引导类动作」，不需要外部调用。
 * 保存语义拆分：`save.album`（系统面板保存）走 `share`（`navigator.share({files})`）；
 * `save.download`（直接下载）走 `download`（`a[download]`）。两者不得混用。
 */
export const ACTION_DEP_MAP = Object.freeze({
  'share.system': 'share',
  'save.album': 'share',
  'save.download': 'download',
  'share.card.wx': null,
  'share.card.miniapp': null,
  'copy.link': 'copy',
  'preview.longpress': null,
})

/** 引导类动作：由界面给出一步引导，不调用任何外部实现 */
export const GUIDANCE_ACTIONS = Object.freeze(['preview.longpress', 'share.card.wx', 'share.card.miniapp'])

/**
 * 释放现造的对象 URL（`URL.createObjectURL` 的产物）。
 * 只回收 `blob:` 开头的自造 URL，不碰调用方给的 `fileUrl`（其所有权归调用方）。
 * 延后一个宏任务再 revoke：`a[download]` 的下载在 click 后才真正开始，个别浏览器立即 revoke 会中断下载。
 */
function revokeBlobUrlLater(url) {
  if (typeof url !== 'string' || !url.startsWith('blob:')) return
  if (typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return
  // 捕获函数本身（而非延迟读全局），避免测试替换 URL.revokeObjectURL 时串台
  const revokeFn = URL.revokeObjectURL.bind(URL)
  const revoke = () => revokeFn(url)
  if (typeof setTimeout === 'function') setTimeout(revoke, 0)
  else revoke()
}

/** 调用注入实现（**同步段**：这里绝不能出现 await） */
function invoke(actionId, deps) {
  const depKey = ACTION_DEP_MAP[actionId]
  if (depKey === undefined) throw new TypeError(`未知动作：${actionId}`)

  // S3：动作用到分享链（url）却拿不到公开分享链时**拒绝执行**——绝不把私有页 / 带 token 的地址
  // 复制、系统分享或写进微信卡片。闸门必须落在最低公共层：自组 UI（`listActions` + `executeAction`）
  // 与 React `ShareTrigger` 都直接走本函数，从而自动受控，不经 `mountShare` 也绕不过去。
  if (actionUsesShareUrl(actionId, deps.files) && !isPublicShareUrl(deps.url, deps.publicHosts)) {
    const error = new Error('非公开分享链：拒绝执行（S3）')
    // 复用 classifyOutcome 的既有语义（NotAllowedError → blocked），不新增 outcome 种类
    error.name = 'NotAllowedError'
    throw error
  }

  if (depKey === null) return undefined
  const fn = deps[depKey]
  if (typeof fn !== 'function') throw new TypeError(`动作 ${actionId} 缺少注入实现：${depKey}`)
  if (depKey === 'share') {
    // save.album 是「系统面板保存」：**必须带文件**；缺文件时直接失败，绝不拿 url 顶替
    // （否则就是「点保存却发文本分享」，与决策层的 files 守卫同口径）。
    if (actionId === 'save.album') {
      if (!deps.files || deps.files.length === 0) {
        throw new TypeError('save.album 需要 files（系统面板保存不带文件即无效，拒绝静默发文本）')
      }
      return fn({ files: deps.files, title: deps.title, text: deps.text })
    }
    // 有文件产物时只传 files 不传 url：混传会让 iOS 系统面板 / 微信把链接当主体、图片沦为配角
    if (deps.files && deps.files.length > 0) return fn({ files: deps.files, title: deps.title, text: deps.text })
    return fn({ url: deps.url, title: deps.title, text: deps.text })
  }
  if (depKey === 'download') {
    // save.download：下载源是**文件**（files[0] → fileUrl）。两者都缺时**拒绝执行**——
    // `a.href = ''` 在真实浏览器会解析成当前文档 URL，点「保存图片」实际下到整页 HTML（A 缺陷）。
    // 绝不拿页面 url 顶替，也不把空串交给注入实现。
    const file = deps.files && deps.files[0]
    const fileUrl = typeof deps.fileUrl === 'string' ? deps.fileUrl : ''
    if (!file && fileUrl.length === 0) {
      throw new TypeError('save.download 缺少文件源（files[0] 或 fileUrl），拒绝下载页面 HTML')
    }
    const url = file ? URL.createObjectURL(file) : fileUrl
    const pending = fn({ url, filename: deps.filename })
    // 释放：a[download] 已由同步段发起，现造的对象 URL 用毕即回收（约定同 render-dom/export.mjs），
    // 延后一个宏任务，避免个别浏览器在 click 后立刻 revoke 会中断下载。
    if (file) revokeBlobUrlLater(url)
    return pending
  }
  return fn(deps.url || '')
}

/** 结果归一：错误一律转成四类结果之一，不向上抛 */
function toResult(actionId, error) {
  const outcome = classifyOutcome(error)
  return {
    ok: false,
    outcome,
    action: actionId,
    mode: 'invoked',
    error: error instanceof Error ? error : new Error(String(error)),
  }
}

/**
 * 执行一个动作。`deps` 为注入实现：`{ share, copy, download, openExternal, url, fileUrl, files, title, text, publicHosts }`。
 *
 * `openExternal` 是「去外部浏览器」引导按钮的注入点：本函数**不会自动调用它**——
 * 自动跳浏览器会打断用户，是否提供这一步由调用方接线。
 *
 * S3 闸门（最低公共层）：用到分享链的动作（`copy.link` / `share.card.wx` / `share.card.miniapp` /
 * 无 files 的 `share.system`）在 `url` 不是公开分享链时**不调用注入实现**，直接返回
 * `{ ok:false, outcome:'blocked' }`（`NotAllowedError` 语义）。`publicHosts` 可**追加**站点公开域。
 *
 * 返回 `{ ok, outcome, action, mode }`；`mode` 为 'invoked'（调用了注入实现）或 'guidance'（只给引导）。
 */
export function executeAction(actionId, deps) {
  const d = deps && typeof deps === 'object' ? deps : {}
  let pending
  try {
    pending = invoke(actionId, d) // 同步段结束前，调用已经发出
  } catch (error) {
    return Promise.resolve(toResult(actionId, error))
  }
  const mode = GUIDANCE_ACTIONS.includes(actionId) ? 'guidance' : 'invoked'
  // 引导类动作没真的执行外部实现（卡片由宿主菜单转发、长按由用户完成），**不得报 `done`**——
  // 否则界面会把「未发生的事」说成已完成。outcome 如实标 `guidance`（S11）。
  const outcome = mode === 'guidance' ? 'guidance' : 'done'
  // 此后才允许 await：结果 settle 与成败分类都在这里完成
  return Promise.resolve(pending).then(
    () => ({ ok: true, outcome, action: actionId, mode }),
    (error) => toResult(actionId, error)
  )
}
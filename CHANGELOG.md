# Changelog

本仓遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式，版本语义按 [SemVer](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added

- **能力来源权威化**：`capability-table.mjs` 导出 `SOURCES`（caniuse / MDN / W3C WebView-CG / 微信官方 JS-SDK / 真机实测 / caniwebview / unconditional），每格 `evidence` 由模糊等级改为**来源键**（可核对）；`UNMEASURED` 表示未实测。
- **`signals.hasFiles`**（适配包按 artifact 给出）：`save.album` / 带文件的 `share.system` 需 `hasFiles === true` 才入列。
- **保存语义拆分**：新增动作 `save.download`（`a[download]` → 下载目录）；`save.album` 语义改为**系统面板保存**（`navigator.share({files})` → 相册/文件）。`decide` 偏好序 `save.album` 在前、二选一（有系统面板即不列下载），`SIGNAL_FALLBACK` 改指 `save.download`。
- 新增能力行 `browser:harmony` / `pwa-standalone:harmony`（鸿蒙 ArkWeb：无 `navigator.share/canShare`，`a[download]` 落下载目录）。
- 文案 `save-download-image` / `save-download-video`；`save-album-*` 文案改说「相册/文件」。

### Changed

- **破坏性**：`ACTION_IDS` 由六项变七项；`save.album` 的 `a[download]` 语义迁到 `save.download`（`ACTION_DEP_MAP`：`save.album`→`share`、`save.download`→`download`）。既有把 `save.album` 当下载用的接线需改为 `save.download`。
- **破坏性（迁移注意）**：站点**自有分享域**须经 `mountShare(target, { publicHosts })` 或 `executeAction` 的 `deps.publicHosts` 传入；默认允许域只有 `share.hxym18.com`（并集追加，不可替换）。未传时，指向站点自有分享链（如 `nt.hxym18.com/r/<id>`）的复制/系统分享会被判为非公开链而拒绝。
- **破坏性**：微信 Android（XWeb）`preview.longpress` 由 `true` 修正为 `false`（长按保存失败，jinlab 实测）。
- **破坏性**：`executeAction('save.album')` 无 `files` 时直接返回失败（不再静默发文本分享）。
- **同机制去重**：`save.album` 与带文件的 `share.system` 属同一系统面板机制，图片 / 视频只保留 `save.album`、link 只保留 `share.system`（不再同现，红线 2）。
- 图片偏好序：`preview.longpress`（原生直路 → 相册）排在 `save.album` / `save.download` 之前。
- iOS 图片的事前说明改为长按引导（`longpress-image`），与主推荐一致。
- `save.album` 的 label / sheet 文案由「本机」改「相册」；`save.download` 用「下载」。

### Fixed

- **下载源为空时不再执行**：`executeAction('save.download')` 在没有 `files[0]`、也没有 `fileUrl` 时拒绝执行（`outcome: 'failed'`），不再把空字符串交给注入实现——空 `a.href` 在真实浏览器解析为当前文档 URL，会把**整页 HTML** 当「图片」下下来。`decide` 侧新增 `signals.hasDownloadSource`（适配包按 artifact 给出）同口径收闸；未传该信号的调用保持旧行为（不闸）。
- **公开链闸门下移到执行层**：`isPublicShareUrl` / `actionUsesShareUrl` / `DEFAULT_PUBLIC_HOSTS` / `SENSITIVE_QUERY_KEYS` 由 `ui/mount.mjs` 下沉到零依赖的 `src/core/share-url.mjs`（`mount.mjs` 保留 re-export，`share-kit/ui` 运行期补出 `isPublicShareUrl`）。`executeAction` 对「用到分享链」的动作（`copy.link` / 无文件的 `share.system` / `share.card.*`）在 `url` 非公开链或为空时拒绝执行（`outcome: 'blocked'`）——此前闸门只在 `mountShare`，React `ShareTrigger` 与「`listActions` + `executeAction` 自组 UI」直调可绕过，私有页链接仍会被复制/分享。

## [0.3.0] - 2026-10-11

### Added

- `isPublicShareUrl` + `mountShare` 非公开链拦截：允许域 = 默认域 `share.hxym18.com` ∪ 站点 `publicHosts`（并集，`publicHosts` 只追加、不替换）；非公开链拒绝复制/分享。
- artifact 全字段 getter（含新增 `fileUrl`）。
- `card-miniapp-link` 文案（小程序 webview 引导「点右上角『···』，用小程序自带的分享」）。
- core `OUTCOME_KINDS` 新增 `guidance`。

### Changed

- **破坏性**：`deps` 字段全部改为 getter（原先直接取值的用法受影响）。
- **破坏性**：download payload 不再传 `files`（`save.album` 只收 `{ url, filename }`）。
- **破坏性**：非公开链 / 缺 `url` 的 link 产物会被拦截（不再执行分享/复制）。

### Fixed

- 分享链与文件源分离：`url` 不再回退 `location.href`，新增 `fileUrl`；下载源改用文件（`files[0]` → `fileUrl`），不再把页面 HTML 当下载内容。
- `save.album` / save 文案与 label 不再承诺「相册」，改「本机」（`a[download]` 落点是下载目录/文件）。
- 空 `url` 不再复制出 `undefined`（空值守卫）。
- 引导类动作 outcome 标 `guidance`：不再误报 done，React 端不卡禁用态（复原按钮）。

## [0.2.1] - 2026-10-08

### Added

- `typesVersions`：兼容经典 `moduleResolution: node` 的子路径（`web` / `web/react` / `poster` / `render-dom` / `ui`）类型解析。

## [0.2.0] - 2026-10-05

### Added

- `ui` 入口 `mountShare`：业务站把 artifact 传入即得分享按钮与全部后续交互（view 纯函数 + sheet DOM 薄壳 + mount 主流程）。
- core `listActions`：与 `decideAction` 共享过滤单源的完整可用动作列表（点击瞬间重算，绕开首帧激活信号闸）。
- 线上多 UA 验收链路（七组真实 UA：微信 iOS/Android/桌面、小程序 webview、手机/桌面浏览器）。

### Changed

- **红线 2 落地（出资人拍板）**：图片产物点击分享先弹**海报预览层**（全屏大图 + 长按提示 + 层内方式按钮行，主推荐高亮），无图可显才弹 Action Sheet 兜底；「点击弹方式列表」口径作废。
- `share.system` 传参：有 `files` 只传图不带 `url`（iOS 混传把链接当主体）。
- 用户取消（AbortError）静默复原按钮，不再误报「没完成」。
- 层内 `share.system` 标签「系统分享」→「分享」（业务站可 `labels.actions` 覆盖）。

### Fixed

- 信号闸按产物区分：新增 `hasShare` 信号（存在性），`canShareFiles===false` 只闸 image/video——修复桌面 Chrome link 分享被过杀。
- 小程序 webview 凭 `a[download]` 信号承诺必失败下载的问题：能力表文档级 `available:false` 不被特性探测推翻。
- render-dom 版式高度改 `min-height`：固定 height 时 flex 撑溢导致二维码被裁、导出图扫码失败。

## [0.1.0] - 2026-10-05

### Added

- 仓初始化（scaffold）：单包多入口 exports map（core / web / poster / render-dom）。
- core：决策层平移（probe / capability-table / decide / actions / copy / outcome），66 测试。
- poster：通用海报冻结快照 schema（resolveSpec + 六主题 + 三版式），9 测试。
- web：浏览器适配层平移（collect-signals / execute / report / react），16 测试。
- render-dom：DOM→canvas 渲染器（posterHtml / capture / qrDataUrl / exportPng + scale 预算），15 测试。
- demo 页 + Playwright 视觉验收（四项断言：canvas 尺寸 / 二维码真实像素 / 无 svg / 无定位属性）。

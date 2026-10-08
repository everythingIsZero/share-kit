# Changelog

本仓遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式，版本语义按 [SemVer](https://semver.org/lang/zh-CN/)。

## [Unreleased]

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

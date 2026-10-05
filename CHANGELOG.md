# Changelog

本仓遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式，版本语义按 [SemVer](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [0.1.0] - 2026-10-05

### Added

- 仓初始化（scaffold）：单包多入口 exports map（core / web / poster / render-dom）。
- core：决策层平移（probe / capability-table / decide / actions / copy / outcome），66 测试。
- poster：通用海报冻结快照 schema（resolveSpec + 六主题 + 三版式），9 测试。
- web：浏览器适配层平移（collect-signals / execute / report / react），16 测试。
- render-dom：DOM→canvas 渲染器（posterHtml / capture / qrDataUrl / exportPng + scale 预算），15 测试。
- demo 页 + Playwright 视觉验收（四项断言：canvas 尺寸 / 二维码真实像素 / 无 svg / 无定位属性）。

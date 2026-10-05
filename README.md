# share-kit

> 跨终端分享 SDK：一次接入，PC 浏览器 / 微信内置 / 手机浏览器 / 小游戏全兼容。
> 分享操作（环境判定、终端分流、海报渲染、下载保存）全部在前端完成，服务端零负担。

## 包结构（单包多入口）

| 入口 | 职责 | 依赖 | 适用环境 |
|---|---|---|---|
| `share-kit`（`.`） | 决策层：环境指纹 → 动作计划 / 可用方式列表 + 事前说明 + 结果分类 | **零依赖** | 全环境（含小游戏） |
| `share-kit/poster` | 海报配置：业务数据 → 冻结快照（纯数据） | **零依赖** | 全环境（含小游戏） |
| `share-kit/web` | 浏览器适配层：collectSignals / executeAction / report | 零依赖 | 浏览器 |
| `share-kit/web/react` | React 可选绑定（ShareTrigger / reduceTrigger） | react（optional peer） | React 站点 |
| `share-kit/render-dom` | DOM→canvas 海报渲染器 | html2canvas-pro + qrcode | 浏览器 |
| `share-kit/ui` | 通用分享挂载：按钮 + Action Sheet + 长按引导层 + 执行 + 反馈 | 零依赖 | 浏览器（无框架） |

小游戏（LayaAir 等）只 import `.` 与 `./poster` 即完全不碰 DOM。

## 安装

```bash
bun add github:everythingIsZero/share-kit
```

## API 速查

### `share-kit`（core，决策层）

| 导出 | 说明 |
|---|---|
| `normalizeFingerprint(signals)` | 原始信号 → 脱敏指纹（container / os / engine / versionBand / unknown） |
| `decideAction({ fingerprint, artifactKind, signals })` | → 执行计划 `{ primary, hint, fallback, reason }`（主推荐动作） |
| `listActions({ fingerprint, artifactKind, signals })` | → 可用方式列表 `{ actions: [{ id, isPrimary }], reason }`（Action Sheet 决策单源，偏好序） |
| `capabilityRowFor(fingerprintOrKey)` | 42 格能力表查询（container × os × 六动作，带证据等级） |
| `renderCopy(copyId, params)` / `resolveCopy(id, override)` | 文案渲染与项目覆盖（覆盖必须附原因） |
| `classifyOutcome(errorOrResult)` / `planFeedback(kind)` | 结果四分类（成功/取消/阻断/失败）与反馈计划 |
| `buildEvent(input)` | 事件对象（固定四字段，UA 原文与身份字段不进事件） |

### `share-kit/poster`（海报配置）

| 导出 | 说明 |
|---|---|
| `POSTER_FORMATS` / `POSTER_SIZES` | 版式（card 750×600 / long 750×1334 / og 1200×630） |
| `POSTER_THEMES` | 六组主题色板（通用/喜庆/素雅/户外/聚会/亲子，仅换色不改版式） |
| `resolveSpec(input)` | 业务输入 → **深冻结** PosterSpec（防渲染期幽灵数据；非法入参返回兜底 spec） |

### `share-kit/web`（浏览器适配层）

| 导出 | 说明 |
|---|---|
| `collectSignals(win?)` | 采集七项原始信号（只读不写宿主对象） |
| `executeAction(actionId, deps)` | 执行动作（同步段发起调用、await 只在其后，保用户激活） |
| `createReporter(send)` | fire-and-forget 上报器（失败不冒泡不重试） |

### `share-kit/web/react`（React 绑定）

| 导出 | 说明 |
|---|---|
| `ShareTrigger` | 分享/保存按钮（薄组件，按钮恒直出，反馈落在按钮上） |
| `reduceTrigger` / `computeOverlayPosition` | 触发态归约与引导层位置（纯函数，不写死坐标） |

### `share-kit/render-dom`（DOM 渲染器）

| 导出 | 说明 |
|---|---|
| `posterHtml(spec, { qrDataUrl })` | PosterSpec → 内联样式 HTML（微信铁律固化：无 svg / 无定位属性） |
| `qrDataUrl(spec.qr)` | 二维码 512px 高倍源图（黑码白底，扫码率优先） |
| `capture(el, options?)` | DOM → canvas（scale 面积预算 + 两档降级 + 空白检测） |
| `exportPng(canvas)` | 导出（blob URL 优先，toBlob 失败降级 dataURL） |
| `scaleFor(w, h, budget)` | 按面积预算反推整数倍率（iOS 画布上限） |

### `share-kit/ui`（通用分享挂载）

| 导出 | 说明 |
|---|---|
| `mountShare(target, { artifact, labels?, onResult? })` | 挂载分享按钮 + Action Sheet + 长按引导层 + 执行 + 反馈，返回 `{ unmount }` |
| `SHEET_LABELS` / `sheetItemsOf` / `buttonLabelOf` / `sheetTitleOf` | Action Sheet 视图模型（纯函数，自定义 UI 时可复用） |

## 接入四步（与 demo/index.html 实际调用一致）

```js
import { resolveSpec } from 'share-kit/poster'                                  // poster
import { qrDataUrl, posterHtml, capture, exportPng } from 'share-kit/render-dom' // render-dom
import { mountShare } from 'share-kit/ui'                                       // ui

// 1. 生成海报：业务数据 → 冻结快照 → DOM → canvas → 导出（独立方法链，产物交给第 2 步）
const spec = resolveSpec({ format: 'card', themeId: 'outdoor', content: { /* … */ }, qr: { url: 'https://share.hxym18.com/s/abc' } })
const qrSrc = await qrDataUrl(spec.qr)
host.innerHTML = posterHtml(spec, { qrDataUrl: qrSrc })
const canvas = await capture(host.firstElementChild)
const exported = await exportPng(canvas)

// 2. 挂载分享：把「想分享的东西」交给 mountShare，按钮 + Action Sheet + 执行 + 反馈全在 SDK 内
//    （artifact 是执行时取值的可变引用：先挂载、渲染完成后再补 files / imageUrl 即可）
const artifact = { kind: 'image', url: pageUrl, title: '…', text: '…' }
mountShare(document.getElementById('share-slot'), {
  artifact,
  labels: { button: '分享海报', sheetTitle: '分享这张海报' },
  onResult: (r) => reporter.send({ /* 埋点四字段：probe / action / outcome / fingerprint */ }),
})

// 3. 补产物：海报就绪后填 files / imageUrl（点击执行时才取值）
artifact.files = [new File([exported.blob], 'poster.png', { type: 'image/png' })]
artifact.imageUrl = exported.url

// 4. 分享链接统一 share.hxym18.com/s/<shareId>（复制链接 / 卡片 / 海报二维码同源）
```

无需自己写环境分支，也无需处理点击重决策——`mountShare` 内部在点击瞬间重算可用方式列表
（一次性用户激活只在此刻为 true，系统分享这一刻才能过信号闸），业务侧只管产物与文案。
要完全自定义 UI 时，用 `core.listActions` + `web.executeAction` 自行组装（决策单源不变）。

## 红线（12 条，违者必改）

1. **决策与渲染分离**：core 只输出执行计划与文案键，不含字面量 UI 文案、不 import 任何宿主 API；适配层只采集信号与执行，不做决策。
2. **Action Sheet（一环境一组真实可用的方式）**：点击分享弹出方式列表，只列能力表 + 运行时信号双重过滤后确定可用的项（绝不列会失败的项）；偏好序第一项高亮为主推荐；`preview.longpress` 在列表中呈现为「查看大图」，点击后收起列表再弹长按引导层；仅剩唯一可用动作时不弹列表直接执行；`copy.link` 恒可作为次要项。没有「该环境无可用动作就不渲染按钮」的分支。
3. **手势内同步调用**：分享接口必须在点击回调的同步段内发出，`await` 只允许出现在调用之后。先 `await` 再调用会烧掉一次性用户激活，iOS 直接 `NotAllowedError`（单测已钉住）。
4. **反馈落在触发元素本身**：不用 toast、不弹窗；引导层位置按安全区与容器 UI 高度动态算，禁写死坐标。
5. **不承诺做不到的事**：微信内置浏览器内保存视频无前端路径，只给「复制链接去外部浏览器」并如实说明，不出现「已保存」语义。
6. **未实测格不给强引导**：能力表 42 格逐格带证据等级；未实测格 `available: null`（不填推测值），决策走中性兜底；仅文档格即便 `available: true` 也 `confidence: 'low'`。
7. **无权益钩子**：分享结果回调只做归因，不导出任何 grant / reward / claim 入口，不因消费方要求而开。
8. **事件四字段**：`probe / action / outcome / fingerprint`；UA 原文与任何身份字段不进事件；用户取消（AbortError）与真失败分开归因。
9. **文案只描述结果与位置**：默认正文禁写系统菜单项名（随微信版本变化必失效）；仅「已验证 + 附原因」的覆盖才允许点出。
10. **产物不归本包**：能不能播、编码、体积、AIGC 标识由产物生产方负责，本包不校验、不背责。
11. **业务站禁再自写环境分支**：环境分流只有 core 一份单源；各站接入按「接入四步」走，分享链路口径与证据回填统一在本仓维护。
12. **能分享才给分享，不能分享就走下载**：分享只在分享真可用时给；图片/视频产物在分享与保存都不可用、但当场探到 `a[download]` 时兜底是下载（信号兜底只作用于 image/video，且必须有运行时信号才生效）。

### render-dom 微信铁律（WKWebView 实测，违反必炸）

- 底色必须显式给不透明色（png 透明区会被编成黑；`renderOptions` 已强制）；
- 海报子树不得出现 `<svg>` 图标、不得使用 `position: relative / absolute`；
- 二维码必须 `<img>` 直绘 + 512px 高倍源图（bg-image 会被先缩再放，边缘发糊压低扫码率）；
- 外链图必须换同源代理（跨域图污染 canvas，导出抛安全错误）；当前 schema 暂无图片字段，接入时经 `hooks.resolveImage` 归一；
- 画布面积压进 iOS 上限（`scaleFor` 按预算反推**整数**倍率；连续倍率会整图发虚、二维码黑白粘连）；
- 海报宿主不得加 `transform: scale()`（会缩小 `getBoundingClientRect`，干扰 scale 预算——demo 实测踩坑）。

## Demo

```bash
make demo-bundle   # 打包 render-dom（qrcode 为 CJS，浏览器 ESM 须走 bundle）
make demo-verify   # Playwright 视觉验收：canvas 尺寸 / 二维码真实像素 / 无 svg / 无定位属性
# 或手动看页面：
python3 -m http.server 8899 --directory .   # 仓根起服务（file:// 下 ESM 会被 CORS 拦）
open http://localhost:8899/demo/index.html
```

## 开发

```bash
bun install     # 安装依赖（注意：bun add 会把 optional peer 的版本号清空，见下）
make test       # 跑全部测试（node:test，106 条）
make lint       # node --check 所有源文件
```

### 锁文件与依赖纪律

- `bun.lock` 入库；业务站以 git 依赖引用本仓时锁 commit 号，升级=改引用。
- **坑**：`bun add` / `bun install` 会把 `peerDependencies.react` 的版本范围改写成 `""`（bun 对 optional peer 的自动行为）。已被 `test/web/react.test.mjs` 的「依赖形状受控」断言钉住——跑 `make test` 变红即是被改写，手动恢复 `"react": ">=18"` 即可。
- 新增依赖优先手动编辑 `package.json` 再 `bun install`，装完检查 peerDependencies 未被改写。

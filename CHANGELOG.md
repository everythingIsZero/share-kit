# Changelog

本仓遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式，版本语义按 [SemVer](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Fixed

- **`RawSignals` 类型声明补漏：`hasDownloadSource` / `hasShare`**（v0.7.0 起存在）。两者运行时早已在用——`hasDownloadSource` 由 `mountShare` 按 artifact 给出、`decide` 读它闸 `save.download`（空源会下到整页 HTML），`hasShare` 由 `share-kit/web` 的 `collectSignals` 产出、`decide` 读它闸 `share.system`——但手写声明漏了它们，导致 **TS 消费站传对字段也报 `Object literal may only specify known properties`**。补声明 + README 增两行信号说明。
- **新增漂移守卫 `test/meta/declaration-parity.test.mjs`**（3 断言）：`RawSignals` 声明 ⊇ 采集侧 `collectSignals` 产出 ∪ core 读取（含 `decide` 的 `s.*` 别名）；锚点（接口块、别名绑定）缺失即抛，不静默假绿；声明多出的键显式列出待人工确认。此类漏键此前**不会让任何测试变红**。
  建议发版：**v0.7.1**（patch；无行为变更，仅类型声明 + 测试 + 文档）。

## [0.7.0] - 2026-10-12

### Added

- **`share-kit/web` 浏览器默认 deps（SH-1）**：新增 `systemShare`（系统分享，有 files 只传文件 / 无 files 才用 url，接口缺席抛错）、`triggerDownload`（`a[download]` 下载，接受对象 `{url,filename}` 或位置式 `(url,filename)`，空源静默返回）、`defaultCopy`（剪贴板优先、失败落 `execCommand`；**两条路都失败即抛错**，对齐 fang `copyText` + `copyOrThrow` 的原实现——静默返回会被 `executeAction` 当成成功、界面假报「链接已复制」）。fang / zitie / nuantie 曾各写一遍的分享执行胶水自此单源；`mountShare` 内部改取同一实现（删本地 `defaultDownload` / `defaultCopy` 副本），结果反馈改走 `feedbackOf`（删本地结果文案表，含硬编码的「已完成 · 可再试一次」/「没完成，再点一次试试」）。
- **`share-kit/web` 结果 → 反馈映射（SH-4）**：新增 `feedbackOf(result, guidanceText?) → { tone, text }` 与 `FEEDBACK_TONES`——**从 fang `feedbackOf` 口径收敛**：引导给引导文案（缺则回退 `fail-retry`）；只有 `save.download` / `copy.link` 宣称结果（走系统面板的不宣称，R7）；取消静默、被阻断 / 失败给一步重试。nuantie `feedbackFor` 与 fang 不同（曾对 `save.album` 宣称 `done-saved`、引导缺文案返回空串），本包按 R7 去掉这些差异。

### Notes

- **SH-3 现状核实（未改码）**：`share-kit/poster` + `share-kit/render-dom` 出口**完整可用**（`exports` / `typesVersions` / README 均齐，`test/poster` + `test/render-dom` 全绿），审计「已抽出无人用」属实但**不是能力缺口**——全仓无消费方 import 这两个出口；5 站海报为站内自绘（照片拼贴 / 自定义版式），超出 `render-dom`（文字 + facts + QR）的设计覆盖。是否改用 `render-dom` 属站点侧取舍，本阶段只登记、不新增投机能力。

## [0.6.0] - 2026-10-11

### Added

- **`@hxym18/share-kit/meta`：分享卡片元信息工厂**（`createShareMetadata` / `describeLength` + 尺寸与长度常量）——把「卡片能否出」的固定规则固化成**默认值**，站点声明一次（origin/siteName/图/图版本），页面只传 `{ path, title, description }`，无需每页重写 og/robots。默认 `og:type=website`、`locale=zh_CN`、`twitter:card=summary_large_image`、`noindex`、图 1200×630；产出普通对象、无 `undefined` 键；装配期与调用期 fail-fast 校验。
  动机：og 是卡片主路径（见 `knowledge/integration/specs/2026-10-11-share-shortlink-design.md` v3），但默认值/长度口径/绝对化/版本化（平台按 URL 缓存图）这些**规则**不该由每个站手写。

## [0.5.1] - 2026-10-11

### Fixed

- **分享链判据不再否定「本站自己的分享页」**：允许域从「`share.hxym18.com` ∪ `publicHosts`」改为「默认域 ∪ **本站 origin**（浏览器运行时经 `ownOriginHost()` 自动计入）∪ `publicHosts`」。此前站点自己的公开分享页（如 `fang.hxym18.com/s/<token>`）会被判非公开链、必须靠 `publicHosts` 过渡声明——那是把「缓存/统计前缀门控」误当「分享链有效性」的后果。S3 的根因（`artifact.url || location.href` 回退）已在 0.3.0 移除，本改动不放宽凭证判定：敏感 query 键照拦、跨域仍须显式声明、Node/SSR 下不自动放行。
- 依据：微信官方 JS-SDK 文档（父域绑定覆盖子域；安全域名不支持短链域名）+ Open Graph 分享实践（卡片主路径 = 目标页 `og:*`）——见 `knowledge/integration/specs/2026-10-11-share-shortlink-design.md`（v3）。

## [0.5.0] - 2026-10-11

### Added

- **`@hxym18/share-kit/node`（服务端出口）**：`createShareBridgeClient({ secret, owner, baseUrl?, fetchImpl?, timeoutMs? })` —— 短链注册客户端（`register` / `ensureShortLink` / `shortUrlFor`）。此前每个站要自己写 `POST /api/shares` + `x-auth-secret` + 判错 + 存映射；现共享封装，站点只注入一个 `store`（读/写各一次）。
  - **永不抛错**：返回 `{ ok:true, shareId, shortUrl } | { ok:false, outcome }`；`outcome ∈ unauthorized / invalid / rate_limited / unavailable / network / bad_response / store_failed`。
  - `ensureShortLink` 保证**一条分享一条短链**（bridge 当前无幂等键，同一 key 重复调用不会产生多条）；注册失败**不写 store**（不缓存坏值）。
  - `secret` 可为 `() => string`（每次请求现读 env）；`DEFAULT_BRIDGE_BASE` 取自 `core/share-url.mjs` 的 `CARD_SHARE_HOSTS`（单源）。**只在服务端持有密钥**，该出口不进前端 bundle。

## [0.4.0] - 2026-10-11

### Added

- **能力来源权威化**：`capability-table.mjs` 导出 `SOURCES`（caniuse / MDN / W3C WebView-CG / 微信官方 JS-SDK / 真机实测 / caniwebview / unconditional），每格 `evidence` 由模糊等级改为**来源键**（可核对）；`UNMEASURED` 表示未实测。
- **`signals.hasFiles`**（适配包按 artifact 给出）：`save.album` / 带文件的 `share.system` 需 `hasFiles === true` 才入列。
- **保存语义拆分**：新增动作 `save.download`（`a[download]` → 下载目录）；`save.album` 语义改为**系统面板保存**（`navigator.share({files})` → 相册/文件）。`decide` 偏好序 `save.album` 在前、二选一（有系统面板即不列下载），`SIGNAL_FALLBACK` 改指 `save.download`。
- 新增能力行 `browser:harmony` / `pwa-standalone:harmony`（鸿蒙 ArkWeb：无 `navigator.share/canShare`，`a[download]` 落下载目录）。
- 文案 `save-download-image` / `save-download-video`；`save-album-*` 文案改说「相册/文件」。
- **微信卡片真短链（M2-6）**：core `share-url.mjs` 新增 `CARD_SHARE_HOSTS` / `isCardShareUrl(url)`（零依赖，单源）——认出 host 为 `share.hxym18.com` 的**公开**短链；`share-kit/ui` 运行期与类型同步导出 `isCardShareUrl`。文案新增 `card-wx-shortlink`（与 `card-wx-link` 并列）。
- core `decide.mjs` 新增 `CARD_SHARE_HINTS` / `resolveHintCopyId(copyId, cardShare)`（带卡片短链的文案替换表单源），`decideAction` / `listActions` 新增**可选**输入 `cardShare`（缺省 = 旧行为）。
- **站点可追加敏感 query 键（G11）**：`isPublicShareUrl` / `isCardShareUrl` 新增第三参 `sensitiveQueryKeys`，`executeAction` 的 `deps.sensitiveQueryKeys` 与 `mountShare` 的 `options.sensitiveQueryKeys` 同步支持。语义与 `publicHosts` **完全对称**：默认清单 `token` / `t` / `access_token` **恒在**，站点只做**并集追加**（不可替换/删减），大小写不敏感。此前 `?sig=` / `?code=` 之类站点私有签名键会漏判为公开链。
- **`save.download` 字节级端到端验收（G2）**：新增本地离线脚本 `test/e2e/download-bytes.mjs`（`make test-download-bytes`）——真浏览器（Playwright headless）点击下载 → `a[download]` 落盘 → 读回字节，断言 PNG magic、尺寸（8×8）与 fixture **逐字节相等**，排除「下到整页 HTML」。Playwright 仅作本机工具，不进 `dependencies`。

### Changed

- **破坏性**：`ACTION_IDS` 由六项变七项；`save.album` 的 `a[download]` 语义迁到 `save.download`（`ACTION_DEP_MAP`：`save.album`→`share`、`save.download`→`download`）。既有把 `save.album` 当下载用的接线需改为 `save.download`。
- **破坏性（迁移注意）**：站点**自有分享域**须经 `mountShare(target, { publicHosts })` 或 `executeAction` 的 `deps.publicHosts` 传入；默认允许域只有 `share.hxym18.com`（并集追加，不可替换）。未传时，指向站点自有分享链（如 `nt.hxym18.com/r/<id>`）的复制/系统分享会被判为非公开链而拒绝。
- **破坏性**：微信 Android（XWeb）`preview.longpress` 由 `true` 修正为 `false`（长按保存失败，jinlab 实测）。
- **破坏性**：`executeAction('save.album')` 无 `files` 时直接返回失败（不再静默发文本分享）。
- **同机制去重**：`save.album` 与带文件的 `share.system` 属同一系统面板机制，图片 / 视频只保留 `save.album`、link 只保留 `share.system`（不再同现，红线 2）。
- 图片偏好序：`preview.longpress`（原生直路 → 相册）排在 `save.album` / `save.download` 之前。
- iOS 图片的事前说明改为长按引导（`longpress-image`），与主推荐一致。
- `save.album` 的 label / sheet 文案由「本机」改「相册」；`save.download` 用「下载」。
- **微信内 link + 带卡片短链**：`artifact.url` 是 `share.hxym18.com/s/<shareId>`（由站点服务端注册）时，`share.card.wx` 的事前说明与引导 tip 由 `card-wx-link` 改为 `card-wx-shortlink`（「链接自带卡片：复制后发给微信好友即可」）。`share.card.wx` 仍是 guidance 动作（不调用任何接口），卡片由中转页 og（主）/ JS-SDK（尽力）产出；无短链时路径不变。

### Fixed

- **下载源为空时不再执行**：`executeAction('save.download')` 在没有 `files[0]`、也没有 `fileUrl` 时拒绝执行（`outcome: 'failed'`），不再把空字符串交给注入实现——空 `a.href` 在真实浏览器解析为当前文档 URL，会把**整页 HTML** 当「图片」下下来。`decide` 侧新增 `signals.hasDownloadSource`（适配包按 artifact 给出）同口径收闸；未传该信号的调用保持旧行为（不闸）。
- **公开链闸门下移到执行层**：`isPublicShareUrl` / `actionUsesShareUrl` / `DEFAULT_PUBLIC_HOSTS` / `SENSITIVE_QUERY_KEYS` 由 `ui/mount.mjs` 下沉到零依赖的 `src/core/share-url.mjs`（`mount.mjs` 保留 re-export，`share-kit/ui` 运行期补出 `isPublicShareUrl`）。`executeAction` 对「用到分享链」的动作（`copy.link` / 无文件的 `share.system` / `share.card.*`）在 `url` 非公开链或为空时拒绝执行（`outcome: 'blocked'`）——此前闸门只在 `mountShare`，React `ShareTrigger` 与「`listActions` + `executeAction` 自组 UI」直调可绕过，私有页链接仍会被复制/分享。

### Fixed（引擎判定）

- `probe.mjs` 的 `detectEngine` 判定顺序对齐 `@hxym18/env`（iOS 全系先判 `wkwebview`）：修正 **iOS 上的 UC/夸克** 被误判为 `u4`（跨包语料一致性见 `scripts/e2e/env-corpus.test.mjs`）。

### Chore

- 包内**契约副本**声明（`hxym18.contracts`）：`sensitive-prefixes@1`、`share-url-policy@1`、`capability-projection@1`。

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

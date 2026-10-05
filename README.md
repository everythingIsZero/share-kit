# share-kit

> 跨终端分享 SDK：一次接入，PC 浏览器 / 微信内置 / 手机浏览器 / 小游戏全兼容。
> 分享操作（环境判定、终端分流、海报渲染、下载保存）全部在前端完成，服务端零负担。

## 包结构（单包多入口）

| 入口 | 职责 | 依赖 | 适用环境 |
|---|---|---|---|
| `@hxym18/share-kit`（`.`） | 决策层：环境指纹 → 唯一动作 + 事前说明 + 结果分类 | **零依赖** | 全环境（含小游戏） |
| `@hxym18/share-kit/poster` | 海报配置：业务数据 → 冻结快照（纯数据） | **零依赖** | 全环境（含小游戏） |
| `@hxym18/share-kit/web` | 浏览器适配层：collectSignals / executeAction / report | 零依赖 | 浏览器 |
| `@hxym18/share-kit/web/react` | React 可选绑定 | react（optional peer） | React 站点 |
| `@hxym18/share-kit/render-dom` | DOM→canvas 海报渲染器 | html2canvas-pro + qrcode | 浏览器 |

小游戏（LayaAir 等）只 import `.` 与 `./poster` 即完全不碰 DOM。

> API 表与接入指引将在 M1 收尾时定稿（T7）。

## 开发

```bash
bun install     # 安装依赖
make test       # 跑全部测试（node:test）
```

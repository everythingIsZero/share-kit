/**
 * index.mjs — share-kit web 主出口（包入口 `./web`）
 *
 * 浏览器适配层：采集信号、执行动作、上报事件。**决策全部交给 share-kit core**（包入口 `.`），
 * 本入口不做任何环境判断。
 *
 * 注意：主入口**不导出 React 绑定**（R15 的落点之一）。React 组件在 `share-kit/web/react`
 * 子路径下，这样不接 React 的调用方 `import 'share-kit/web'` 时不会拉起 React。
 */

export * from './collect-signals.mjs'
export * from './execute.mjs'
export * from './report.mjs'

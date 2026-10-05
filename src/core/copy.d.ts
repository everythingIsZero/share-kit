/**
 * copy.d.ts — share-kit core 文案表类型（手写声明，与 copy.mjs 同步维护）
 */

/** 文案出现时机 */
export type CopyTier = 'pre' | 'click' | 'fail' | 'result'

/** 一条文案 */
export interface CopyEntry {
  /** 文案 id，命名规范 `<短码>-<内容>` */
  id: string
  /** 中文正文模板，`{key}` 占位由 renderCopy 替换 */
  text: string
  /** 该模板需要的占位键 */
  params: readonly string[]
  /** 出现时机 */
  tier: CopyTier
  /** 系统菜单项名称：默认 null；只有已验证覆盖才会带上（引 R8） */
  verifiedMenuItem: string | null
}

/** 项目覆盖（必须附原因；带 verifiedMenuItem 时还必须带 verified: true） */
export interface CopyOverride {
  text?: string
  reason: string
  verifiedMenuItem?: string
  verified?: boolean
}

/** 生效条目 = 默认条目 + 覆盖痕迹 */
export interface ResolvedCopyEntry extends CopyEntry {
  /** 该条目的菜单项名是否来自「已验证覆盖」 */
  verifiedOverride: boolean
  /** 覆盖试图写菜单项名但被拒（缺 verified: true 或 reason） */
  overrideRejected: boolean
  /** 覆盖原因原样回显（空串表示未提供） */
  overrideReason: string
}

/** 默认正文禁用词（系统菜单项名等） */
export declare const DEFAULT_MENU_TERM_DENYLIST: readonly string[]

/** 文案出现时机全集 */
export declare const COPY_TIERS: readonly CopyTier[]

/** copyId 允许的短码前缀 */
export declare const COPY_SHORT_CODES: readonly string[]

/** 容器展示名（文案占位 `{container}` 用） */
export declare const CONTAINER_LABELS: Readonly<Record<string, string>>

/** 强引导文案 id（证据不足时不得出现，引 R16） */
export declare const STRONG_GUIDANCE_COPY_IDS: readonly string[]

/** 默认文案表 */
export declare const COPY: Readonly<Record<string, CopyEntry>>

/** 全部文案 id */
export declare const COPY_IDS: readonly string[]

/** 取一条文案；未知 id 返回 null */
export declare function getCopy(id: unknown): CopyEntry | null

/** 判 id 是否命中强引导清单 */
export declare function isStrongGuidance(id: unknown): boolean

/** 渲染正文：`{key}` 占位替换为 params[key]，缺失键替换为空串 */
export declare function renderCopy(id: unknown, params?: Record<string, unknown>): string

/** 取生效条目：默认 + 覆盖（未附原因的 verifiedMenuItem 会被拒绝并留痕） */
export declare function resolveCopy(id: unknown, override?: CopyOverride | null): ResolvedCopyEntry | null
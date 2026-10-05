/**
 * actions.d.ts — share-kit core 动作枚举类型（手写声明，与 actions.mjs 同步维护）
 */

/** 动作 id（六项，R2） */
export type ActionId =
  | 'save.album'
  | 'share.system'
  | 'share.card.wx'
  | 'share.card.miniapp'
  | 'copy.link'
  | 'preview.longpress'

/** 产物种类 */
export type ArtifactKind = 'image' | 'video' | 'link'

/** 动作元数据 */
export interface ActionMeta {
  /** 短码（copyId 命名与埋点归类用） */
  shortCode: string
  /** 中文名（仅用于调试与文档，不作为 UI 文案） */
  label: string
  /** 归组：save / share / fallback */
  family: 'save' | 'share' | 'fallback'
}

/** 全部合法动作（键即动作 id） */
export declare const ACTIONS: Readonly<Record<ActionId, ActionMeta>>

/** 动作 id 全集（顺序即枚举顺序） */
export declare const ACTION_IDS: readonly ActionId[]

/** 产物种类全集 */
export declare const ARTIFACT_KINDS: readonly ArtifactKind[]

/** 判值是否为合法动作 id */
export declare function isActionId(v: unknown): v is ActionId

/** 判值是否为合法产物种类 */
export declare function isArtifactKind(v: unknown): v is ArtifactKind
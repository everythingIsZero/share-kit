/** 敏感 query 键：出现即判非公开分享链 */
export declare const SENSITIVE_QUERY_KEYS: readonly string[]

/** 默认公开分享域（恒在；publicHosts 只追加，不替换） */
export declare const DEFAULT_PUBLIC_HOSTS: readonly string[]

/** 判 URL 是否公开分享链（host 在允许域内 + 无敏感 query）；私有页/token/非法 URL/空串一律 false */
export declare function isPublicShareUrl(url?: string | null, publicHosts?: readonly string[]): boolean

/** 该动作是否会用到分享链（url）；share.system 有文件时用文件、不用 url */
export declare function actionUsesShareUrl(actionId: string, files?: unknown): boolean

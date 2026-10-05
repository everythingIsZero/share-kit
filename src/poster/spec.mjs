/**
 * spec.mjs — 海报冻结快照（PosterSpec，纯数据 + 纯函数，零宿主依赖）
 *
 * 职责：把业务站传来的海报输入归一成**渲染器可直接消费的冻结快照**。
 * 渲染前冻结（deep freeze）是 spec 不变量：渲染耗时可达数百毫秒，
 * 期间业务数据若被改动，画出来的就是「幽灵数据」——冻结从根上杜绝。
 *
 * 归一规则：
 * - 未知主题 → general 回落；未知版式 → card 回落（不用默认值冒充已知主题，与 core 的 R1 同口径）；
 * - 非法入参不抛错，返回可渲染的兜底 spec（渲染器永远拿到结构完整的对象）；
 * - facts 只保留 label 与 value 都是字符串的项，顺序保持；
 * - qr 缺省字段填默认（黑码白底 + quietZone 2），url 非法回落空串（渲染层按「无二维码」处理）。
 *
 * 本文件零 DOM / canvas 依赖，小游戏环境可直接使用。
 */

/** 版式枚举（决定画布尺寸） */
export const POSTER_FORMATS = Object.freeze(['card', 'long', 'og'])

/** 默认版式（未知 format 的回落档） */
export const DEFAULT_FORMAT = 'card'

/** 画布尺寸（750 基准；og 档适配社交分享卡片的 1200×630） */
export const POSTER_SIZES = Object.freeze({
  card: Object.freeze({ w: 750, h: 600 }),
  long: Object.freeze({ w: 750, h: 1334 }),
  og: Object.freeze({ w: 1200, h: 630 }),
})

/** 默认主题 id（未知 themeId 的回落档） */
export const DEFAULT_THEME_ID = 'general'

/**
 * 主题色板（一套版式 + 六组色；仅换色，不改版式）。
 * 色板来自 nuantie 的设计沉淀，字段含义：
 * - primary：主色（标题、强调块底色）
 * - background：海报底色
 * - onPrimary：主色上的文字色
 * - emphasis：点缀色（徽标、高亮数字）
 */
export const POSTER_THEMES = Object.freeze({
  general: Object.freeze({ name: '通用', primary: '#78B7FF', background: '#FCFDFF', onPrimary: '#0B2340', emphasis: '#FFB23F' }),
  celebration: Object.freeze({ name: '喜庆', primary: '#F46C73', background: '#FFFBFB', onPrimary: '#351016', emphasis: '#F4B746' }),
  memorial: Object.freeze({ name: '素雅', primary: '#B6D3CF', background: '#FBFCFC', onPrimary: '#203C37', emphasis: '#8BAAA5' }),
  outdoor: Object.freeze({ name: '户外', primary: '#7BE084', background: '#F7FBF8', onPrimary: '#12351B', emphasis: '#FFD05A' }),
  gathering: Object.freeze({ name: '聚会', primary: '#F6A14F', background: '#FFFCF9', onPrimary: '#35200F', emphasis: '#FFD05A' }),
  family: Object.freeze({ name: '亲子', primary: '#70CFDB', background: '#FAFCFC', onPrimary: '#153840', emphasis: '#FFC36A' }),
})

/** 二维码默认值：恒黑码白底（扫码识别率优先），quietZone 单位为模块数 */
export const QR_DEFAULTS = Object.freeze({ foreground: '#000000', background: '#FFFFFF', quietZone: 2 })

/** headline 非法时的回落文案（海报最大字，不能为空） */
export const DEFAULT_HEADLINE = '分享'

/** cta 缺省时的通用默认（业务未给行动号召时的兜底） */
export const DEFAULT_CTA = '长按识别二维码'

/** 取字符串：非字符串（含 null/undefined）按 fallback 处理 */
function str(v, fallback = '') {
  return typeof v === 'string' ? v : fallback
}

/** 深冻结：数组与普通对象递归冻结（防渲染期数据被改，防幽灵数据） */
function deepFreeze(v) {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v)
    for (const key of Object.keys(v)) deepFreeze(v[key])
  }
  return v
}

/**
 * 业务输入 → 冻结快照（纯函数，非法入参返回兜底 spec 而不是抛错）。
 *
 * 输入结构：
 * - format：'card' | 'long' | 'og'
 * - themeId：POSTER_THEMES 的键
 * - content：{ headline, subline?, facts?: [{label, value}], owner?, cta? }
 * - qr：{ url, foreground?, background?, quietZone? }
 */
export function resolveSpec(input) {
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const rawContent = src.content && typeof src.content === 'object' && !Array.isArray(src.content) ? src.content : {}
  const rawQr = src.qr && typeof src.qr === 'object' && !Array.isArray(src.qr) ? src.qr : {}

  const format = POSTER_FORMATS.includes(src.format) ? src.format : DEFAULT_FORMAT
  const themeId = Object.prototype.hasOwnProperty.call(POSTER_THEMES, src.themeId) ? src.themeId : DEFAULT_THEME_ID
  const theme = POSTER_THEMES[themeId]

  // facts 归一：只保留 label 与 value 都是字符串的项（顺序保持）
  const rawFacts = Array.isArray(rawContent.facts) ? rawContent.facts : []
  const facts = rawFacts
    .filter((item) => item && typeof item === 'object' && typeof item.label === 'string' && typeof item.value === 'string')
    .map((item) => ({ label: item.label, value: item.value }))

  // quietZone 归一：正整数之外一律回落默认（0 会贴边、小数无意义）
  const quietZone =
    Number.isInteger(rawQr.quietZone) && rawQr.quietZone > 0 ? rawQr.quietZone : QR_DEFAULTS.quietZone

  const spec = {
    format,
    size: POSTER_SIZES[format],
    themeId,
    palette: {
      primary: theme.primary,
      background: theme.background,
      onPrimary: theme.onPrimary,
      emphasis: theme.emphasis,
    },
    content: {
      headline: str(rawContent.headline, DEFAULT_HEADLINE),
      subline: str(rawContent.subline),
      facts,
      owner: str(rawContent.owner),
      cta: str(rawContent.cta, DEFAULT_CTA),
    },
    qr: {
      url: str(rawQr.url),
      foreground: str(rawQr.foreground, QR_DEFAULTS.foreground),
      background: str(rawQr.background, QR_DEFAULTS.background),
      quietZone,
    },
  }

  return deepFreeze(spec)
}

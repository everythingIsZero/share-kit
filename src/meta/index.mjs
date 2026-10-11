/**
 * meta 出口（`@hxym18/share-kit/meta`）——分享卡片元信息（og/twitter/robots）的单源默认 + 传参覆盖。
 * 纯函数、零依赖、产出普通对象：Next `generateMetadata` 直接返回即可。
 */
export { createShareMetadata, describeLength, OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT, OG_TITLE_MAX, OG_DESCRIPTION_MAX } from './share-metadata.mjs'

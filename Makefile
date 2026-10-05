.PHONY: test lint typecheck demo-bundle demo-verify

# 跑全部测试（node:test，bun test 兼容）
test:
	node --test 'test/**/*.test.mjs'

# 语法检查（node --check 所有源文件）
lint:
	@find src -name '*.mjs' -exec node --check {} \;

# 类型检查（当前无 tsc 配置，检查 .d.ts 语法可达性；占位，后续按需补 tsc）
typecheck:
	@echo "typecheck: .d.ts 为手写声明，暂无 tsc 工程，跳过（按需补齐）"

# 打包 render-dom 浏览器 bundle（demo 页消费；qrcode 为 CJS，须打包后才可在浏览器 ESM 用）
demo-bundle:
	bun build src/render-dom/index.mjs --outfile demo/render-dom.bundle.mjs

# Playwright 视觉验收（本地跑；依赖本机全局 playwright 与 chromium）
demo-verify: demo-bundle
	node demo/verify.mjs

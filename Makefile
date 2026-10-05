.PHONY: test lint typecheck

# 跑全部测试（node:test，bun test 兼容）
test:
	node --test 'test/**/*.test.mjs'

# 语法检查（node --check 所有源文件）
lint:
	@find src -name '*.mjs' -exec node --check {} \;

# 类型检查（当前无 tsc 配置，检查 .d.ts 语法可达性；占位，后续按需补 tsc）
typecheck:
	@echo "typecheck: .d.ts 为手写声明，暂无 tsc 工程，跳过（按需补齐）"

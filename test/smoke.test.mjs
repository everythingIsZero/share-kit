// T1 脚手架占位测试：验证 node:test 通道可用（T2 core 测试就位后删除）
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('smoke: node:test 通道可用', () => {
  assert.ok(true);
});

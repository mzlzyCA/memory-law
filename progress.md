# Progress

- [x] 创建 `bpackage.json` - 依赖声明
- [x] 创建 `tsconfig.json` - TS 配置
- [x] 创建 `bunfig.toml` - Bun 运行时配置

## 2026-04-24 进展备忘录

- [x] CLI 可存储目录固定为 `~/.memorylaw`（适合 npm 安装后运行）
- [x] 所有 agent 聊天 session 统一写入 `~/.memorylaw/tmp`
- [x] 新增存储策略与 session 持久化：`src/storage.ts`
- [x] CLI 启动时自动初始化目录并打印路径：`src/index.ts`
- [x] `runAgent` 执行后自动落盘 session 到 `tmp`：`src/runAgent.ts`
- [x] 新增测试覆盖目录与落盘行为：`src/index.test.ts`
- [x] 验证通过：`pnpm test`
- [x] 验证通过：`pnpm run type-check`
- [ ] 待选增强：session 文件名增加 agent 名称/模型短名，便于检索

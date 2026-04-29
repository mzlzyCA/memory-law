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

## 2026-04-28 开发计划

- [ ] 在 `src/tools/customTools` 定义基础檔案操作工具：
  - `read`：只读文件内容（不允许修改）
  - `write`：写入/覆盖文件
  - `edit`：基于定位的内容编辑
  - `apply_patch`：按补丁格式套用代码修改
- [ ] 在 `src/tools/customTools` 定义执行与程序管理工具：
  - `exec`：执行 shell 命令（安装依赖、跑脚本、系统操作）
  - `process`：管理后台进程（列出任务、查看输出、终止进程）
- [ ] 在 `src/tools/customTools` 定义网络访问工具：
  - `web_search`：关键词检索
  - `web_fetch`：抓取网页正文内容
- [ ] 为 `exec` 默认启用命令级审批，避免无审查执行高风险命令（如 `rm -rf`）
- [ ] 审批配置示例（执行前确认）：
```json
{
  "approvals": {
    "exec": { "enabled": true }
  }
}
```

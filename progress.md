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

## 2026-05-29 进展更新

- [x] 重构 `query` 主流程：接入可持续 `state`，包含 `messages`、`toolUseContext`、`CompactTrackingState`、`turncount`、`transitionFlag`
- [x] 在 `query` 中新增执行环节：
  - 读取前置 state 并更新可变 `toolUseContext`
  - 预留 `injectSkills`（TODO）
  - 发送模型前将 `tool_result` 内容置空以节约 token
  - 调用默认 compact 流程并注入工具上下文消息
  - 后处理模型回复并写回消息队列（TODO 已标注细化点）
  - 调用 `runArrangedTools` 执行工具并写入 `tool_result`
  - 每轮输出 tool use summary
  - 增加 `AbortController` 中止检查
- [x] 新增 compact 服务：`src/services/compact/defaultCompact.ts`
- [x] 模型接口统一改名：`generate` -> `callModel`
  - 影响 `src/models/baseModel.ts` 与全部 provider 实现
  - 同步更新调用点：`src/query.ts`、`src/scripts/testMyProvider.ts`
- [x] 调整 `runAgent`：改为接收 `query` 的聚合结果（`outputs`）
- [x] 将无 JSX 的工具实现文件从 `.tsx` 调整为 `.ts`
  - `src/tools/runArrangedTools.ts`
  - `src/tools/runTool.ts`
- [ ] 待办：补全 `injectSkills`、message 分类注入细节、post 处理分类路由
- [ ] 待办：修复仓库现存 TS 错误（`src/types/messages.ts` 的 `PromptMessage`、`src/tools/runTool.test.ts` mock 类型）

### TODO 细化清单（来自代码注释）

- [ ] `src/query.ts` `injectSkills`
  - 在模型调用前把 runtime skills 注入到 `toolUseContext`
  - 明确 skill 元数据结构（名称、能力、优先级、注入策略）
  - 约束注入时机（每轮注入 / 首轮注入 / 按工具触发）
- [ ] `src/query.ts` `injectToolUseContextIntoMessages`
  - 按消息类型分类注入上下文：`user` / `tool_use` / `tool_result` / `ui_message`
  - 设计不同类型的注入模板，避免统一文本污染对话上下文
  - 约束注入大小与顺序，避免 prompt 过长
- [ ] `src/query.ts` `postProcessModelReply`
  - 细化“模型回复插入消息队列”的路由规则，替代当前 append-only
  - 对 `assistant` 文本、`tool_use`、异常回复分别定义落位规则
  - 增加错误回复与半结构化回复的兜底路径
- [ ] `src/services/compact/defaultCompact.ts` `Defaultcompact`
  - 保留 system/user 锚点消息
  - 保留未闭环的 tool_use/tool_result 链路
  - 保留安全/权限相关关键上下文
  - 增加可配置 compact 策略（按条数、按 token、按优先级）
- [ ] `src/services/compact/defaultCompact.ts` `shouldCompact` 具体逻辑
  - 总开关：`config.enabled !== false` 时才允许压缩
  - Token 统计：对全部消息累计 `countMessagesTokens(messages, tokenCounter)`
  - 有效窗口：`effective = contextWindow - summaryReservedTokens`
  - 触发阈值：`threshold = effective - compactBufferTokens`（默认缓冲 `13000`）
  - 触发条件：`totalTokens > threshold` 时返回 `true`
  - 安全下界：窗口与阈值使用 `Math.max(0, ...)` 避免负数
- [ ] `autoCompact`（自动压缩调度）
  - 在每轮模型调用前自动执行 `shouldCompact` 判断并触发压缩
  - 支持按 turn/按 token 增量触发，避免每轮都全量压缩
  - 增加压缩熔断与重试策略，避免连续压缩导致循环
- [ ] 每个 agent 独立上下文窗口
  - 上下文窗口按 agent 维度读取（`agentId + provider + model`），不共用全局窗口
  - agent 之间独立维护 compact 状态与摘要消息
  - 当子 agent / 并行 agent 运行时，允许各自独立调用 compact 流程

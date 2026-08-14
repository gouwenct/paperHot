# Paseo 全局会话命名设计（2026-07-28）

## 目标

为同一台设备上由 Paseo 创建和管理的 Codex、Claude、Grok 等会话建立统一命名机制：模型完成第一轮回答后，Paseo 自动获得简洁、稳定、可区分的简体中文名称；支持的 provider 原生会话标题最终与 Paseo 一致。

本设计属于用户级 Paseo 工具配置，不属于 PaperHot 运行时代码。PaperHot 仓库仅保存设计和实施计划，实际状态与脚本放在用户目录 `~/.paseo/`，不进入 PaperHot 本地数据 ZIP。

## 已确认的规则

1. **唯一权威来源**：Paseo agent/workspace 标题是唯一权威名称；provider 原生标题只是下游副本。
2. **主会话**：格式为“动作｜对象”，总长度不超过 24 个字符。动作优先使用“规划、调研、配置、实现、修复、验证、审查、运维”。
3. **子代理**：格式为“角色｜交付物”，总长度不超过 24 个字符。角色优先使用“探索、研究、实现、测试、审查”。
4. **workspace**：格式为“项目名｜工作流”，总长度不超过 24 个字符；表达稳定工作流，不跟随每个后续任务变化。
5. **生成时机**：agent 完成第一轮回答后生成一次语义名称并冻结；workspace 在第一个主会话完成第一轮回答后生成一次并冻结。
6. **手工改名优先**：只有用户在 Paseo 中主动输入或编辑的名称会永久锁定；客户端按首条提示自动生成的名称仍允许优化一次。
7. **重名范围**：
   - 主会话只与同一 workspace 的其他主会话比较；
   - 子代理只与同一父会话下的兄弟子代理比较；
   - workspace 与其他活跃 workspace 比较。
8. **重名后缀**：后创建对象追加 `#2`、`#3`；24 字限制包含后缀。对象关闭或归档后不触发其他对象重新编号。
9. **同步方向**：仅做 Paseo → provider。provider 原生窗口中的改名不反向修改 Paseo。
10. **运行位置**：全局逻辑位于 `~/.paseo/`；不把中央逻辑写入 `.claude`、`.codex` 或某个项目仓库。
11. **禁止脆弱方案**：不监听或直接改写 `~/.paseo/agents/*.json`，不模拟键盘输入 `/rename`，不修改 provider 内部会话文件。

## 当前环境与能力基线

当前设备上的 Paseo CLI 版本为 `0.2.3`。已确认：

- `paseo agent ls --global --json` 可以通过公开 CLI 列出全部 agent。
- `paseo agent inspect <id> --json` 可以读取公开 agent 摘要。
- `paseo agent update <id> --name <name> --json` 可以通过 daemon 更新 Paseo agent 名称。
- Paseo MCP 暴露 `update_agent` 和 `rename_workspace`。
- `paseo hooks <agent> <event>` 的公开说明是“记录 agent hook 活动”，不是用户级生命周期订阅接口。
- 当前 CLI 没有公开的 `workspace rename/update` 命令。
- 当前 provider 列表中 Claude、Codex、Grok 均可用；Grok 是独立 `grok` provider，底层通过 ACP 启动，不应与 Codex 内的 Grok 模型混为一谈。
- Codex 可通过 app-server 的 `thread/name/set` 设置已有 thread 标题；实施前仍需验证请求时序、持久性和后续自动标题竞争。
- Claude Code 只确认交互式 `/rename`；尚未确认稳定的外部 rename RPC/API。
- 独立 Grok agent 状态目前未显示可确认的原生标题更新能力；尚未确认 Grok/ACP rename capability。

尚未确认：

- Paseo 是否提供正式、版本化的 daemon `agent-created`、`agent-renamed` 或“第一轮完成”扩展事件。
- Paseo Desktop 使用的 WebSocket 是否属于公开、稳定、支持断线恢复的扩展契约。
- daemon 是否有公开的 workspace 更新 API，可供用户级 sidecar 调用。

因此，实施必须先做能力探测；不能把内部 WebSocket、内部 JSON 文件或未文档化 HTTP 路由当作稳定接口。

## 总体架构

```text
Paseo 生命周期事件或对账输入
              │
              ▼
      Naming Coordinator
       ├─ Naming Policy
       ├─ Manual Lock
       ├─ Duplicate Scope
       ├─ Revision / Outbox
       └─ Capability Registry
              │
              ├──────────────► Paseo agent/workspace 权威名称
              │
              └──────────────► Provider Adapters
                                ├─ Codex
                                ├─ Claude（能力不足时 unsupported）
                                └─ Grok（能力不足时 unsupported）
```

### 生命周期传输层优先级

1. **正式 daemon hook/plugin**：存在公开、稳定契约时使用。
2. **稳定 WebSocket sidecar**：只有事件 schema、鉴权、重连和版本兼容得到确认后使用。
3. **公开 CLI 对账 sidecar**：若正式事件契约缺失，可用 `paseo agent ls/inspect/update` 周期性对账 agent 名称；它是兼容降级，不读取内部状态文件。
4. **模型主动命名兼容路径**：中央事件能力不足时，保留 `daemon.appendSystemPrompt` 让模型在首轮完成后提交符合规则的 Paseo 名称；协调器负责校验、去重、冻结和后续 provider 同步。

任何时刻只能启用一个最终自动写入者。正式 daemon 扩展启用后，应关闭 sidecar 的写入模式；sidecar最多保留只读审计。

## 命名状态机

每个 agent 使用以下状态：

```text
observed
  ├─ 用户创建时明确给名 ─────────────► manual_locked
  └─ 客户端自动标题/临时标题
                 │
                 ▼
         waiting_first_turn
                 │ 第一轮完成
                 ▼
          candidate_ready
                 │ 校验、截短、去重
                 ▼
           auto_frozen
                 │ Paseo 中用户手工编辑
                 ▼
          manual_locked
```

规则：

- `manual_locked` 永远不被自动命名覆盖。
- `auto_frozen` 不因后续对话主题变化而自动改名。
- 用户明确执行“重新自动命名”时，才允许从 `manual_locked` 或 `auto_frozen` 回到 `waiting_first_turn`。
- provider 同步状态与命名状态分离；provider 失败不会把 agent 退回未命名状态。

workspace 使用相同的 `auto_frozen/manual_locked` 语义，但触发条件是该 workspace 第一个顶层 agent 完成第一轮。

## 标题生成和规范化

### 主会话

```text
动作｜对象
```

- 动作必须表达当前工作类型，不使用“帮我”“处理”“看看”等空泛词。
- 对象应是具体模块或交付物，不直接复制完整首条提示。
- `/resume`、`继续`、`hi`、日期、模型名、provider 名、完整文件路径不能成为最终标题。

### 子代理

```text
角色｜交付物
```

- 角色由子代理任务性质决定。
- 交付物应区别于父会话名称。
- 创建子代理时已有明确 title 的，视为调用方提供的候选；只有用户在 Paseo 中明确编辑后才进入 `manual_locked`。

### workspace

```text
项目名｜工作流
```

- 项目名优先使用仓库名或目录的短中文名称。
- 工作流表达长期目标，如“引文谱系”“价格核验”“重建验收”。
- workspace 首次自动命名后不随内部 agent 切换任务而改变。

### 24 字和重名规则

规范化顺序：

1. 去除首尾空白和重复空格。
2. 去除 Markdown 标题、命令前缀和无意义提示词。
3. 保留一个全角分隔符 `｜`。
4. 计算当前层级已有名称，选择最小可用编号。
5. 预留 ` #N` 长度后截短对象部分；动作/角色/项目名和 `｜` 不截掉。
6. 写入后不因编号空缺而重新编号。

## 手工锁判定

理想情况下，Paseo daemon 应提供 `actor`、`origin` 和标题修订号。若正式事件契约提供这些字段：

- `actor=user`：进入 `manual_locked`。
- `origin=agent-naming`：识别为自身写入，不触发锁。
- 客户端自动标题：标记为 `client_generated`，允许首轮后优化。

若当前版本无法提供来源信息，sidecar 使用保守规则：

- 状态库记录自己最后成功写入的标题和修订号。
- 观察到标题与最后写入值不同，且不在本次待确认写入窗口中时，视为 Paseo 手工改名并锁定。
- 第一次发现旧 agent 时不自动覆盖已有清晰短标题；只有明显默认标题、完整提示词或明确带有 `client_generated` 标记的对象进入自动命名。

该降级规则优先避免覆盖用户名称，即使因此漏掉少量可优化标题。

## 状态与幂等

建议的用户级状态文件：

```text
~/.paseo/agent-naming/state.json
```

每个 agent 记录：

```json
{
  "agentId": "agent-id",
  "workspaceId": "workspace-id",
  "parentAgentId": null,
  "phase": "auto_frozen",
  "title": "配置｜多端会话命名",
  "titleRevision": 1,
  "manualLocked": false,
  "lastAppliedBy": "agent-naming",
  "providerSync": {
    "codex": "synced"
  }
}
```

状态文件不得保存 prompt 正文、assistant 回答、API Key、MCP Authorization header 或 provider token。

幂等键：

```text
agentId + titleRevision + sink
```

其中 sink 为 `paseo`、`codex`、`claude` 或 `grok`。相同标题修订对同一 sink 只执行一次。

## Provider 同步

### Codex

- agent 的 Codex `threadId` 准备就绪后，调用 app-server `thread/name/set`。
- threadId 未就绪时写入 outbox，并只保留该 agent 最新标题修订。
- 同步失败不回滚 Paseo；使用有限指数退避。
- 验证 Codex 是否在后续自动生成标题时覆盖外部设置；若会覆盖，在首次稳定 idle 后再补一次最终对账。

### Claude

- 只有确认正式、稳定的外部 rename RPC/API 后才启用 adapter。
- 不向终端注入 `/rename`，不做 UI 自动化，不改 Claude 内部 session 文件。
- 能力未确认时标记 `unsupported`，保持 Paseo-only。

### 独立 Grok

- 按 `provider=grok` 和独立 nativeHandle 判断，不按模型名判断。
- 只有 ACP/Grok 暴露正式 title capability 时启用。
- 当前能力未确认时标记 `unsupported`，保持 Paseo-only。

### Codex 内 Grok

- 如果实际 provider 是 Codex，则按 Codex thread adapter 处理。
- 没有独立 threadId 的 worker 不修改父 Codex thread 标题。

## 错误处理

- daemon 暂时不可用：保留本地状态，不写内部文件，下一轮对账重试。
- 名称校验失败：保持原名称，记录不含 prompt 的错误摘要。
- provider 不支持：标记 `unsupported`，不无限重试。
- provider 暂时失败：指数退避并增加抖动；只保留最新修订。
- sidecar 重启：先读取状态，再通过公开 Paseo 接口全量对账。
- 多实例：使用单实例锁；第二个实例只读退出，避免两个写入者竞争。
- 正式 daemon 扩展启用：sidecar 写入模式必须关闭。

## 安全与隐私

- 不读取或保存真实 provider token。
- 不把 `~/.paseo` 状态纳入 PaperHot ZIP、Git 或公开日志。
- 日志只记录 agentId、provider、标题修订和错误类别，不记录 prompt/response 正文。
- 调用 Codex app-server 时只向本机进程发送 threadId 和标题。
- 不重启 Paseo daemon，除非用户明确确认；daemon 重启会中断所有正在运行的 agent。

## 分阶段交付

### 阶段 0：契约确认

确认当前 Paseo 版本是否有正式生命周期事件、稳定 WebSocket、workspace 更新能力，以及 Codex/Claude/Grok 原生 rename capability。输出能力矩阵，不修改运行配置。

### 阶段 1：Paseo agent 名称收敛

使用当前最稳定的公开机制实现：首轮后命名、规范化、局部重名、冻结、手工锁、幂等和重启对账。若只能使用公开 CLI 对账，接受创建后短暂显示客户端默认标题。

### 阶段 2：workspace 自动命名

只有公开、稳定的 workspace 更新能力确认后启用。否则保留当前显式 `rename_workspace` 手工路径，不调用内部接口。

### 阶段 3：Codex 原生同步

验证并接入 `thread/name/set`，实现延迟 threadId、outbox、幂等和最终对账。

### 阶段 4：Claude/Grok capability adapter

只在各自正式 rename API 得到确认后接入；未确认时保持 Paseo-only。

### 阶段 5：迁入正式 daemon 扩展

若后续 Paseo 发布正式 hook/plugin，把已验证的 policy、state 和 provider adapter 迁入 daemon 扩展，关闭 sidecar 写入。

## 成功标准

1. 通过 Desktop、CLI、MCP 创建的 agent 在第一轮结束后获得符合类型和 24 字限制的简体中文 Paseo 名称。
2. 客户端自动标题可以优化一次；用户在 Paseo 手工编辑的标题不再被覆盖。
3. 同一 workspace 的顶层 agent、同一父会话的子代理按各自层级正确追加 `#2/#3`。
4. workspace 在第一个顶层 agent 首轮结束后自动命名一次并冻结；若当前 Paseo 没有稳定 workspace 更新接口，该项明确标记为 capability-blocked，不使用内部文件绕过。
5. sidecar/扩展重启后不会重复改名或重新编号。
6. Codex adapter 可用时，Paseo 与 Codex thread 最终标题一致；同步失败不影响 Paseo 名称。
7. Claude/Grok 没有稳定 API 时明确保持 Paseo-only，不做终端注入或内部文件修改。
8. provider 原生窗口改名不会反向覆盖 Paseo。
9. 运行状态和日志不包含 prompt 正文、API Key、token 或 Authorization header。
10. 不修改 PaperHot 运行时代码、数据结构、备份格式和固定端口服务。

---
title: PaperHot 重启后仍运行旧代码或断点文件报 EPERM
date: 2026-07-15
category: runtime-errors
module: PaperHot local service
problem_type: runtime_error
component: development_workflow
severity: high
symptoms:
  - "WoS 修复后返回数量没有变化，服务接口仍能返回 HTTP 200"
  - "EPERM: operation not permitted, open 'data/papers/recent-fetch-cursors.json'"
  - "前端提示后端接口暂不可用并退回本地示例数据"
root_cause: missing_permission
resolution_type: environment_setup
tags:
  - paperhot
  - windows
  - local-service
  - eperm
  - process-restart
---

# PaperHot 重启后仍运行旧代码或断点文件报 EPERM

## Problem

修改 PaperHot 后端后，页面仍可能连接旧的 `50751` Node 进程；即使重新启动了一个进程，它也可能继承 Codex 受限沙箱权限，能够读取页面和返回 HTTP 200，却不能写入 `data/papers`。结果是新代码未生效，或断点预检在写入 `recent-fetch-cursors.json` 时失败并退回示例数据。

## Symptoms

- 后端文件修改时间晚于监听 `50751` 的 Node 进程启动时间。
- WoS 仍表现为修复前的本地二次过滤结果。
- `fs.openSync("data/papers/recent-fetch-cursors.json", "r")` 成功，但 `r+` 返回 `EPERM`。
- HTTP 健康检查成功，实际抓取仍无法保存断点。

## What Didn't Work

- 只请求一个接口并看到 HTTP 200：这不能证明监听端口的是新进程，也不能证明数据目录可写。
- 使用 `Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 50751` 查旧进程：如果 Node 监听在 `0.0.0.0` 或 `::`，该过滤会错误返回空结果，使后续启动仍连接旧 PID。
- 在同一个受限执行环境里反复 `Start-Process node`：新 Node 会继承相同权限。
- 把读取失败当作空断点：[`readJsonFile()`](../../../paperhot_backend.cjs) 会返回 fallback，后续写入仍会失败，且可能掩盖原始权限问题。

## Solution

1. 提醒用户正在运行的抓取会中断，然后查出并停止 `50751` 的准确 PID。
2. 从普通用户 PowerShell 启动 `node server.cjs --port 50751`；从 Codex 启动时应使用允许写入项目运行态目录的普通用户权限。
3. 同时验证新 PID、启动时间、HTTP 和断点文件写权限：

```powershell
Get-NetTCPConnection -LocalPort 50751 -State Listen
Get-Process -Id <PID> | Select-Object Id, StartTime, Path
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:50751/api/fetch/log
node -e "const fs=require('fs');const f='data/papers/recent-fetch-cursors.json';const fd=fs.openSync(f,'r+');fs.closeSync(fd);console.log('cursor writable')"
```

监听查询只按端口和状态筛选，再读取 `OwningProcess`；不要预先限定本地地址。

`r+` 只验证既有文件可以读写，不修改内容。若断点文件尚不存在，应在 `data/papers` 创建临时探针文件、验证后立即删除。

## Why This Works

旧 PID 检查解决“页面仍连接旧代码”；写权限检查解决“健康接口正常但运行态不可持久化”。两项必须同时通过，因为 PaperHot 的页面读取和断点写入使用不同权限能力。

## Prevention

- 每次修改前后端并重启固定端口后，都执行“新进程时间 + HTTP 200 + `data/papers` 可写”三项验收；规则见 [`AGENTS.md`](../../../AGENTS.md)。

## Related Issues

- [`README.md`](../../../README.md) 的启动与维护说明。
- [`2026-07-11 recent paper discovery`](../../superpowers/specs/2026-07-11-recent-paper-discovery-design.md) 的断点恢复设计。

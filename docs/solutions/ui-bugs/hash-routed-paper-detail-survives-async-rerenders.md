---
title: PaperHot 详情页 Hash 路由在异步重渲染中保持稳定
date: 2026-07-22
category: ui-bugs
module: PaperHot paper detail navigation
problem_type: ui_bug
component: tooling
symptoms:
  - "#paper/<stable-key> 直接刷新或前进后退后不能稳定恢复论文详情"
  - "列表数据、收藏或笔记异步加载完成后可能把详情页覆盖成其他页面"
  - "从详情返回后丢失来源页、滚动位置或已加载列表范围"
  - "最近打开标题的颜色被通用链接样式覆盖"
root_cause: logic_error
resolution_type: code_fix
severity: medium
related_components:
  - "backend read model"
  - "HTTP routing"
  - "testing framework"
tags:
  - "hash-routing"
  - "stable-paper-key"
  - "direct-refresh"
  - "browser-history"
  - "async-rerender"
  - "read-only-lookup"
  - "scroll-restoration"
  - "css-specificity"
  - "vanilla-javascript"
---

# PaperHot 详情页 Hash 路由在异步重渲染中保持稳定

## Problem

PaperHot 的单页前端原先把去掉 `#` 的整段 hash 当作平面页面名。详情路由加入论文键后，DOI/URL 中的保留字符、应用启动时尚未加载的论文池，以及异步任务触发的重渲染会共同破坏 `#paper/<stable-key>`。截至 2026-07-22，本文记录的修复已通过本地测试，并在本轮会话内完成浏览器验证；相关工作尚未提交或合并到主分支。

## Symptoms

- DOI 或 URL 包含 `/`、`?`、`#` 时，简单拆分 hash 无法可靠还原论文键。
- 用户直接打开详情 URL 时，前端内存中可能还没有论文，页面无法仅依靠列表缓存恢复。
- 数据加载、收藏/笔记更新或轮询完成后，如果回调直接渲染列表页，会覆盖当前详情路由。
- 快速切换论文或离开详情页时，较慢的旧请求可能覆盖新页面。
- 详情页若只提供多个固定返回入口，无法表达用户实际来自今日论文、全部论文还是个人收藏，也无法恢复进入前的滚动位置和已加载列表范围。
- 最近打开标题若只挂一个低优先级 class，颜色会被 `.paper-title a { color: inherit; }` 覆盖，DOM 中有 class 不代表浏览器最终样式正确。

## What Didn't Work

- 把 `location.hash.replace("#", "")` 的结果直接传给 `renderPage`。它无法同时表达页面和参数，并会把 `paper/<key>` 当成未知页面。
- 只在已加载的论文数组中查找。直接刷新时这些数组尚未预热，而且仅收藏快照中的论文可能不在归档数组中。
- 只校验异步请求编号。编号可以阻止旧请求覆盖新请求，但不能阻止用户已离开详情页后迟到响应重新绘制详情。

## Solution

### 1. 把论文键编码成一个不透明路由段

详情链接按现有稳定键规则选择 `id -> doi -> url -> title`，再对整个键执行 `encodeURIComponent`。解析时只移除固定的 “paper/” 前缀，然后整体解码；解码失败时保留原字符串，避免坏链接让路由器抛错（`public/index.html:3483`、`public/index.html:3501`、`public/index.html:3529`）。

```js
const hash = `#paper/${encodeURIComponent(stableKey)}`;
const stableKeyAgain = decodeURIComponent(hash.slice("#paper/".length));
```

### 2. 可能覆盖详情的通用重渲染重新解析完整路由

`parseLocationHash()` 返回 `{ page, key }`，`renderCurrentPage()` 把二者一起交给 `renderPage(page, key)`。应用启动、`hashchange`，以及论文抓取、收藏/notes、单篇 LLM 等可能覆盖详情的通用刷新走这一入口（`public/index.html:3514`、`public/index.html:9583`、`public/index.html:9621`）。其他页面专用回调可以只重绘所属页面，但必须先确认当前 page 匹配，不能把 `paper/<key>` 当作平面页面名交给 `renderPage`。

### 3. 用只读端点恢复磁盘中的论文

`GET /api/papers/by-key?key=...` 未命中返回 404，命中返回论文。后端先查归档，再回退收藏快照；查询只调用读取函数，不写归档、收藏或操作日志（`server.cjs:517`、`paperhot_backend.cjs:5962`）。归档优先可避免旧收藏快照遮蔽更新后的归档记录，收藏回退则保留仅存在于快照中的论文。

### 4. 同时校验请求版本和当前路由

详情加载先显示现有内存缓存，同时发起按键查询。响应写入前校验 `requestId`，绘制前再确认当前页面仍是同一个 `paper` 路由和同一个键（`public/index.html:7521`、`public/index.html:7565`、`public/index.html:7568`）。

下面是概念性伪代码，变量名不对应当前源码：

```js
const requestId = ++currentRequestId;
const payload = await fetchPaper(stableKey);
if (requestId !== currentRequestId) return;
const route = parseLocationHash();
if (route.page !== "paper" || route.key !== stableKey) return;
renderDetail(payload.paper);
```

### 5. 复用现有阅读状态

详情页继续绑定现有收藏、标星、已读、短标题、论文类型和单篇 LLM 操作，不创建第二套状态文件或写接口（`public/index.html:7497`）。

### 6. 进入详情前捕获来源上下文，返回时再消费

捕获阶段只处理今日论文、全部论文和个人收藏中的普通左键详情导航，记录来源页、论文稳定键、`scrollY` 和已加载数量；今日论文额外记录信源标签及每个标签的加载数量（`public/index.html:7437`、`public/index.html:7485`、`public/index.html:9844`）。筛选和排序继续沿用各来源页现有的会话内状态，不复制到新的持久化结构。

详情页 loading、error 和 ready 状态都通过同一个 wrapper 渲染左上角单一返回按钮。返回同一来源时，先恢复已加载数量，再用双 `requestAnimationFrame` 等待列表布局稳定并恢复滚动位置；上下文消费后立即清空，避免后续普通导航伪造滚动恢复或最近标题标记（`public/index.html:7475`、`public/index.html:7510`、`public/index.html:7533`、`public/index.html:7588`）。

直接打开 `#paper/<stable-key>` 时没有捕获上下文，返回按钮明确回退到全部论文，但不生成最近标题标记。进入详情只在路由首次切换时滚到顶部，loading 到 ready 的异步重绘不会再次打断用户在详情内的阅读位置（`public/index.html:7460`、`public/index.html:7600`）。

### 7. 最近标题标记按来源隔离，并用足够的 CSS specificity

最近打开键保存在当前页面脚本的内存对象中，今日论文、全部论文和个人收藏分别只保留一个键。只有完成“列表进入详情，再返回同一来源”的闭环后才更新标记，因此它不等同于已读、收藏或标星，也不进入 localStorage、配置和本地数据 ZIP（`public/index.html:7442`、`public/index.html:7588`）。

样式使用 `.paper-title a.paper-detail-link-recent`，其 specificity 高于通用 `.paper-title a`，不需要 `!important`。浅色主题使用 `#8896A7`，暗色主题使用 `#a7b6c9`，并始终保留下划线；hover 和键盘 focus 改用主题强调色但不移除下划线（`public/index.html:972`、`public/index.html:975`、`public/index.html:2432`）。这类视觉状态必须用浏览器 computed style 验证，不能只检查 class 或 CSS 文本存在。

## Why This Works

修复把职责分开：hash 只保存可逆定位信息，前端状态机负责加载状态和竞态控制，临时导航上下文负责来源与视口恢复，后端只读模型负责从归档或收藏快照恢复论文。详情页因此不依赖用户先访问列表来预热内存，也不会因为全局异步任务完成而丢失路由参数；返回列表时又能保留用户刚才的浏览现场，而不把临时 UI 状态提升为持久化数据。

前端回归覆盖特殊字符往返、统一详情重绘入口、来源上下文捕获与消费、加载数量和滚动恢复、每来源最近标题，以及浅色/暗色 CSS specificity（`test/paperhot_frontend.test.cjs:1948`、`test/paperhot_frontend.test.cjs:2212`）。后端回归覆盖 DOI、URL、ID、标题、收藏回退和未命中，并逐字比较查询前后的归档/收藏文件、确认操作日志为空（`test/paperhot_backend.test.cjs:2127`）。

## Prevention

- 带参数的页面通过 `parseLocationHash()` 读取路由；不得把平面 hash 直接传给 `renderPage`。
- 可能覆盖详情的通用异步回调使用 `renderCurrentPage()`；页面专用回调先校验当前 page，详情响应还要同时校验请求版本和当前路由。
- 按键查询保持只读，并保留“归档优先、收藏快照回退”的顺序。
- 来源恢复上下文只在列表到详情的受控导航中捕获，返回后必须消费；深链不得伪造来源、滚动位置或最近标题。
- 恢复滚动前先恢复已加载数量，并允许异步布局在有限时间内稳定；不得只调用一次 `scrollTo` 就假设目标位置已经存在。
- 为标题链接增加状态色时，选择器必须至少覆盖通用 `.paper-title a` 的 specificity，并用浏览器 computed style 同时验证浅色、暗色、hover 和 focus。
- 回归至少覆盖含斜杠 DOI、含 query/fragment URL、直接刷新、浏览器历史、异步重渲染和迟到响应。
- 当前静态前端测试不是真实浏览器 history 测试；长期防回归应保留对应 Playwright 场景。

## Related Issues

- [ADR-001：论文详情导航与只读查询边界](../../decisions/ADR-001-paper-detail-navigation-and-lookup.md)
- [README：论文详情与主题说明](../../../README.md#论文详情)

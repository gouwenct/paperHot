---
title: PaperHot 引文谱系标题重叠与默认短标题占位符
date: 2026-07-29
category: ui-bugs
module: PaperHot citation lineage graph
problem_type: ui_bug
component: tooling
symptoms:
  - "同排谱系节点较多时，固定长度的单行标题互相覆盖"
  - "自动生成的 YYYY@ 或 n.d.@ 被误当作用户已经填写的短标题"
  - "固定节点半径无法表达引用量，高被引节点又不能无限放大"
root_cause: logic_error
resolution_type: code_fix
severity: medium
related_components:
  - "backend read model"
  - "testing framework"
tags:
  - "paperhot"
  - "citation-lineage"
  - "svg"
  - "title-wrapping"
  - "short-title"
  - "citation-count"
  - "responsive-layout"
---

# PaperHot 引文谱系标题重叠与默认短标题占位符

## Problem

PaperHot 的引文谱系使用原生 SVG 绘制。同排节点增加后，固定长度的单行标签会侵入相邻节点；直接截断又会隐藏论文标题。与此同时，系统生成的默认短标题 `YYYY@` 或 `n.d.@` 没有用户语义，不应覆盖完整原标题。节点还需要表达引用量，但线性放大容易让少数高被引论文破坏整行布局。

## Symptoms

- 前置或后续论文较多时，节点下方的标题互相重叠。
- 长标题被省略号截断，用户无法从图中读到完整论文名。
- 只有年份和 `@` 的默认短标题看起来像已经设置过的标题。
- 所有节点大小相同，无法快速比较引用量；直接按引用量线性缩放又会撑坏布局。
- 窄屏下 SVG 的最小宽度可能把整个论文详情页一起撑宽。

## What Didn't Work

- 只给 SVG `<text>` 设置 CSS 宽度或 `white-space`。SVG 文本不会像普通 HTML 段落一样自动换行，必须显式生成多行 `<tspan>`。
- 固定按字符数截断并加省略号。它能暂时减少重叠，但违背“完整显示论文标题”的目标，而且中英文、宽字符和窄字符的实际占宽差异很大。
- 只判断短标题是否以年份开头。这样会把有效的 `2026@Hessian SIM` 也误判为占位符；占位判断必须只匹配完整的 `YYYY@` 或 `n.d.@`。
- 让节点半径与引用量线性增长。引用量跨度可能从个位数到数万，线性尺度会让少数节点吞掉标签和连线空间。

## Solution

### 1. 先确定真实的显示标题

`lineageNodeTitle()` 依次读取用户 notes 中的短标题、节点自带短标题和完整原标题。只有精确匹配 `YYYY@` 或 `n.d.@` 的值才视为默认占位符；带有实际内容的 `2026@Hessian SIM` 继续保留。最后统一清理 HTML 标签、常见实体和多余空白（`public/index.html:7845`）。

```js
const shortTitle = candidates.find(
  value => value && !/^(?:(?:19|20)\d{2}|n\.d\.)@$/i.test(value)
);
const title = shortTitle || node.title || "未命名论文";
```

### 2. 在 SVG 中显式生成完整多行标题

`lineageTitleUnits()` 按字符类型估算相对宽度，`lineageTitleLines()` 按每个节点的可用宽度分行。普通英文优先按单词换行，单个超长词再按字符拆分；整个过程不加省略号、不删除字符（`public/index.html:7867`、`public/index.html:7878`）。

`lineageNodeMarkup()` 为每一行生成一个 `<tspan>`，后续行使用固定 `dy`。图布局先计算每个节点的 `labelLines` 和标签高度，再据此确定行距与 SVG 总高度，避免标题与下一排节点相撞（`public/index.html:7921`、`public/index.html:7950`）。

### 3. 用有上限的对数尺度表达引用量

`lineageNodeRadius()` 对未知、非法或非正引用量使用基础半径 `8`；有效引用量使用对数尺度增长，并把增量限制为 `10`，所以节点半径最大为 `18`（`public/index.html:7913`）。

```js
return Math.round(
  (8 + Math.min(10, Math.log10(citationCount + 1) * 2.4)) * 10
) / 10;
```

精确引用量仍写入节点的 `data-citation-count`、`aria-label` 和 `<title>`，视觉尺度不替代原始数值（`public/index.html:7930`）。

### 4. 保持后端 fresh/cache 路径的显示字段一致

谱系后端会给本地匹配节点补入 `shortTitle`，中心节点响应也携带 `shortTitle` 和 `citationCount`。缓存命中时重新与当前论文库合成响应；缓存版本提升到 v4，旧 v3 载荷会失效并重新抓取，避免中心节点在 fresh/cache 路径使用不同的显示字段（`paperhot_backend.cjs:96`、`paperhot_backend.cjs:953`、`paperhot_backend.cjs:978`、`paperhot_backend.cjs:1019`、`paperhot_backend.cjs:1072`）。

### 5. 把横向溢出限制在谱系区域

详情内容允许网格子项收缩，谱系 section 使用自己的 `max-width` 和横向滚动。SVG 可以保留保证可读性的最小宽度，但不会把整个详情页推宽。

## Verification

- `npm test` 在 2026-07-29 通过：后端 `270/270`、前端 `93/93`，零失败。
- 前端回归覆盖短标题优先级、精确占位符回退、完整标题换行、无空格超长词不丢字、半径单调性与上限，以及 10/26 个高引用量节点下的动态画布宽度、标签间隔和圆形不相交（`test/paperhot_frontend.test.cjs:2514`）。
- 后端回归先由当前实现写入缓存、再覆盖缓存命中，确认中心和本地节点的 `shortTitle`、`citationCount` 保持一致；另验证 v3 缓存被拒绝、重新抓取并改写为包含中心显示字段的 v4 载荷（`test/paperhot_backend.test.cjs:9566`、`test/paperhot_backend.test.cjs:9749`）。
- 真实浏览器验收确认目标谱系标签边界框交集为 `0`；保存值仍为 `2026@` 时图中回退显示完整标题；图中不出现默认短标题占位符，控制台无错误。

## Why This Works

修复把三个职责分开：显示标题规则决定“展示什么”，分行和布局决定“放在哪里”，半径映射决定“引用量如何编码”。完整标题不会因布局被截断，默认占位符不会冒充用户输入，引用量也不会因为极端值破坏几何结构。后端在分支汇合后合成显示字段，并通过 v4 缓存门禁淘汰缺少中心显示字段的 v3 载荷，使当前论文库数据、首次抓取和缓存命中采用同一响应规则。

## Prevention

- 修改 SVG 标签时，回归必须验证分行结果重新拼接后与原始完整标题一致，并明确禁止省略号。
- 默认值判断使用精确整串匹配，同时保留一个有效前缀短标题用例，例如 `2026@Hessian SIM`。
- 数值视觉编码同时测试未知值、低值、中值、高值、单调性和上限。
- 布局测试同时覆盖节点较多、超长单词和窄屏容器；最终用真实浏览器检查标签边界框与页面横向溢出。
- 后端显示字段要同时覆盖首次拉取和缓存命中，避免只修复其中一条数据路径。
- 缓存载荷新增显示字段时要同步提升 `LINEAGE_CACHE_VERSION`，并加入“旧版本缓存被拒绝后重新拉取”的回归；仅测试刚写入缓存后的命中不能证明历史缓存兼容。

## Related Issues

- [引文谱系图设计](../../superpowers/specs/2026-07-26-citation-lineage-graph-design.md)
- [引文谱系图实现计划](../../superpowers/plans/2026-07-26-citation-lineage-graph.md)
- [README：论文详情中的引文谱系](../../../README.md#论文详情)

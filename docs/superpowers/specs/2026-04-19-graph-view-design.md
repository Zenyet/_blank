# Graph View —— 替换 Constellation 视图为 Obsidian 风格图

**日期**：2026-04-19
**状态**：已设计，待实施
**作者**：brainstorming session

## 背景与目标

当前新标签页扩展只有一个视图 Constellation（径向星图）：书签按文件夹放入象限，访问频次决定半径。布局是静态的、SVG 渲染、没有"关系"概念。随着书签增多、用户想要更有结构的可视化，Constellation 的表达力不足。

**目标**：把 Constellation 替换为一个 Obsidian 风格的**图视图（Graph）**：

- 节点 = 书签；节点颜色 = 所属文件夹
- 边 = 用户手动创建的连接（像 Obsidian 的 wiki-link，first-class 数据）
- 同文件夹的书签通过**物理弱引力**自然聚类（不画边，只靠力）
- 力导向（force-directed）全物理模拟，节点可拖拽、可"图钉"固定
- Canvas 2D 渲染 + d3-force，支持 500 级节点 60fps
- 支持缩放 / 平移（Obsidian 标配）

**非目标**：
- 不支持共访问 (co-visit)、域名层级等自动推导的边（v2 再议）
- 不做持久侧栏（保持新标签页的"轻快"感）
- 不做 WebGL（规模不需要）
- 不自动保存非图钉节点的位置（每次打开重新模拟）

## 架构

```
┌──────────────────────────── Graph.tsx (React) ────────────────────────────┐
│  顶部过滤框 (center) + 左侧浮动导航 (+书签 / +分组 / 任务)                 │
│  ┌────────────────────── GraphCanvas.tsx ────────────────────────────┐   │
│  │  <canvas> + requestAnimationFrame 循环                             │   │
│  │    useGraphSim: d3-force (charge/collide/link/groupXY/center)     │   │
│  │    useCamera:  scale, tx, ty  (非 React state，避免每帧 re-render) │   │
│  │    hitTest:    d3-quadtree (节点 + 边中点) 粗筛 → 精确判定        │   │
│  │    render:     纯函数，Canvas 2D API                               │   │
│  └────────────────────────────────────────────────────────────────────┘   │
│  底部 "常用 + 最近" 条                                                     │
│  ContextMenu / BookmarkDialog / Modal（复用已有组件）                      │
└────────────────────────────────────────────────────────────────────────────┘
```

**关键原则：物理循环不触发 React re-render**。React 树只在交互性操作（开菜单、开对话框、更新过滤计数）更新少量状态；Canvas 每帧由 rAF 驱动，直接读 sim 内部的可变状态。

### 文件结构

```
src/designs/Graph/
├── Graph.tsx              外壳（顶部/底部/对话框/菜单）
├── GraphCanvas.tsx        <canvas> + pointer 事件 + rAF 生命周期
├── useGraphSim.ts         d3-force 初始化、tick、drag/pin 可变状态
├── useCamera.ts           {scale, tx, ty} 状态与手势
├── hitTest.ts             quadtree 建 + 查节点 + 查边（纯函数）
├── render.ts              drawGraph(ctx, state, camera, theme, dpr) 纯函数
├── edges.ts               chrome.storage.local: newtab-graph-edges CRUD
└── pins.ts                chrome.storage.local: newtab-graph-pins CRUD
```

`src/designs/Constellation.tsx` 删除。`App.tsx` 里的 `<Constellation />` 换成 `<Graph />`。

## 数据模型

### 运行时（内存）

```ts
interface GraphNode extends Bookmark {
  x: number; y: number;       // d3-force 维护
  vx: number; vy: number;     // 速度
  fx?: number; fy?: number;   // 非空 = 图钉固定
  radius: number;             // 12–24px，由 visits 决定
  groupHue: number;           // 来自 parentId 的确定性色相
}

interface GraphEdge {
  id: string;                 // sha1(min(from,to) + ':' + max(from,to))
  from: string;               // bookmark id
  to: string;                 // bookmark id
  kind: 'manual';             // 预留扩展
  label?: string;             // 可选文案
}
```

### 持久化（chrome.storage.local）

| Key | 内容 | 原因 |
| --- | --- | --- |
| `newtab-graph-edges` | `GraphEdge[]` | 用户手动创建的连接，必须持久 |
| `newtab-graph-pins` | `Record<bookmarkId, {x, y}>` | 图钉固定位置，必须持久 |

**不持久**：非图钉节点的 `(x, y)`、相机 `(scale, tx, ty)`、hover/drag 状态。

**衍生规则**：
- 两节点最多一条边（`id` 去重）
- 书签被外部删除 → 清理 edges 中的孤儿 + pins 中的孤儿
- dev 环境（无 `chrome.storage`）回落 `localStorage`

### 同文件夹的表达方式

**不画边**，只通过物理力：
- 每个 parentId 有虚拟重心 `folderCentroid(parentId)`，在初始化时均匀分布在大圆上
- 加 `forceX(centroid.x, strength=0.04)` 和 `forceY(centroid.y, strength=0.04)`
- 结果：同组节点自然聚成色块

节点颜色（`groupHue`）= 由 parentId 哈希到色环上的确定色相，用于节点填充 + 描边，视觉传达分组。

## 物理配置

```ts
forceSimulation(nodes)
  .force('charge', forceManyBody().strength(-180).distanceMax(400))
  .force('collide', forceCollide().radius(n => n.radius + 3).iterations(2))
  .force('link', forceLink(edges).id(n => n.id).distance(120).strength(0.3))
  .force('groupX', forceX(n => folderCentroid(n.parentId).x).strength(0.04))
  .force('groupY', forceY(n => folderCentroid(n.parentId).y).strength(0.04))
  .force('center', forceCenter(0, 0))
  .alphaDecay(0.02);
```

**校准方向**（若需要调参）：节点过散 → 加大 groupXY strength；节点重叠 → 加大 collide radius 或迭代次数；整体漂移 → 增强 center。

## 交互模型

| 操作 | 效果 |
| ---- | ---- |
| 点击节点 | 新标签页打开 URL |
| 左键拖节点 | `fx, fy = 鼠标位置`；松手清空 → 节点弹回物理平衡 |
| **Shift + 拖节点 → 节点** | 建立 `manual` 边；过程中画虚线 ghost；松在空白取消 |
| 右键节点 | 菜单：打开 / 编辑 / 删除书签 / 📌 固定位置 / 取消固定 |
| 右键边 | 菜单：删除连接 / 编辑标签 |
| 右键空白 | 菜单：+ 书签 / + 分组 / 重置布局 / 适合屏幕 |
| 滚轮 | 以鼠标为中心缩放（step 1.1–1.2×，clamp 0.3–3） |
| 空白左键拖 | 平移相机 |
| 双击空白 | 重置相机 `(scale=1, tx=0, ty=0)` 并 `alpha(0.3).restart()` |
| 过滤框输入 | name + url + folder label 匹配，未匹配节点 `alpha=0.15` |
| 过滤框 Enter | 唯一匹配时打开 |
| Esc | 按当前上下文：取消建边 / 关菜单或对话框 / 清过滤并 blur |
| `0` | 重置相机 |
| `+` / `-` | 缩放 |
| `R` | 重置物理布局 |

### 图钉

右键 → "固定位置" → 写 `pins[bookmarkId] = {x, y}` + 设 `fx, fy`。视觉加 ▲ 标记。再右键 → "取消固定" 删 `pins[id]` 并清 `fx/fy`。

### 边的命中测试

边中点建 quadtree；光标 40px 半径粗筛最多 20 条；精确判定用点到线段距离 < 6px。每帧重建 quadtree（500 节点 < 0.3ms）。

### 建边的 UX 细节

1. `pointerdown` 在节点上 + shift 键按下 → 进入 "edge-draft" 状态，记录 `source`
2. `pointermove` → 更新 `draftTo = {x, y}`（cursor 位置）
3. 命中另一节点 → 临时高亮该节点
4. `pointerup` 在节点上 → 调用 `edges.add({ from: source.id, to: target.id })`
5. `pointerup` 在空白 → 丢弃 draft
6. Esc → 丢弃 draft

## 渲染循环

### HiDPI

```ts
const dpr = window.devicePixelRatio || 1;
canvas.width = cssWidth * dpr;
canvas.height = cssHeight * dpr;
ctx.scale(dpr, dpr);
```

### 每帧

```
tick():
  1. if (alpha < 0.003 && !hover && !drag && !cameraActive) → pause rAF
  2. simulation.tick()
  3. rebuild quadtree (nodes + edge midpoints)
  4. render:
     a. clearRect
     b. ctx.save(); apply camera transform (translate → scale)
     c. drawEdges:
          - 仅 manual edges
          - stroke = folderHue(from) → folderHue(to) gradient
          - width = hover ? 2 : 1
          - hover 边额外画 label（若存在）
     d. drawGhostEdge (建边中的虚线)
     e. drawNodes:
          - fill = folderHue
          - hover → 加外圈描边
          - pinned → 右上角 ▲
          - filter 未命中 → alpha 0.15
     f. drawLabels (仅 hover + filter-match + pinned 节点)
     g. ctx.restore()
```

**文本绘制节流**：不给全部 500 节点画文字（画面太乱 + 耗时），只给 hover/过滤命中/图钉节点画名称。

### 非活跃暂停

当 `alpha < 0.003` 且没有 hover / drag / 缩放平移活动时，**停 rAF**。下次用户操作时重启（新一次 hover / wheel / pointermove 会把 `needsFrame = true`，由事件监听恢复 rAF）。

## 边缘情况与错误处理

| 场景 | 处理 |
| ---- | ---- |
| `chrome.bookmarks` 不可用（dev） | Graph 走 fallback 数据；edges/pins 走 localStorage 兜底 |
| `chrome.storage.local` 读失败 | edges=`[]`, pins=`{}`，console.warn，UI 继续可用 |
| 书签被 onRemoved | props 变化 → useEffect 清理孤儿 edges/pins 并写回 |
| 只有 1 节点 | 跳过 groupX/groupY；居中；正常交互 |
| 0 节点 | Canvas 空状态："添加第一个书签"按钮；不启动物理 |
| 单 folder > 200 节点 | groupXY strength 降到 0.02 |
| 自连 (from === to) | 静默忽略 |
| 重复建边 | id 去重，upsert |
| tab 切走 | `visibilitychange` 暂停 rAF；回来时重启（alpha 保持） |
| 窗口 resize | canvas resize + dpr 重设；相机保持；重跑 `forceCenter` |
| 拖拽时光标离开 canvas | `pointerup` 挂在 `window`，确保 drop 触发 |
| shift-drag 落到边而非节点 | 忽略（只允许落节点） |
| 过滤输入按 Esc | 清空 + blur，相机不动 |

## 性能

**目标**：500 节点 + 50 边
- idle：0% CPU（rAF 停止）
- drag 活跃：< 15% CPU（M1 或中端 Intel）
- wheel 缩放：< 20% CPU
- 内存：< 50MB 附加

**优化手段**：
1. Canvas 2D（非 SVG/React 每帧）
2. d3-force 内部 Barnes-Hut quadtree（N-body 对数复杂度）
3. 命中测试 quadtree 粗筛
4. alpha 阈值自动暂停
5. 标签只画 hover / filter-match / pinned
6. 不在 Canvas 里画背景 grid/grain（Tweaks 背景用 DOM 层透出）

## 依赖新增

```json
{
  "d3-force": "^3.0.0",
  "d3-quadtree": "^3.0.1",
  "@types/d3-force": "^3.0.10",
  "@types/d3-quadtree": "^3.0.6"
}
```

只 import 子包，不引 `d3` 本体；Vite tree-shake 后约 10KB gzip。

**Bundle 影响**：176KB → 约 210–220KB（gzip 65–68KB）。

## 测试

### 单元（vitest）

- `hitTest.ts`：节点命中 / 边线段距离判定
- `edges.ts` / `pins.ts`：CRUD、去重、孤儿清理
- `render.ts` 工具：`folderCentroid`、`folderHue`、HiDPI 转换
- `useGraphSim.ts`：初始化、tick、drag/pin 状态转换（不跑真实模拟，只验状态机）

### 集成（vitest + jsdom + testing-library）

- 顶部过滤输入 → canvas 接收到正确 filter
- 右键菜单的创建/删除书签流程（mock chrome.bookmarks）
- `onRemoved` 事件 → 孤儿 edges/pins 清理

### 视觉（人工）

- DPR 1/2/3 清晰度
- 100 / 300 / 500 节点 FPS（Chrome DevTools Performance 5s 录制）
- 深/浅主题渲染正确
- 过滤 / hover / 建边 / 图钉 / 缩放 / 平移 / 删节点后图自愈

## 从 Constellation 迁移

**删**：`src/designs/Constellation.tsx`

**保留、继续用**：
- `Favicon.tsx`（转纯函数 `drawFavicon(ctx, ...)` 用于 canvas）
- `BookmarkDialog.tsx` / `Modal.tsx` / `ContextMenu.tsx` / `TodoPanel.tsx`（Graph.tsx 继续用）
- `services/chromeApi.ts`（CRUD 不变）
- `hooks/useChromeData.ts` / `useSettings.ts` / `useTodos.ts`（不变）
- `styles/tokens.css` + `shell.css`（清理 `[data-qd-cell]` 等死规则）
- `i18n.ts`（`constellation` section：legend 描述改为"同色=同分组；连线=手动关联"；stripTop/stripRecent 保留）

**App.tsx**：`<Constellation />` → `<Graph />`（一行）。

## 回退

若上线后发现性能不够（罕见，规模在 500 以内），在 Tweaks 加一个"静态布局"开关：

```ts
if (staticLayout) simulation.stop();   // 节点定位一次后冻结，仍可拖
```

相当于退化到"节点可拖的静态图"，不引入任何新 lib。

## 交付顺序

1. `Graph/` 目录骨架 + `edges.ts` / `pins.ts` / `hitTest.ts` 单元测试
2. `render.ts` 纯绘制函数 + 静态数据 smoke test
3. `useCamera.ts` + pan/zoom
4. `useGraphSim.ts` + d3-force 集成
5. `GraphCanvas.tsx` 拼接 + rAF 循环
6. `Graph.tsx` 外壳 + 复用 Dialog/Menu/TodoPanel
7. 删 `Constellation.tsx`，换 `App.tsx` 的 import
8. 性能走查（500 节点）+ 主题/尺寸走查
9. 更新 README + i18n 文案

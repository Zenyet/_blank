# 新标签页 · 图视图 (Graph)

Chrome 扩展（Manifest V3），替换新标签页，把书签渲染成一张 **Obsidian 风格的力导向图**：

- 节点 = 书签；颜色 = 所属文件夹（同分组自然聚类）
- 连线 = 你手动画的"关联" — Shift 拖一个节点到另一个节点即可创建
- 物理模拟、缩放平移、图钉固定
- 底部保留「常用 5 + 最近 4」快速入口
- Canvas 2D + d3-force + d3-quadtree，500 节点 60fps

## 功能

| 操作 | 入口 |
| ---- | ---- |
| 打开书签 | 点击节点（新标签页） |
| 添加书签 | 顶部 ＋ 添加，或右键空白 |
| 新建分组 | 顶部 ＋ 新建分组，或右键空白 |
| 编辑书签 | 右键节点 → 编辑 |
| 删除书签 | 右键节点 → 删除 |
| 固定 / 取消固定节点 | 右键节点 → 固定位置 / 取消固定 |
| 建立关联 | **Shift + 拖**节点到另一节点 |
| 删除关联 | 右键连线 → 删除连接 |
| 缩放 | 鼠标滚轮（以光标为中心） |
| 平移 | 拖空白区域 |
| 重置视角 | 双击空白 |
| 过滤 | 顶部输入框，或按 `/` 聚焦 |
| 任务 | 顶部「今天」按钮 |
| 外观 | 右下齿轮 |

## 数据来源

- `chrome.bookmarks` — 书签与分组（第一层文件夹）
- `chrome.history` — 近 30 天访问频次 → 节点大小
- `chrome.topSites` — 书签为空时兜底
- `chrome.storage.local` — 关联、图钉、设置、任务持久化
- `https://{domain}/favicon.ico` — 站点图标（失败回落字母色块）

## 开发

```bash
npm install
npm run dev        # 使用 fallback mock 数据预览
npm test           # 跑 vitest 单元测试（folderHue / edges / pins / hitTest / useCamera）
npm run build      # 构建 dist/
```

## 安装到 Chrome

1. `npm run build`
2. 打开 `chrome://extensions`，启用开发者模式
3. 「加载已解压的扩展程序」→ 选择 `dist/`
4. 打开新标签页

## 权限

| 权限 | 用途 |
| ---- | ---- |
| `bookmarks` | 读写书签 |
| `history` | 聚合访问频次 |
| `topSites` | 书签为空时兜底 |
| `storage` | 关联、图钉、设置、任务持久化 |

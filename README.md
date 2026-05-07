# Loci

Chrome 扩展（Manifest V3），替换新标签页，把真实 Chrome 书签变成一张可搜索、可编辑、可聚焦的图谱。

## 现在的交互模型

- 首页显示顶层分组节点，以及直接挂在书签栏下的未分组书签。
- 点击分组节点会进入该分组，子分组和直接书签会在当前层级里散开。
- 点击书签节点会打开书签。
- 搜索会匹配分组和书签；选中结果时，图会切到匹配节点所在层级并平滑跟随聚焦。
- 右键空白可添加书签或新建分组；添加书签默认落在当前层级，首页添加就是 Chrome 书签栏直属书签。
- 右侧 rail 是分组管理入口，可重命名、删除、移动分组并调整分组色调。

## Chrome 联动

扩展直接读写 Chrome 本机 API：

- `chrome.bookmarks`：读取书签树；创建、编辑、移动、删除书签和文件夹；监听外部变化并刷新图。
- `chrome.history`：聚合近 30 天访问频次，用于节点权重和最近访问条。
- `chrome.topSites`：当书签为空时，用常用站点做轻量兜底。
- `chrome.storage.local`：保存图连线、图钉位置、设置和本地小数据。

开发模式下没有 Chrome 扩展 API，会自动使用 localStorage mock 数据；安装到 Chrome 后才会接真实书签。

## 常用操作

| 操作 | 入口 |
| ---- | ---- |
| 进入分组 | 点击分组节点 |
| 返回上级 | 顶部当前分组 chip，或右侧 rail 当前分组按钮 |
| 打开书签 | 点击书签节点 |
| 搜索/聚焦 | 直接输入 `a-z` 唤起居中搜索 |
| 添加书签 | 右键空白 → 添加 |
| 新建分组 | 右键空白 → 新建分组 |
| 编辑/删除书签 | 右键书签节点 |
| 建立关联 | `Shift` + 拖书签节点到另一个书签节点 |
| 删除关联 | 右键连线 |
| 缩放/平移 | 滚轮 / 拖空白 |
| 重置视角 | 双击空白 |
| 设置 | 右上角设置按钮 |

## 开发

```bash
npm install
npm run dev          # Vite 预览，使用 mock 数据
npm run typecheck    # TypeScript 检查
npm test             # Vitest
npm run build        # 构建 dist/
npm run check        # typecheck + test + build
```

## 安装到 Chrome

1. `npm run build`
2. 打开 `chrome://extensions`
3. 启用“开发者模式”
4. 选择“加载已解压的扩展程序”
5. 选择项目里的 `dist/`
6. 打开新标签页

## 打包

```bash
npm run package:extension
```

脚本会先构建 `dist/`，再生成：

```text
release/loci-0.1.0.zip
```

这个 zip 可用于备份、分发测试或作为 Chrome Web Store 上传前的本地包。

## 权限说明

| 权限 | 用途 |
| ---- | ---- |
| `bookmarks` | 读写 Chrome 书签和分组 |
| `history` | 聚合访问频次和最近访问 |
| `topSites` | 书签为空时显示常用站点 |
| `storage` | 保存设置、连线和图钉 |

隐私说明见 [docs/PRIVACY.md](docs/PRIVACY.md)。

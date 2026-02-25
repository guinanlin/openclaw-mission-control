# OpenClaw 核心目录（Core Directory）实施方案

## 1. 概述

### 1.1 目标

在 Mission Control 网页端增加 **Core Directory** 功能，读取并展示本机 `~/.openclaw/` 目录的完整目录树，便于管理员查看 OpenClaw 配置目录结构（agents、credentials、extensions、identity、logs、openclaw.json 等）。

### 1.2 采用方案

采用 **方案 A**：Mission Control 后端直接读取本机 `~/.openclaw/` 目录。适用于 Mission Control 与 OpenClaw 部署在同一台机器的场景。

### 1.3 菜单位置

在侧边栏 **Administration** 分组下新增菜单项 **Directory**（或 "Core Directory"），仅对管理员可见，与其他管理入口（Organization、Gateways、Main Agent、Agents）并列。

---

## 2. 后端实施

### 2.1 配置项

在 `backend/app/core/config.py` 中新增环境变量：

| 变量名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `OPENCLAW_CONFIG_DIR` | str | `~/.openclaw` | OpenClaw 配置目录路径。支持 `~` 展开为用户主目录 |

### 2.2 新增 API

**路由**：`GET /api/v1/openclaw/config-tree`

**权限**：管理员（与 gateways、agents 等一致，需 `admin` 角色或 local auth）

**响应模型**：

```json
{
  "root": "/home/user/.openclaw",
  "tree": {
    "name": ".openclaw",
    "type": "dir",
    "children": [
      {
        "name": "agents",
        "type": "dir",
        "children": [...]
      },
      {
        "name": "openclaw.json",
        "type": "file"
      }
    ]
  }
}
```

**错误**：
- 目录不存在：`404`，返回 `{"detail": "OpenClaw config directory not found"}`
- 无权限：`403`
- 非管理员：`403`

### 2.3 实现逻辑

1. 解析 `OPENCLAW_CONFIG_DIR`，展开 `~` 为 `os.path.expanduser`
2. 检查路径是否存在且为目录
3. 递归遍历目录，构建树形结构（仅包含名称、类型 `dir`/`file`，可选 `children`）
4. 可选：限制递归深度（如 10 层）与最大条目数（如 500），防止超大目录阻塞
5. 敏感文件：可选对 `credentials/` 等子目录做脱敏（如只显示目录名，不递归内部）

### 2.4 文件结构

```
backend/
├── app/
│   ├── api/
│   │   └── openclaw_config.py    # 新增：config-tree 路由
│   ├── schemas/
│   │   └── openclaw_config.py    # 新增：ConfigTreeNode, ConfigTreeResponse
│   └── main.py                   # 注册 openclaw_config_router
```

### 2.5 Docker 部署

若 Mission Control 以 Docker 运行，需在 `compose.yml` 中挂载宿主机 `~/.openclaw` 到容器内：

```yaml
backend:
  volumes:
    - ~/.openclaw:/app/.openclaw:ro   # 只读
  environment:
    OPENCLAW_CONFIG_DIR: /app/.openclaw
```

或通过环境变量传入宿主机路径，由 backend 在宿主侧读取（若使用 bind mount 到固定路径则更简单）。

---

## 3. 前端实施

### 3.1 侧边栏菜单

在 `frontend/src/components/organisms/DashboardSidebar.tsx` 中，于 **Administration** 区块内新增：

- **路径**：`/directory`
- **图标**：`FolderOpen` 或 `FolderTree`（来自 lucide-react）
- **标签**：`Directory` 或 `Core Directory`
- **可见性**：`isAdmin === true` 时显示

放置顺序建议：Organization → Gateways → Main Agent → Agents → **Directory**

### 3.2 页面与路由

- **路由**：`/directory`
- **页面文件**：`frontend/src/app/directory/page.tsx`
- **布局**：使用 `DashboardPageLayout`，与 gateways、agents 等保持一致
- **权限**：`adminOnlyMessage="Only organization owners and admins can view the OpenClaw config directory."`

### 3.3 目录树组件

- 调用 `GET /api/v1/openclaw/config-tree`
- 使用可折叠树形 UI 展示目录结构
- 目录节点可展开/收起，文件节点为叶子节点
- 显示根路径（如 `/home/user/.openclaw`）
- 加载中与错误状态处理
- 目录不存在或 API 报错时显示友好提示

### 3.4 前端页面展示效果

#### 3.4.1 页面整体效果

页面沿用 Mission Control 通用布局：左侧边栏 + 右侧主内容区，与 Gateways、Agents 等管理页一致。

**顶部标题区（白底、有下边框）：**

- 大标题：`Directory`（2xl 字号、深灰）
- 副标题：`View the OpenClaw config directory (~/.openclaw/) structure.`（较小字号、浅灰）
- 可选：右上角「Refresh」按钮

**主内容区（浅灰背景 `bg-slate-50`）：**

- 居中或靠左一张白底圆角卡片（`rounded-lg border border-slate-200`）
- 卡片内展示目录树，带适度内边距

#### 3.4.2 目录树视觉效果

```
┌─────────────────────────────────────────────────────────────┐
│  Root: /home/user/.openclaw                    [Refresh]     │
├─────────────────────────────────────────────────────────────┤
│  📁 .openclaw                                                │
│    ├── 📁 agents                                             │
│    │     └── ...                                             │
│    ├── 📁 credentials                                        │
│    ├── 📁 extensions                                         │
│    ├── 📁 identity                                           │
│    ├── 📁 logs                                               │
│    └── 📄 openclaw.json                                      │
└─────────────────────────────────────────────────────────────┘
```

- **根路径**：卡片顶部一行，灰色小字 `Root: /home/user/.openclaw`
- **树形结构**：从上到下垂直排列，子项相对父项有缩进（如每层 24px）
- **目录**：文件夹图标 + 名称，可展开/收起
- **文件**：文件图标 + 名称，无子项
- 文字为深灰，行高适中，便于扫描

#### 3.4.3 各状态下的界面展示

| 状态 | 界面展示 |
|------|----------|
| **加载中** | 卡片内居中显示 Loading 动画（Spinner 或 Skeleton 占位条） |
| **成功** | 显示根路径 + 完整可展开的目录树 |
| **目录不存在 (404)** | 卡片内显示提示文案，浅红/琥珀色背景，说明检查配置或挂载 |
| **无权限 (403)** | 使用现有 AdminOnlyNotice 样式（非管理员进入时） |
| **请求失败** | 卡片内红色提示框 + 错误信息 + 「Retry」按钮 |

### 3.5 前端文件结构

```
frontend/src/
├── app/
│   └── directory/
│       └── page.tsx              # 新增：Core Directory 页面
├── components/
│   └── directory/
│       └── ConfigTree.tsx        # 新增：目录树组件（可选拆分）
```

---

## 4. API 客户端

若使用 OpenAPI 生成客户端，需在 backend 暴露新路由后重新生成 `frontend/src/api/generated/` 下的客户端代码，或先手写 `fetch` 调用。

---

## 5. 安全与限制

- **权限**：仅管理员可访问
- **只读**：仅展示目录结构，不提供文件内容读取或修改
- **路径限制**：仅允许读取 `OPENCLAW_CONFIG_DIR` 配置的目录，禁止路径穿越
- **递归限制**：建议最大深度 10、最大节点数 500，超限时截断并返回部分树
- **敏感目录**：可选对 `credentials/` 子目录不展开内容，仅显示目录名

---

## 6. 实施步骤

| 步骤 | 内容 | 状态 |
|------|------|------|
| 0 | 侧边栏：Administration 下新增 Directory 菜单；创建 `/directory` 占位页 | ✅ 已完成 |
| 1 | 后端：config 增加 `OPENCLAW_CONFIG_DIR` | ✅ 已完成 |
| 2 | 后端：实现 `ConfigTreeNode`、`ConfigTreeResponse` schema | ✅ 已完成 |
| 3 | 后端：实现 `openclaw_config.py` 路由与递归遍历逻辑 | ✅ 已完成 |
| 4 | 后端：在 `main.py` 注册 router | ✅ 已完成 |
| 5 | 前端：实现 `/directory` 页面及目录树组件（替换占位页） | ✅ 已完成 |
| 6 | Docker：如需，在 compose 中增加 volume 挂载 | ✅ 已完成 |
| 7 | 测试：本地与 Docker 场景验证 | 待验证 |

---

## 7. 后续扩展（可选）

- 点击文件节点时，可选增加「查看文件内容」功能（需新增 `GET /api/v1/openclaw/config-file?path=...` 并做严格路径校验）
- 支持按 Gateway 选择，为将来远程读取（方案 B/C）预留接口形态

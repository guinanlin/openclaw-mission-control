# Agents 页面逻辑说明

本文档描述前端路由 `/agents`（如 `http://192.168.8.116:3000/agents`）对应的「Agents」列表页的页面逻辑、数据流与交互行为。

---

## 1. 页面入口与权限

- **路由**：`/agents`
- **入口**：
  - 侧栏：仅组织 **管理员/所有者** 可见「Agents」链接（`DashboardSidebar`，`isAdmin` 为真时渲染）
  - 用户菜单：`UserMenu` 中也有「Agents」入口
- **权限**：
  - 未登录：展示 `SignedOutPanel`，提示 "Sign in to view agents."，可跳转登录/注册，并指定 `forceRedirectUrl="/agents"`
  - 已登录但非管理员：展示 `AdminOnlyNotice`，文案为 "Only organization owners and admins can access agents."
  - 已登录且为组织管理员：正常展示 Agents 列表与操作

---

## 2. 页面结构

页面由以下部分构成：

| 部分 | 说明 |
|------|------|
| **布局** | `DashboardPageLayout`：通用 Dashboard 壳（侧栏 + 主内容区） |
| **标题区** | 标题 "Agents"，描述为「X agent(s) total」，以及可选的「New agent」按钮 |
| **内容区** | 一个带边框/阴影的容器，内嵌 `AgentsTable` |
| **错误区** | 列表接口报错时，在表格下方显示红色错误信息 |
| **删除确认弹窗** | `ConfirmActionDialog`，用于删除前的二次确认 |

---

## 3. 数据获取

### 3.1 使用的接口

- **Agents 列表**：`GET /api/v1/agents`  
  - Hook：`useListAgentsApiV1AgentsGet`（无查询参数，即当前组织下全部可见 Agent）
  - 仅在 `isSignedIn && isAdmin` 为真时请求（`enabled`）
  - 轮询：`refetchInterval: 15_000`（15 秒）
  - 挂载时：`refetchOnMount: "always"`

- **Boards 列表**：`GET /api/v1/boards`  
  - Hook：`useListBoardsApiV1BoardsGet`
  - 同样在 `isSignedIn && isAdmin` 时请求，用于表格中「Board」列展示看板名称
  - 轮询：`refetchInterval: 30_000`（30 秒），`refetchOnMount: "always"`

### 3.2 数据形态

- **agents**：从 `agentsQuery.data` 解析，当 `status === 200` 时取 `data.data.items`，否则为 `[]`
- **boards**：从 `boardsQuery.data` 解析，当 `status === 200` 时取 `data.data.items`，否则为 `[]`

后端 `list_agents` 支持可选 `board_id`、`gateway_id` 筛选；本页不传参，即拉取当前组织下所有 Agent。

---

## 4. URL 与排序

- 使用 `useUrlSorting`，将排序状态同步到 URL 查询参数，便于分享与刷新保持：
  - 参数前缀：`paramPrefix: "agents"`
  - 排序字段参数：`agents_sort`（列 id）
  - 排序方向参数：`agents_dir`（升/降序）
- **可排序列**：`name`、`status`、`openclaw_session_id`、`board_id`、`last_seen_at`、`updated_at`
- **默认排序**：按 `name` 升序 `[{ id: "name", desc: false }]`
- 排序状态传给 `AgentsTable` 的 `sorting` 与 `onSortingChange`，表格表头点击会更新 URL 并触发重新排序（前端排序，数据来自上述列表接口）。

---

## 5. AgentsTable 表格逻辑

### 5.1 列定义

| 列 id | 表头 | 展示规则 |
|-------|------|----------|
| `name` | Agent | 链接到 `/agents/{id}`，主文案为 `name`，副文案为 `ID {id}` |
| `role` | Role | 由 `is_gateway_main` / `is_board_lead` 推导：Gateway main / Lead / Worker |
| `board_id` | Board | 有 `board_id` 时显示看板名称并链接到 `/boards/{boardId}`，否则显示 "—" |
| `status` | Status | 使用 `pillCell` 展示状态标签 |
| `openclaw_session_id` | Session | 文本，过长时截断 |
| `last_seen_at` | Last seen | 相对时间（如 "2 hours ago"） |
| `updated_at` | Updated | 绝对时间 |

看板名称通过 `boards` 列表在内存中构建 `boardNameById` Map，用 `board_id` 查表得到。

### 5.2 行操作（showActions = true）

- **Edit**：链接到 `/agents/{agent.id}/edit`
- **Delete**：不直接请求，而是调用 `onDelete(agent)`，由页面层把该 agent 设为 `deleteTarget`，打开确认弹窗

### 5.3 空状态

- 无数据且未在加载时：
  - 若传入 `emptyState`：显示自定义图标、标题、描述，以及可选 CTA（如 "Create your first agent" 链到 `/agents/new`）
  - 本页传入：`title: "No agents yet"`，`actionHref: "/agents/new"`，`actionLabel: "Create your first agent"`
- 未传 `emptyState` 时使用默认 `emptyMessage`（本页由 emptyState 覆盖）。

### 5.4 加载与样式

- `isLoading` 来自 `agentsQuery.isLoading`，展示加载行或骨架
- `stickyHeader: true`，表头吸顶
- 行 hover 样式：`hover:bg-slate-50`

---

## 6. 头部操作

- **New agent 按钮**：仅当 `agents.length > 0` 时显示，点击 `router.push("/agents/new")`
- 当列表为空时，不显示该按钮，引导用户通过表格空状态的「Create your first agent」进入创建页

---

## 7. 删除流程

1. 用户在表格某行点击 Delete → 调用 `onDelete(agent)` → 页面设置 `deleteTarget = agent`，打开 `ConfirmActionDialog`。
2. 弹窗内容：
   - 标题："Delete agent"
   - 描述："This will remove {agent.name}. This action cannot be undone."
   - 确认按钮触发 `handleDelete`，取消或关闭将 `setDeleteTarget(null)`。
3. **handleDelete**：
   - 若 `!deleteTarget` 直接 return
   - 调用 `deleteMutation.mutate({ agentId: deleteTarget.id })`
4. **deleteMutation**：
   - 使用 `useDeleteAgentApiV1AgentsAgentIdDelete`，封装了 `createOptimisticListDeleteMutation`：
     - **onMutate**：取消当前 agents 查询、保存当前列表快照，并乐观更新缓存（从列表中移除该 id）
     - **请求**：`DELETE /api/v1/agents/{agentId}`
     - **onSuccess**：`setDeleteTarget(null)` 关闭弹窗；invalidate 的 key 包含 agents 列表与 boards 列表（`agentsKey`, `boardsKey`），保证列表与看板侧数据刷新
     - **onError**：回滚到保存的快照；弹窗中通过 `errorMessage={deleteMutation.error?.message}` 显示错误

---

## 8. 相关文件索引

| 类型 | 路径 |
|------|------|
| 页面组件 | `frontend/src/app/agents/page.tsx` |
| 表格组件 | `frontend/src/components/agents/AgentsTable.tsx` |
| 布局 | `frontend/src/components/templates/DashboardPageLayout.tsx` |
| 通用表格 | `frontend/src/components/tables/DataTable.tsx` |
| 排序 Hook | `frontend/src/lib/use-url-sorting.ts` |
| 乐观删除 | `frontend/src/lib/list-delete.ts` |
| Agents API（前端） | `frontend/src/api/generated/agents/agents.ts` |
| 列表接口（后端） | `backend/app/api/agents.py`（`list_agents`） |
| 数据模型 | `frontend/src/api/generated/model/agentRead.ts` |

---

## 9. 与其它页面的关系

- **/agents/new**：创建新 Agent，创建成功后跳转到 `/agents/{id}`
- **/agents/{id}**：Agent 详情，可从表格 Agent 名称链接进入
- **/agents/{id}/edit**：编辑 Agent，由表格行操作「Edit」进入
- **/boards**：表格中 Board 列链接到对应看板详情
- **/gateways/{gatewayId}**：Gateways 详情页也会复用 `AgentsTable`，但只展示该 gateway 下的 agents（传入过滤后的列表与不同的 emptyMessage）

以上即为 `/agents` 页面的完整逻辑说明。

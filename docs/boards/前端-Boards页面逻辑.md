# Boards 前端页面逻辑

本文档描述 Mission Control 中 **Boards（看板/团队）** 相关的前端页面结构、状态管理与业务逻辑。Boards 是系统的核心模块，用于管理看板及其下的任务（Task）、智能体（Agents）、审批（Approvals）等。

---

## 1. 路由与页面结构

| 路径 | 页面 | 说明 |
|------|------|------|
| `/boards` | 看板列表页 | 展示当前组织下所有可见看板，支持排序、删除、跳转详情与新建 |
| `/boards/new` | 新建看板页 | 表单创建看板（name、description、gateway、board_group 等），提交后跳转编辑/onboarding |
| `/boards/[boardId]` | 看板详情页 | 单看板工作台：看板信息、任务看板、智能体、审批、聊天、Live Feed |
| `/boards/[boardId]/edit` | 看板编辑页 | 编辑看板基本属性与规则 |
| `/boards/[boardId]/approvals` | 看板审批页 | 该看板下的审批列表与操作 |

侧边栏中「Boards」链接指向 `/boards`，进入后点击某看板名称进入 `/boards/[boardId]`。

---

## 2. 看板列表页 (`/boards`)

### 2.1 职责

- 拉取并展示**看板列表**与**看板组列表**，用于表格中的「Group」列与筛选。
- 支持按 **name / group / updated_at** 排序（通过 URL 参数 `boards_sort` 等持久化）。
- 管理员可「Create board」进入 `/boards/new`；可对单看板执行删除（二次确认）。

### 2.2 数据来源

- **看板列表**：`GET /api/v1/boards`，通过 `useListBoardsApiV1BoardsGet`，`enabled: isSignedIn`，约 30s 轮询 + `refetchOnMount: "always"`。
- **看板组列表**：`GET /api/v1/board-groups`，`useListBoardGroupsApiV1BoardGroupsGet`，用于解析 `board_group_id` 显示组名。

### 2.3 主要组件与逻辑

- **DashboardPageLayout**：统一布局、未登录时提示登录并重定向到 `/boards`。
- **BoardsTable**：表格展示 `boards`，列包括 Board（链接到 `/boards/:id`）、Group、Updated、操作（编辑/删除）。排序状态由 `useUrlSorting` 与 URL 同步。
- **ConfirmActionDialog**：删除前确认；删除使用 `useDeleteBoardApiV1BoardsBoardIdDelete`，并配合 `createOptimisticListDeleteMutation` 做乐观更新与缓存失效。

### 2.4 权限

- 仅登录用户可见列表；**创建看板**仅组织管理员（`isAdmin`）显示入口。

---

## 3. 看板详情页 (`/boards/[boardId]`)

这是 Boards 最核心的页面：单看板工作台，包含任务看板、智能体、审批、看板聊天与 Live Feed。

### 3.1 整体布局

- **DashboardShell** + **DashboardSidebar**：全局壳与侧边导航。
- 主内容区分为：
  - **左侧/主区**：看板名称、设置入口、视图切换（board/list）、**TaskBoard**（四列：Inbox / In Progress / Review / Done）、依赖/跨看板提示（DependencyBanner）、审批面板（BoardApprovalsPanel）、目标/进度（BoardGoalPanel 等）。
  - **右侧/侧栏**：智能体列表、Live Feed、看板聊天（BoardChatComposer）等。
- 任务详情以**抽屉/对话框**形式展示（选中任务、评论、编辑、删除等）。

### 3.2 初始数据加载（Snapshot）

- 进入页面且 `isSignedIn && boardId` 时执行 **loadBoard**：
  1. 调用 **GET `/api/v1/boards/:boardId/snapshot`**（`getBoardSnapshotApiV1BoardsBoardIdSnapshotGet`）。
  2. 响应为 **BoardSnapshot**：`board`、`tasks`、`agents`、`approvals`、`chat_messages`、`pending_approvals_count`。
  3. 将结果写入本地 state：`setBoard`、`setTasks`（经 `normalizeTask`）、`setAgents`（`normalizeAgent`）、`setApprovals`（`normalizeApproval`）、`setChatMessages`。
  4. 可选：**GET `/api/v1/boards/:boardId/group-snapshot`**（`getBoardGroupSnapshotApiV1BoardsBoardIdGroupSnapshotGet`），用于跨看板依赖/分组信息，结果存 `groupSnapshot`；失败仅记 `groupSnapshotError`，不阻塞主流程。

- 依赖数据（与 board 解耦，按需拉取）：
  - **当前用户成员信息**：`GET /api/v1/organizations/me/member` → 用于 `boardAccess`（canRead/canWrite）、`isOrgAdmin`、`currentUserDisplayName`。
  - **标签**：`GET /api/v1/tags`，供任务编辑/筛选。
  - **组织自定义字段**：`GET /api/v1/organizations/me/custom-fields`，过滤出当前 `boardId` 的 `boardCustomFieldDefinitions`，供任务表单。

### 3.3 任务看板（TaskBoard）

- **数据源**：来自 snapshot 的 `tasks`（以及后续 SSE 增量更新）。
- **四列**：`inbox` | `in_progress` | `review` | `done`，对应列配置（标题、样式、dot、badge）在 `TaskBoard` 组件内写死。
- **交互**：
  - 点击任务卡片 → 打开任务详情（设置 `selectedTask`、`isDetailOpen`），并可根据 URL `?taskId=xxx` 高亮/自动选中。
  - 拖拽卡片到另一列 → 调用 **PATCH `/api/v1/boards/:boardId/tasks/:taskId`**，仅传 `status`，成功后通过 SSE 或本地合并更新 `tasks` 与 `selectedTask`。
- **只读**：当 `canWrite === false` 时，`onTaskMove` 不传或只读，禁止拖拽改状态。

#### Review 列：Approval needed 与 Lead review

Review 列下有三个筛选项（All / Approval needed / Lead review / Blocked），用于区分不同等待状态：

| 筛选项 | 含义 | Lead 如何操作 |
|--------|------|----------------|
| **Approval needed** | 任务在 Review 且有关联的**待审批**（`approvals_pending_count > 0`） | 先去**审批**：点击看板工具栏的「Approvals」（盾牌）或进入该看板的审批页，对关联的 Approval 点「批准」或「拒绝」。审批通过后，若看板要求「必须有审批才能完成」，该任务才可被拖到 Done。 |
| **Lead review** | 任务在 Review、**没有**待审批、且未阻塞（`approvals_pending_count === 0` 且非 blocked） | **直接做最终决定**：在看板上把该任务卡片**拖到 Done**（完成）或**拖到 Inbox**（打回）；或在任务详情里把状态改为 Done / Inbox。不需要去审批页，因为此类任务没有 pending approval。 |
| **Blocked** | 任务在 Review 且被依赖未完成等阻塞 | 先解决依赖或阻塞后再改状态。 |

因此：**Lead review** 的「review」方式就是由 Lead（或管理员）在看板上**拖拽卡片到 Done 或 Inbox**，或在任务详情中**改状态**；无需在 Approvals 页面操作。

### 3.4 任务创建

- 在某一列（如 Inbox）点击「Add」或类似入口，打开创建表单（标题、描述、状态、优先级、截止日期、负责人、标签、依赖、自定义字段等）。
- 提交时调用 **POST `/api/v1/boards/:boardId/tasks`**（`createTaskApiV1BoardsBoardIdTasksPost`），body 为 **TaskCreate** + 可选 `custom_field_values`。
- 成功后将返回的 `TaskRead` 转为 `Task`（`normalizeTask`）并入 `tasks` 列表，并可选推一条 Live Feed；若开启 SSE，也会从 stream 收到 `task.created` 事件做去重合并。

### 3.5 任务编辑与删除

- **编辑**：在任务详情中修改标题、描述、状态、优先级、截止、负责人、标签、依赖、自定义字段后保存 → **PATCH `/api/v1/boards/:boardId/tasks/:taskId`**（`updateTaskApiV1BoardsBoardIdTasksTaskIdPatch`），body 为 **TaskUpdate**（含可选 `custom_field_values`）。成功后更新本地 `tasks` 与 `selectedTask`，并可能推 Live Feed。
- **删除**：确认后 **DELETE `/api/v1/boards/:boardId/tasks/:taskId`**（`deleteTaskApiV1BoardsBoardIdTasksTaskIdDelete`），成功后从 `tasks` 中移除并关闭详情。

### 3.6 任务评论

- 任务详情内展示评论列表，通过 **GET `/api/v1/boards/:boardId/tasks/:taskId/comments`**（`listTaskCommentsApiV1BoardsBoardIdTasksTaskIdCommentsGet`）拉取，分页。
- 发表评论：**POST `/api/v1/boards/:boardId/tasks/:taskId/comments`**（`createTaskCommentApiV1BoardsBoardIdTasksTaskIdCommentsPost`），成功后本地追加一条并可能推 Live Feed（`task.comment`）；SSE 也会推送 comment 事件，用于合并到当前任务评论列表。

### 3.7 实时更新（SSE）

- **任务流**：在页面可见且已加载完 snapshot 后，建立 **GET `/api/v1/boards/:boardId/tasks/stream?since=...`**（`streamTasksApiV1BoardsBoardIdTasksStreamGet`）。  
  - `since` 取当前 `tasks` 中最大 `updated_at`（或 `created_at`），避免重复全量。  
  - 服务端推送 SSE 事件类型 `task`，payload 含 `task` 或 `comment` 或 `activity`。  
  - 前端解析后：  
    - 若有 `task`：插入或更新 `tasks`，若为当前选中任务则同步 `selectedTask`。  
    - 若有 `comment` 且为当前任务：合并进 `comments`。  
    - 若有 `activity`：转为 Live Feed 项并 `pushLiveFeed`。  
  - 断线后使用指数退避重连。

- **看板聊天流**：当聊天或 Live Feed 面板打开时，建立 **GET `/api/v1/boards/:boardId/memory/stream?is_chat=true&since=...`**（`streamBoardMemoryApiV1BoardsBoardIdMemoryStreamGet`）。  
  - 收到 `memory` 且 tags 含 `chat` 时，追加到 `chatMessages` 并推 Live Feed。  
  - 同样支持断线重连。

### 3.8 审批（Approvals）

- 列表来自 snapshot 的 `approvals`；也可单独拉取审批列表（如 `streamApprovalsApiV1BoardsBoardIdApprovalsStreamGet`）用于实时或列表页。
- 批准/拒绝：**PATCH `/api/v1/boards/:boardId/approvals/:approvalId`**（`updateApprovalApiV1BoardsBoardIdApprovalsApprovalIdPatch`），成功后更新本地 `approvals` 与相关任务状态，并推 Live Feed。

### 3.9 看板聊天（Board Chat）

- 历史来自 snapshot 的 `chat_messages`；新消息通过上述 **memory stream**（`is_chat=true`）推送。
- 发送：**POST `/api/v1/boards/:boardId/memory`**（`createBoardMemoryApiV1BoardsBoardIdMemoryPost`），content 为文本（支持 `/pause`、`/resume` 等指令），成功后本地追加并推 Live Feed。

### 3.10 Live Feed

- **来源**：Activity 接口、任务评论、看板聊天、智能体上下线/更新、审批创建/通过/拒绝等，统一映射为 `LiveFeedItem`（id、created_at、message、event_type 等）。
- **历史**：打开 Live Feed 面板时，用当前 snapshot 中的 tasks、approvals、agents、chat 以及 **GET `/api/v1/activity`**（`listActivityApiV1ActivityGet`）分页拉取，按时间合并、去重，最多 200 条。
- **实时**：由任务 SSE、聊天 SSE、审批更新等驱动 `pushLiveFeed`，限制最近 50 条显示，并可有「新条目」高亮（flash）。

### 3.11 权限与只读

- **boardAccess**：由 `resolveBoardAccess(member, boardId)` 得到 `canRead`、`canWrite`（基于成员 `all_boards_write` / `all_boards_read` 或 `board_access` 细粒度）。
- **canWrite** 为 false 时：不展示创建任务、编辑任务、拖拽改状态、发评论、发聊天、审批操作等写操作；仅展示只读看板与任务详情。

### 3.12 状态与 Ref 小结

- **核心 state**：`board`、`tasks`、`agents`、`approvals`、`chatMessages`、`groupSnapshot`、`selectedTask`、`comments`、`liveFeed`，以及各类 loading/error（如 `isLoading`、`error`、`approvalsError`、`chatError` 等）。
- **Ref**：`tasksRef`、`approvalsRef`、`agentsRef`、`chatMessagesRef`、`selectedTaskIdRef`、`liveFeedRef` 等，用于在 SSE 回调或异步逻辑中拿到最新列表而不依赖闭包。
- **URL**：`taskId` 通过 `searchParams.get("taskId")` 与详情选中、高亮联动（如 `buildUrlWithTaskId`）。

---

## 4. 新建看板页 (`/boards/new`)

- 表单字段：name、description、gateway（必选，来自 `GET /api/v1/gateways`）、board_group（可选，来自 `GET /api/v1/board-groups`）。
- slug 由 name 自动 slugify 生成。
- 提交 **POST `/api/v1/boards`**（`useCreateBoardApiV1BoardsPost`），成功则跳转 **`/boards/:id/edit?onboarding=1`**。
- 仅组织管理员可见/可访问创建流程。

---

## 5. 与后端接口的对应关系（摘要）

| 前端能力 | 接口 |
|----------|------|
| 看板列表、排序、删除 | GET/DELETE `/api/v1/boards`、GET `/api/v1/board-groups` |
| 看板详情首屏 | GET `/api/v1/boards/:boardId/snapshot` |
| 跨看板分组信息 | GET `/api/v1/boards/:boardId/group-snapshot` |
| 任务列表增量实时 | GET `/api/v1/boards/:boardId/tasks/stream`（SSE） |
| 任务创建/更新/删除 | POST/PATCH/DELETE `/api/v1/boards/:boardId/tasks`（及 `/:taskId`） |
| 任务评论列表与发表 | GET/POST `.../tasks/:taskId/comments` |
| 审批列表与操作 | GET/PATCH `/api/v1/boards/:boardId/approvals`（及 `/:approvalId`） |
| 看板聊天历史与发送 | GET snapshot 的 chat_messages + POST `/api/v1/boards/:boardId/memory` |
| 看板聊天实时 | GET `/api/v1/boards/:boardId/memory/stream?is_chat=true`（SSE） |
| 活动流（Live Feed 历史） | GET `/api/v1/activity` |
| 成员与权限 | GET `/api/v1/organizations/me/member` |
| 标签、自定义字段 | GET `/api/v1/tags`、GET `/api/v1/organizations/me/custom-fields` |

---

以上即为 Boards 相关前端页面逻辑的梳理；后端接口的详细契约、权限与业务规则见《后端-Boards数据接口与交互》文档。

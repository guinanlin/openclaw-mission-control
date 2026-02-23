# Boards 后端数据接口与交互

本文档描述 Mission Control 中 **Boards（看板/团队）** 相关的后端 API、数据模型与业务规则。与《前端-Boards页面逻辑》配合，构成看板与任务从接口到前端的完整说明。

---

## 1. 概述

- **Boards**：组织内的工作单元，关联 Gateway、可选 Board Group，下挂任务、智能体、审批、看板聊天等。
- **Tasks**：看板下的工作项，有状态（inbox / in_progress / review / done）、优先级、负责人、依赖、标签、自定义字段等。
- 接口按 **REST + SSE** 设计：列表/详情/增删改用 REST；任务与看板聊天的实时推送用 SSE Stream。

---

## 2. 权限与依赖（deps）

所有看板/任务相关路由都通过 **依赖注入** 做鉴权与加载：

| 依赖 | 说明 |
|------|------|
| `require_org_member` | 要求当前用户是当前组织的成员，得到 `OrganizationContext`（organization + member） |
| `require_org_admin` | 在 org member 基础上要求管理员（owner/admin），用于创建/删除看板等 |
| `get_board_for_user_read` | 按 `board_id` 加载看板，要求**已登录用户**且对该看板有**读**权限 |
| `get_board_for_user_write` | 同上，要求**写**权限，用于创建/更新/删除看板、创建/更新/删除任务等 |
| `get_board_for_actor_read` | 支持**用户或 Agent**：Agent 只能访问自己所属看板；用户走 `require_board_access(session, user, board, write=False)` |
| `require_admin_or_agent` | 返回 `ActorContext`（user 或 agent），用于任务流、任务更新等「人或 Agent 都可操作」的接口 |

看板访问规则（`board_access_filter` / `require_board_access`）：

- 若成员 `all_boards_write` 为真，则对所有看板可写；
- 若成员 `all_boards_read` 为真，则对所有看板可读；
- 否则按 `board_access` 列表（board_id + can_read/can_write）做细粒度校验。
- 列表接口只返回当前成员有权限的看板。

---

## 3. Boards API（`/api/v1/boards`）

路由定义在 `app/api/boards.py`，前缀 `prefix="/boards"`。

### 3.1 列表看板

- **GET** `/api/v1/boards`
- **Query**：`gateway_id`、`board_group_id` 可选，用于筛选。
- **权限**：`require_org_member`；列表根据 `board_access_filter(ctx.member, write=False)` 过滤。
- **响应**：分页 `LimitOffsetPage[BoardRead]`，按 name 升序、created_at 降序。
- **说明**：返回当前组织成员可见的看板，不包含任务/智能体等详情。

### 3.2 创建看板

- **POST** `/api/v1/boards`
- **Body**：`BoardCreate`（name、slug、description、gateway_id、board_group_id、board_type、objective、success_metrics、target_date、goal_confirmed、goal_source、各类规则开关、max_agents 等）。
- **校验**：`gateway_id` 必填且需属于当前组织，且该 Gateway 下必须已有「主智能体」（未绑定 board_id 的 Agent）；若传 `board_group_id` 则需存在且属于当前组织；goal 类型且 goal_confirmed 时需填 objective 与 success_metrics。
- **权限**：`require_org_admin`。
- **响应**：`BoardRead`（含 id、organization_id、created_at、updated_at 等）。

### 3.3 获取单个看板

- **GET** `/api/v1/boards/{board_id}`
- **权限**：`get_board_for_user_read`。
- **响应**：`BoardRead`。

### 3.4 更新看板

- **PATCH** `/api/v1/boards/{board_id}`
- **Body**：`BoardUpdate`（字段均为可选，部分更新）。
- **权限**：`get_board_for_user_write`。
- **逻辑**：应用更新；若 `gateway_id` / `board_group_id` 变更，会校验新 gateway/board_group；若从「在组内」变为「不在组内」或换组，会向同组其他看板上的智能体发送「看板离开/加入组」的协调消息（`_notify_agents_on_board_group_removal` / `_notify_agents_on_board_group_addition`）。
- **响应**：`BoardRead`。

### 3.5 删除看板

- **DELETE** `/api/v1/boards/{board_id}`
- **权限**：`get_board_for_user_write`。
- **逻辑**：委托 `board_lifecycle.delete_board`，级联删除看板下任务、依赖、审批、Agent 关联、Board Memory 等依赖数据。
- **响应**：`OkResponse`。

### 3.6 看板快照（Snapshot）

- **GET** `/api/v1/boards/{board_id}/snapshot`
- **权限**：`get_board_for_actor_read`（用户或 Agent 均可，Agent 仅限本看板）。
- **逻辑**：`build_board_snapshot(session, board)` 组装 **BoardSnapshot**：
  - **board**：BoardRead
  - **tasks**：该看板下所有任务的 **TaskCardRead** 列表（含 assignee、approvals_count、approvals_pending_count、depends_on_task_ids、tag_ids、tags、blocked_by_task_ids、is_blocked）
  - **agents**：该看板下 Agent 列表（含计算后的 status）
  - **approvals**：该看板下审批列表（含关联 task_ids / task_titles）
  - **chat_messages**：该看板下 is_chat 的 BoardMemory，按时间排序，限制 200 条
  - **pending_approvals_count**
- **响应**：`BoardSnapshot`。前端用此接口做看板详情页首屏数据。

### 3.7 看板组快照（Group Snapshot）

- **GET** `/api/v1/boards/{board_id}/group-snapshot`
- **Query**：`include_self`、`include_done`、`per_board_task_limit`（默认 5）。
- **权限**：`get_board_for_actor_read`。
- **逻辑**：若当前看板属于某 Board Group，则汇总该组内相关看板的任务摘要（跨看板依赖与重叠检查用）。
- **响应**：`BoardGroupSnapshot`（group、boards 列表，每项含 board、task_counts、tasks 摘要）。

---

## 4. Tasks API（`/api/v1/boards/{board_id}/tasks`）

路由定义在 `app/api/tasks.py`，前缀 `prefix="/boards/{board_id}/tasks"`。所有子路径均先通过 `board_id` 解析出 `Board`（读或写依赖见下）。

### 4.1 列表任务

- **GET** `/api/v1/boards/{board_id}/tasks`
- **Query**：`status`、`assigned_agent_id`、`unassigned` 等可选筛选；分页为 limit/offset。
- **权限**：`get_board_for_actor_read`。
- **响应**：分页 `LimitOffsetPage[TaskRead]`。若需「卡片」信息（assignee、approval 计数、依赖/阻塞、标签），前端通常用 **snapshot** 或 **stream**，此接口多用于按条件查询。

### 4.2 任务流（SSE）

- **GET** `/api/v1/boards/{board_id}/tasks/stream`
- **Query**：`since`（ISO 时间戳，可选），只推送该时间之后发生的事件。
- **权限**：`get_board_for_actor_read`。
- **响应**：`text/event-stream`。服务端持续推送事件类型 `task`，每条 `data` 为 JSON，可包含：
  - `type`：如 `task.created`、`task.updated`、`task.status_changed`、`task.comment`
  - `task`：TaskRead（任务创建/更新时）
  - `comment`：TaskCommentRead（评论时）
  - `activity`：ActivityEventRead（活动记录）
- **用途**：前端保持长连接，增量接收任务与评论变更，实现看板与任务详情的实时更新。

### 4.3 创建任务

- **POST** `/api/v1/boards/{board_id}/tasks`
- **Body**：`TaskCreate`（title、description、status、priority、due_at、assigned_agent_id、depends_on_task_ids、tag_ids、custom_field_values、created_by_user_id 等）。
- **权限**：`get_board_for_user_write` + 管理员认证（`require_admin_auth`）。
- **逻辑**：
  - 校验并规范化 `depends_on_task_ids`（同看板、无环）；若存在未完成的依赖且任务非 inbox 或已分配负责人，则返回 **409** `task_blocked_cannot_transition`，并带 `blocked_by_task_ids`。
  - 校验 `tag_ids` 属于本组织。
  - 写入 Task、TaskDependency、标签、自定义字段值；写活动日志 `task.created`；可选通知 lead/负责人。
- **响应**：`TaskRead`；冲突时 409 + BlockedTaskError。

### 4.4 更新任务

- **PATCH** `/api/v1/boards/{board_id}/tasks/{task_id}`
- **Body**：`TaskUpdate`（同上，均为可选；可带 `comment` 表示「更新并附带一条评论」）。
- **权限**：`require_admin_or_agent` + 若为 user 则需对该看板有写权限（`_require_task_user_write_access`）。
- **逻辑**（概要）：
  - **依赖**：若更新 `depends_on_task_ids`，校验无环且依赖未完成时可能禁止状态/负责人变更（409）。
  - **状态流转**：若请求把状态改为 `done`，可能受以下规则阻止并返回 409：
    - `require_approval_for_done`：必须有关联审批已通过。
    - `require_review_before_done`：必须从 `review` 进入 `done`。
    - `block_status_changes_with_pending_approval`：存在未决审批时禁止改状态。
  - **仅 Lead 可改状态**：`only_lead_can_change_status` 时，非 lead 的 Agent 不能改状态。
  - 若带 `comment`，会创建一条 TaskComment 并可能触发 @mention 通知。
  - 更新自定义字段、标签、依赖表；写活动日志；可选通知。
- **响应**：`TaskRead`；冲突时 409。

### 4.5 删除任务

- **DELETE** `/api/v1/boards/{board_id}/tasks/{task_id}`
- **权限**：`get_board_for_user_write` + 管理员认证。
- **逻辑**：删除任务及其依赖记录、标签、自定义字段值、审批关联等；写活动日志。
- **响应**：`OkResponse`。

### 4.6 任务评论

- **GET** `/api/v1/boards/{board_id}/tasks/{task_id}/comments`  
  - 分页列表，响应 `LimitOffsetPage[TaskCommentRead]`。依赖 `get_task_or_404`（含 board 归属校验）。
- **POST** `/api/v1/boards/{board_id}/tasks/{task_id}/comments`  
  - Body：`TaskCommentCreate`（message 必填）。权限：`require_admin_or_agent`。创建评论、写活动、解析 @mention 并可选通知；响应 `TaskCommentRead`。

---

## 5. 数据模型（简要）

### 5.1 Board（`app/models/boards.py`）

- **id**、**organization_id**、**name**、**slug**、**description**
- **gateway_id**（必填用于创建/更新后的校验）、**board_group_id**（可选）
- **board_type**、**objective**、**success_metrics**、**target_date**、**goal_confirmed**、**goal_source**
- 规则开关：**require_approval_for_done**、**require_review_before_done**、**block_status_changes_with_pending_approval**、**only_lead_can_change_status**
- **max_agents**、**created_at**、**updated_at**

### 5.2 Task（`app/models/tasks.py`）

- **id**、**board_id**、**title**、**description**、**status**（inbox/in_progress/review/done）、**priority**
- **due_at**、**in_progress_at**、**previous_in_progress_at**
- **created_by_user_id**、**assigned_agent_id**、**auto_created**、**auto_reason**
- **created_at**、**updated_at**

关联：TaskDependency（task_id、depends_on_task_id）、TagAssignment、ApprovalTaskLink、TaskCustomFieldValue 等。

### 5.3 视图/响应模型

- **BoardRead**：看板对外返回结构（含上述业务字段）。
- **BoardSnapshot**：board + tasks（TaskCardRead）+ agents + approvals + chat_messages + pending_approvals_count。
- **TaskCardRead**：在 TaskRead 基础上增加 assignee、approvals_count、approvals_pending_count、depends_on_task_ids、tag_ids、tags、blocked_by_task_ids、is_blocked 等前端看板所需字段。
- **TaskCreate / TaskUpdate**：创建与部分更新 body；TaskUpdate 支持 comment、depends_on_task_ids、tag_ids、custom_field_values。

---

## 6. 业务规则摘要

- **看板与 Gateway**：创建/更新看板必须指定有效 gateway，且该 gateway 下已有「主智能体」。
- **看板与 Board Group**：看板可归属一个 board_group；更新看板进出组时会向同组其他看板上的智能体发送协调消息。
- **任务依赖**：仅支持同看板内依赖；存在未完成依赖时，不允许将任务设为非 inbox 或分配负责人（创建时）；更新时可能禁止状态/负责人变更（409）。
- **任务状态与审批**：  
  - `require_approval_for_done`：任务要变为 done 须有关联审批已通过。  
  - `require_review_before_done`：须从 review 进入 done。  
  - `block_status_changes_with_pending_approval`：存在待审批时禁止改状态。
- **仅 Lead 可改状态**：`only_lead_can_change_status` 时，仅 board lead 的 Agent 可修改任务状态。
- **活动与通知**：任务创建/更新/评论、审批通过/拒绝、看板进出组等会写活动日志（activity），并可能触发 Agent/Lead 通知（Gateway RPC 等）。

---

## 7. 与前端的数据流对应

| 前端操作 | 后端接口 |
|----------|----------|
| 看板列表、筛选、删除 | GET/DELETE `/api/v1/boards`，权限 org member + board_access |
| 看板详情首屏 | GET `/api/v1/boards/:id/snapshot` → BoardSnapshot |
| 跨看板分组信息 | GET `/api/v1/boards/:id/group-snapshot` |
| 任务实时推送 | GET `/api/v1/boards/:id/tasks/stream?since=...`（SSE） |
| 任务创建/更新/删除 | POST/PATCH/DELETE `/api/v1/boards/:id/tasks`（及 `/:taskId`） |
| 任务评论 | GET/POST `.../tasks/:taskId/comments` |
| 审批、看板聊天、活动流 | 见 approvals、board_memory、activity 等路由，与 Boards 通过 board_id 关联 |

前端逻辑详见《前端-Boards页面逻辑》文档。

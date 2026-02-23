# Task 管理周期与数据逻辑

本文档梳理 Mission Control 中 **Task（任务）** 从创建、分配、进行中、到 Review、再到完成的全流程，以及背后的数据字段与业务规则。

---

## 1. 状态与关键字段

### 1.1 任务状态（status）

| 状态 | 含义 |
|------|------|
| **inbox** | 收件箱，待处理，未开始 |
| **in_progress** | 进行中，已被领取并在执行 |
| **review** | 待审核，执行者已提交，等待 Lead/人工审核 |
| **done** | 已完成 |

状态流转的**常规路径**：`inbox` → `in_progress` → `review` → `done`。也支持回退到 `inbox`（例如打回重做）。

### 1.2 与周期相关的数据字段

| 字段 | 含义 |
|------|------|
| **assigned_agent_id** | 当前负责人（Agent）ID；进入 review 后**保留**，便于追溯谁提交的审核 |
| **in_progress_at** | 进入「进行中」的时间戳；用于统计耗时、判断「最近是否在 progress」 |
| **previous_in_progress_at** | 上一次进入 in_progress 的时间；用于 review 时校验「是否有近期评论」等 |
| **created_by_user_id** | 创建该任务的用户（可选） |

- 进入 **in_progress**：会设置 `in_progress_at = now`；若是 Agent 自己拉任务，会同时设置 `assigned_agent_id = 该 Agent`。
- 进入 **review**：保留 `assigned_agent_id`（负责人不清空），清空 `in_progress_at`，并把当前的 `in_progress_at` 存到 `previous_in_progress_at`（供评论时效校验）。
- 回到 **inbox**：清空 `assigned_agent_id`、`in_progress_at`，当前 `in_progress_at` 写入 `previous_in_progress_at`。

---

## 2. 流程概览（从新建到完成）

```
┌─────────────┐     Assign / 领取      ┌──────────────┐    提交 Review     ┌────────┐    通过审核     ┌──────┐
│  新建 Task  │ ────────────────────► │  In Progress │ ─────────────────► │ Review │ ──────────────► │ Done │
│   (inbox)   │                        │ (有人负责)   │  (可选带评论)       │(无人负责)│  (满足审批规则)  │      │
└─────────────┘                        └──────────────┘                    └────────┘                 └──────┘
       │                                       │                                  │
       │                                       │ 打回 / 重新打开                    │ 打回
       │                                       ▼                                  ▼
       └──────────────────────────────────────┴──────────────────────────────────┴──────► inbox
```

- **新建**：状态默认为 `inbox`。当前前端「New task」弹窗**没有**「指定负责人」选项，创建后任务在 Inbox；分配需在任务详情中操作或由 Agent 领取。后端 API 支持创建时传 `assigned_agent_id`（创建即分配），仅通过接口或后续前端改造可用。
- **Assign（分配）**：在 inbox 或 in_progress 阶段由管理员在任务详情中指定负责人，或由 Agent 通过「把状态改为 in_progress」来自动领取。**只要对任务做了 Assign（设置负责人），若任务当前在 Inbox 且无依赖阻塞，会自动变为「进行中」**，无需再手动拖到 In Progress。
- **In Progress**：负责人执行任务，`in_progress_at` 记录开始时间。
- **Review**：负责人把状态改为 `review`，并需满足「近期有评论或本次带评论」；进入 review 后负责人**保留**，由 Lead/管理员决定通过或打回。
- **Done**：由 Lead 或管理员把状态从 `review` 改为 `done`，且须满足看板规则（如「必须先 Review」「必须有已通过的审批」）。

---

## 3. 各阶段的数据逻辑

### 3.1 新建 Task（Create）

- **接口**：`POST /api/v1/boards/{board_id}/tasks`
- **Body**：`TaskCreate`，可包含 `title`、`description`、`status`（默认 `inbox`）、`priority`、`due_at`、`assigned_agent_id`、`depends_on_task_ids`、`tag_ids`、`custom_field_values` 等。

**前端现状**：当前看板页的「New task」弹窗只包含 Title、Description、Custom fields、Priority、Due date、Tags，**不包含「指定负责人（Assignee）」**。提交时不会传 `assigned_agent_id`，新建任务始终落在 Inbox，需在任务详情里再分配或由 Agent 领取。

**数据逻辑**（API 层）：

- 若不传 `status`，默认为 **inbox**。
- 若请求体中传 **assigned_agent_id**，后端会接受并实现「创建即分配」（当前前端未使用）。
- **依赖**：若传了 `depends_on_task_ids`，会校验这些依赖任务属于同看板且无环；若有**未完成**的依赖，且当前任务**不是 inbox** 或**已设置负责人**，则返回 **409** `task_blocked_cannot_transition`，且不会创建成功。
- 创建成功后写活动日志 `task.created`，并可选通知 Lead / 被指派的 Agent。

---

### 3.2 分配（Assign）

分配即设置 **assigned_agent_id**。有两种典型方式：

**方式一：管理员/用户或 Lead 主动分配**

- **接口**：`PATCH /api/v1/boards/{board_id}/tasks/{task_id}`，body 中传 `assigned_agent_id`。
- **权限**：需对看板有写权限（管理员或具备该看板写权限的用户），或看板 Lead Agent。
- **规则**：目标 Agent 必须存在，且若该 Agent 已绑定看板，则必须与任务所属看板一致；否则 409。
- 管理员或 Lead 可**只传** `assigned_agent_id`（不传 status）。
- **行为**：**只要对任务做了 Assign（设置负责人），且任务当前在 Inbox、无依赖阻塞，后端会自动把状态改为 `in_progress` 并设置 `in_progress_at`**，无需再手动拖到「进行中」。若任务被依赖阻塞，则不会自动进 in_progress，且可能被重置为 inbox 并清空负责人。

**方式二：Agent 领取（通过改状态到 in_progress）**

- Agent 调用同一 PATCH 接口，只传 **status: "in_progress"**（不传 assigned_agent_id）。
- **后端逻辑**（非 Lead Agent）：
  - 若任务当前**无负责人**：允许改状态，并自动设置 `assigned_agent_id = 当前 Agent`（即「领取」该任务）。
  - 若任务**已有负责人**且不是自己：不允许改状态，返回 403（只有负责人能改该任务状态）。
  - 若任务**已有负责人且是自己**（例如管理员先指定了该 Agent）：允许改状态，进入 in_progress。
- 同时会设置 **in_progress_at = now**，表示「从这一刻开始进行中」。

**Inbox 下谁能把状态改为 in_progress？**

- **未指定负责人**：任意（同看板、非 Lead 且看板未开启「仅 Lead 可改状态」）的 Agent 都可以把该任务改为 in_progress，改的人即成为负责人。
- **已指定负责人**：只有该负责人可以把该任务改为 in_progress；其他 Agent 改会 403。
- **管理员/用户**：随时可以把任何任务改为 in_progress（可同时改 assigned_agent_id）。

**Lead 的分配规则**（看板 Lead Agent）：

- Lead 可以**显式指定** `assigned_agent_id`（把任务分配给某个非 Lead 的 Agent）。
- Lead **不能**把任务分配给自己。
- 当 Lead 在 **Inbox** 阶段给任务指定负责人时，**会自动变为「进行中」**（与管理员行为一致，且无依赖阻塞时）。
- Lead **只能**在任务处于 **review** 时**手动**改 **status**，且只能改为 **done** 或 **inbox**（不能把 review 改为 in_progress）。因此「分配」在 inbox 做（并自动进 in_progress），「审核通过/打回」在 review 阶段做。

---

### 3.3 Inbox → In Progress（开始执行）

- **操作**：PATCH 传 `status: "in_progress"`（可选同时传 `assigned_agent_id`，由管理员指定谁来做）。
- **数据变化**：
  - `status = "in_progress"`
  - `in_progress_at = utcnow()`
  - 若是 Agent 自己拉任务：`assigned_agent_id = 当前 Agent`（若管理员未先指定）。

**约束**：

- **依赖**：若任务存在**未完成**的依赖（depends_on 里还有非 done），则不允许进入 in_progress（或分配负责人），返回 409。
- **only_lead_can_change_status**：若看板开启「仅 Lead 可改状态」，则非 Lead 的 Agent 不能改 status，只能由 Lead 或管理员操作。

---

### 3.4 In Progress → Review（提交审核）

- **操作**：PATCH 传 `status: "review"`；**强烈建议**同时传 **comment**，说明完成情况或备注，便于审核。
- **数据变化**：
  - `status = "review"`
  - **assigned_agent_id 保留**（不清空，便于追溯谁提交的审核）
  - **previous_in_progress_at = 当前 in_progress_at**（保留「本次进行中」的起始时间）
  - **in_progress_at = None**

**业务规则**：

- **必须有「近期评论」或「本次评论」**：进入 review 时，后端会校验「自 `previous_in_progress_at`（或本次进入 in_progress 的时间）以来，当前负责人（或原负责人）是否发过非空评论」；若**没有**且本次请求也**未带 comment**，则返回 422，要求补评论。目的是让 Review 时有上下文。
- 通常由**当前负责人**（Agent 或用户）执行「提交 Review」；提交后负责人保留，由 Lead/管理员决定通过或打回。

---

### 3.5 Review → Done（完成）

- **操作**：PATCH 传 `status: "done"`。
- **权限**：通常由**看板 Lead**（Agent）或**管理员/用户**执行。Lead 只有在任务**已经是 review** 时才能改状态，且只能改为 **done** 或 **inbox**。

**数据逻辑**：

- `status = "done"`。
- 不再修改 `assigned_agent_id` / `in_progress_at`（review 时仅清空 in_progress_at，负责人保留）。

**看板级规则（门控）**：

1. **require_review_before_done**（必须先经过 Review）  
   - 若看板开启此项，则**只有当前状态为 review** 时才能改为 done；若从 in_progress 或 inbox 直接改 done，返回 409。

2. **require_approval_for_done**（必须有已通过的审批）  
   - 若看板开启此项，则任务必须**至少有一个关联的 Approval 且状态为 approved**（可以是该任务为主任务，或通过 ApprovalTaskLink 关联）。不满足则返回 409。

3. **block_status_changes_with_pending_approval**（有待审批时禁止改状态）  
   - 若看板开启此项，且任务存在**未决（pending）**的关联审批，则**任何**状态变更（包括改为 done）都会被拒绝，返回 409。

满足上述门控后，Review → Done 的更新才会成功。

---

### 3.6 打回 / 重新打开（→ Inbox）

- **操作**：PATCH 传 `status: "inbox"`。
- **数据变化**：
  - `status = "inbox"`
  - **assigned_agent_id = None**
  - **previous_in_progress_at = 当前 in_progress_at**（若有）
  - **in_progress_at = None**

可从 **review** 或 **in_progress** 打回 inbox，由 Lead 或管理员操作；Lead 只能在任务为 review 时改为 inbox。

---

## 4. 谁可以做什么（简要）

| 角色 | 创建任务 | 分配（assigned_agent_id） | 改状态（inbox ↔ in_progress ↔ review ↔ done） |
|------|----------|---------------------------|--------------------------------------------------|
| **管理员/用户** | ✅ | ✅ 任意阶段 | ✅ 任意合法流转，受看板规则约束 |
| **Lead Agent** | ❌ | ✅ 不能分配给自己；可指定其他 Agent | ✅ **仅当任务为 review 时**可改为 done 或 inbox |
| **非 Lead Agent** | ❌ | ❌ 不能显式指定他人；通过改 status 到 in_progress 可「领取」 | ✅ 仅能改**自己负责的任务**的 status；若 `only_lead_can_change_status` 则不能改 |

---

## 5. 依赖与阻塞

- 任务可设置 **depends_on_task_ids**（仅限同看板任务，且不能成环）。
- **未完成**的依赖：指 depends_on 中至少有一个任务的 status ≠ done。
- 当存在未完成依赖时：
  - **创建**：若同时设了 status ≠ inbox 或 assigned_agent_id，则 409，创建失败。
  - **更新**：若本次请求要改 status 或 assigned_agent_id，则 409；管理员若强行改依赖/状态，后端可能把该任务重置为 inbox 并清空负责人（见 `_apply_admin_task_rules` 中 blocked 处理）。
- 已 **done** 的任务不再参与阻塞计算；done 之后也不允许再改 depends_on_task_ids（409）。

---

## 6. 与前端/接口的对应

- **新建**：前端表单提交 `POST .../tasks`，传 `TaskCreate`（可含 status、assigned_agent_id）。
- **分配**：前端在任务详情或列表中「指派」→ PATCH 传 `assigned_agent_id`；或 Agent 在看板上把卡片拖到「In Progress」→ PATCH 传 `status: "in_progress"`（后端自动设 assigned_agent_id）。
- **进行中**：拖拽到「In Progress」或编辑保存时传 `status: "in_progress"`；后端写 `in_progress_at`。
- **提交 Review**：拖到「Review」或编辑选 Review，并**填写评论**后保存 → PATCH `status: "review"` + `comment: "..."`；后端保留负责人，清空 in_progress_at。
- **完成**：Lead/管理员把 Review 列卡片拖到「Done」或编辑选 Done → PATCH `status: "done"`；后端校验 review-before-done、approval-for-done、pending-approval-block 后通过。
- **打回**：把状态改回 inbox → PATCH `status: "inbox"`。

活动与通知（如 `task.created`、`task.status_changed`、通知 Lead/负责人）由后端在对应接口内统一写入与发送，前端可通过 Activity / Live Feed 或 SSE 任务流接收。

---

以上即为 Task 从新建、分配、进行中、Review 到完成（及打回）的完整周期与数据逻辑；看板规则与权限的细节见《后端-Boards数据接口与交互》文档。

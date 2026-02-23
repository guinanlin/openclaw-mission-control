# 「复制 Agent」功能评估

本文档评估在 Agents 列表页（创建 / 编辑 / 删除之外）增加 **「复制 Agent」** 的可行性与实现思路。

---

## 1. 现状简述

- **列表页**（`/agents`）：支持 **创建**（New agent → `/agents/new`）、**编辑**（行操作 Edit → `/agents/{id}/edit`）、**删除**（行操作 Delete → 确认后调用 `DELETE /api/v1/agents/{id}`）。
- **创建**：`POST /api/v1/agents`，请求体为 `AgentCreate`（name、board_id、heartbeat_config、identity_profile、identity_template、soul_template 等）。
- **后端**：创建时由服务端根据 `board_id` 解析 gateway、分配 gateway_id、保证名称唯一等；不要求前端传 gateway。

---

## 2. 结论：可以支持「复制 Agent」

- **无需新增后端接口**：复制 = 用「源 Agent」的可复制字段拼出 `AgentCreate`，调用现有的 `POST /api/v1/agents` 即可。
- **数据现成**：列表接口返回的正是 `AgentRead`，已包含复制所需的字段（见下）。
- **实现量可控**：前端在列表页增加「复制」入口（如行操作 Copy），根据当前行 `AgentRead` 构造 `AgentCreate` 并提交，成功后跳转到新 Agent 详情或编辑页即可。

---

## 3. 字段映射（AgentRead → AgentCreate）

复制时**只应带「可配置」字段**，不能带「运行时/服务端分配」字段：

| 用途           | 处理方式 |
|----------------|----------|
| **name**       | 必填。建议新名字如 `Copy of {原 name}`，避免与现有 agent 重名（后端会做唯一性校验）。 |
| **board_id**   | 建议沿用源 Agent 的 `board_id`（同看板下复制），若为空则需选一个 board（与新建逻辑一致）。 |
| **heartbeat_config** | 若有则按原样传入；若无则用默认（如 `{ every: "10m", target: "last", includeReasoning: false }`），与新建页一致。 |
| **identity_profile** | 原样传入（对象或 null）。 |
| **identity_template** / **soul_template** | 原样传入（字符串或 null）。 |
| **不复制**     | `id`、`gateway_id`、`status`、`is_board_lead`、`is_gateway_main`、`openclaw_session_id`、`last_seen_at`、`created_at`、`updated_at` 等均由后端或运行时决定，创建时不应传。 |

列表接口返回的 `AgentRead` 已包含上述可复制字段（与 `GET /api/v1/agents/{id}` 同结构），因此**不需要**为复制单独再请求一次详情接口，用列表行数据即可。

---

## 3.1 复制后，OpenClaw 里的工作目录和模板会不会一起「复制」过去？

会。只要在复制时把 **identity_profile、identity_template、soul_template、heartbeat_config** 从源 Agent 带进新的 `AgentCreate`，Mission Control 走的是和「新建 Agent」同一条创建链路，第二步同样会**到 OpenClaw 里把新 Agent 建起来并同步配置**，具体包括：

1. **工作目录**  
   新 Agent 在 OpenClaw 侧会得到**自己的**运行时环境和工作目录（例如 `workspace-{新 agent 名字的 slug}`）。不是把源 Agent 的目录整份拷贝，而是「新建一个目录」，这是正常行为——每个 Agent 一个 workspace。

2. **身份、指令等模板**  
   下发到 OpenClaw 时，provision 逻辑会从**当前这条 Agent 记录**里读：
   - `identity_template` → 写成 **IDENTITY.md**
   - `soul_template` → 写成 **SOUL.md**
   - `identity_profile` → 参与模板渲染的上下文（角色、沟通风格等）
   - `heartbeat_config` → 心跳相关配置  

   复制时如果把这些字段都从源 Agent 带进新 Agent 的创建 payload，那新 Agent 在 DB 里就会带着和源 Agent **相同内容**的 identity/soul/profile/heartbeat。provision 时用的是「新 Agent 的」这些字段往 OpenClaw 同步，所以新 Agent 在 OpenClaw 里的 **IDENTITY.md、SOUL.md 和身份相关配置**会和源 Agent 一致，相当于把「身份指令等模板」也复制过去了。

**结论**：通过复制功能创建的新 Agent，在 OpenClaw 里会拥有**新的工作目录**，但目录里会被写入**与源 Agent 相同**的身份与指令模板（以及心跳等配置）。实现复制时只要确保 `agentReadToCreatePayload` 里包含 `identity_profile`、`identity_template`、`soul_template`、`heartbeat_config` 即可。

---

## 4. 实现思路（前端）

### 4.1 入口与交互

- 在 **Agents 列表页** 的表格行操作中，在「Edit」「Delete」旁增加 **「Copy」**（或「复制」）。
- 点击后：
  - **方案 A（推荐）**：直接用当前行 `AgentRead` 构造 `AgentCreate`（name 改为 `Copy of {name}`），调用 `useCreateAgentApiV1AgentsPost`，成功后 `router.push(\`/agents/${result.data.id}\`)`（或先跳编辑再跳详情，视产品偏好）。
  - **方案 B**：跳转到 `/agents/new?copyFrom={id}`，新建页根据 query 请求 `GET /api/v1/agents/{id}` 并预填表单，用户改名字后点「Create agent」。  
  方案 A 一步到位，无需改新建页；方案 B 适合希望用户「必须再确认/修改」再创建的流程。

### 4.2 需要改动的文件（按方案 A）

| 文件 | 改动 |
|------|------|
| **列表页** `frontend/src/app/agents/page.tsx` | 1）用 `useCreateAgentApiV1AgentsPost` 封装一个「复制」mutation；2）从 `AgentRead` 写一个 `agentReadToCreatePayload(source, newName)` 只提取并规范化上述可复制字段；3）把 `onCopy(agent)` 传给表格（见下）。 |
| **表格** `frontend/src/components/agents/AgentsTable.tsx` | 支持 `onCopy?: (agent: AgentRead) => void`，在 `rowActions` 里增加一条 Copy 操作（如 `actions` 里加一项 `{ key: "copy", label: "Copy", onClick: onCopy }`）。 |
| **DataTable** `frontend/src/components/tables/DataTable.tsx` | 若当前 `rowActions` 已支持通过 `actions` 数组扩展，则只需在 AgentsTable 传入 `onCopy` 并拼进 `actions`；若目前只有 `getEditHref` 和 `onDelete`，需在 DataTable 中支持更多自定义 `actions`（当前代码已支持 `rowActions.actions` 数组）。 |

### 4.3 复制时的边界情况

- **board_id 为空**（如 Gateway main）：复制时若仍为空，需看后端是否允许「无 board」创建；若不允许，可在前端限制「仅当 source 有 board_id 时允许复制」，或复制时强制用户选一个 board（例如用方案 B 跳到 new 页预填并必选 board）。
- **重名**：后端已有 `ensure_unique_agent_name`，用 `Copy of {name}` 一般可避免冲突；若仍冲突，可再追加后缀或提示用户去编辑页改名字。
- **看板 max_agents**：后端创建时会做 `enforce_board_spawn_limit_for_lead`，若该 board 已达上限会返回错误，前端按现有错误展示即可（toast 或内联错误）。

---

## 5. 小结

| 项目         | 说明 |
|--------------|------|
| **能否做**   | 能；不依赖新后端接口，用现有 `POST /api/v1/agents` 即可。 |
| **数据来源** | 列表页当前行的 `AgentRead` 足够，无需额外请求详情。 |
| **实现量**   | 小：列表页 + AgentsTable（+ 必要时 DataTable）增加复制逻辑与一个 Copy 行操作。 |
| **推荐**     | 行操作增加「Copy」→ 用 `AgentRead` 构造 `AgentCreate`（name 改为 "Copy of …"）→ 调创建接口 → 成功后跳新 Agent 详情或编辑页。 |

若你希望，我可以按方案 A 写出具体的前端改动示例（含 `agentReadToCreatePayload` 与 `onCopy` 的代码片段）。

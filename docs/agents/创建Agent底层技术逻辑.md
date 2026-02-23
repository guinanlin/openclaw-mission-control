# 创建 Agent 的底层技术逻辑

本文档从前端到后端梳理「创建 Agent」的完整技术链路：谁可以创建、请求如何发出、服务端如何校验与落库、以及如何与 Gateway 协同完成「配置与唤醒」。

---

## 业务视角：创建 Agent 在做什么？（通俗概括）

- **Mission Control（本系统）** 是「指挥中心」：负责管看板、管 Agent 档案、管谁能在哪个看板下干活。  
- **OpenClaw（通过 Gateway 连接）** 是「真正干活的地方」：Agent 的运行时、工作目录、心跳、会话都在那边。

所以「创建 Agent」本质是两件事连在一起做：

1. **在 Mission Control 里建档案**  
   管理员在页面上填名字、选看板、设一下心跳间隔和身份标签。系统先校验（比如必须选看板、名字不能和同看板/同网关下的已有 Agent 重复），然后在**数据库**里落一条 Agent 记录，并给这个 Agent 发一张「通行证」（token），后面和 OpenClaw 通信要用。

2. **到 OpenClaw 里把 Agent 真正建起来并叫醒**  
   系统根据这个 Agent 所属的看板找到对应的 **Gateway**（通往 OpenClaw 的桥），然后通过 Gateway 去 OpenClaw 里：  
   - 创建这个 Agent 的运行时环境（工作目录、配置等）；  
   - 把身份、指令等模板同步过去；  
   - 发一条「你已经被配置好了」的唤醒消息，让 Agent 上线、可以开始心跳和接活。

做完这两步，页面上就会显示「创建成功」，并跳转到这个新 Agent 的详情页；在 OpenClaw 那边，这个 Agent 也已经存在并且处于可工作状态。

**一句话**：在 Mission Control 里点「创建 Agent」，就是先在系统里登记一个 Agent、再通过 Gateway 到 OpenClaw 里把它真正建好并唤醒。

---

## 1. 入口与调用方

- **前端入口**：`/agents/new` 页面（`frontend/src/app/agents/new/page.tsx`）。
- **触发方式**：用户填写表单后点击「Create agent」，提交时调用 `POST /api/v1/agents`，请求体为 `AgentCreate`。
- **调用身份**：接口依赖 `require_admin_or_agent`，即**组织管理员用户**或**已认证的 Agent** 均可调用；前端新建页通常由管理员使用。

---

## 2. 前端：请求体与校验

### 2.1 表单字段与提交 payload

新建页收集并提交的字段与 `AgentCreate` 的对应关系如下：

| 表单/状态 | 对应 AgentCreate 字段 | 说明 |
|-----------|------------------------|------|
| `name` | `name` | 必填，trim 后提交 |
| `displayBoardId`（选中的看板） | `board_id` | 必填，无看板时前端报错 "Select a board before creating an agent." |
| `heartbeatEvery` | `heartbeat_config.every` | 默认 "10m"，与 `target: "last"`、`includeReasoning: false` 一起组成 `heartbeat_config` |
| `identityProfile`（role / communication_style / emoji） | `identity_profile` | 经 `normalizeIdentityProfile` 后提交，可为 null |

新建页**未**在表单中提交 `identity_template`、`soul_template`、`status`；后端会对未传字段使用 schema 默认或保持为空。

### 2.2 前端校验

- `name.trim()` 为空 → 提示 "Agent name is required."
- 未选择 board（且无默认 board）→ 提示 "Select a board before creating an agent."
- 通过后调用 `createAgentMutation.mutate({ data: { name, board_id, heartbeat_config, identity_profile } })`。

### 2.3 请求与成功后的行为

- **请求**：`POST /api/v1/agents`，body 为上述 `AgentCreate` JSON。
- **成功**：`onSuccess` 中若 `result.status === 200`，则 `router.push(\`/agents/${result.data.id}\`)`，跳转到新 Agent 详情页。

---

## 3. 后端 API 层

- **路由**：`backend/app/api/agents.py`，`@router.post("", response_model=AgentRead)`。
- **依赖**：
  - `session: AsyncSession`（DB 会话）
  - `actor: ActorContext = ACTOR_DEP`（`require_admin_or_agent`：当前请求要么是组织管理员用户，要么是已认证的 Agent）。
- **处理**：构造 `AgentLifecycleService(session)`，调用 `service.create_agent(payload=payload, actor=actor)`，将返回的 `AgentRead` 作为响应体。

---

## 4. 服务层：create_agent 主流程

`AgentLifecycleService.create_agent`（`backend/app/services/openclaw/provisioning_db.py`）按固定顺序执行以下步骤。

### 4.1 步骤一：coerce_agent_create_payload（按身份修正 payload）

- **目的**：按调用方身份对 `board_id` 做策略性修正。
- **逻辑**：
  - **actor_type == "user"**：要求当前用户是**组织管理员**（`require_org_admin`），payload 不改动，直接返回。
  - **actor_type == "agent"**：说明是「看板 Lead Agent」在代创建，`board_id` 由策略解析为「该 Lead 所属看板」或请求中指定的 board（`resolve_board_lead_create_board_id`），用解析结果覆盖 payload 的 `board_id` 后返回。
- **结果**：得到「已按身份修正」的 `AgentCreate`，保证后续使用的 `board_id` 符合权限与策略。

### 4.2 步骤二：require_board（解析看板并做写权限校验）

- **入参**：`payload.board_id`；若当前 actor 是 user，还会传入 `user` 和 `write=True`。
- **逻辑**：
  - `board_id` 为空 → 422，detail "board_id is required"。
  - 按 id 查 Board，不存在 → 404 "Board not found"。
  - 若提供了 `user`，则 `require_board_access(session, user, board, write=True)`，无写权限则抛异常。
- **结果**：得到已校验的 `Board` 实例，后续所有「看板」相关逻辑都基于它。

### 4.3 步骤三：enforce_board_spawn_limit_for_lead（看板 worker 数量上限）

- **目的**：仅当「看板 Lead Agent」在代创建时，限制该看板下非 Lead 的 Agent 数量不超过 `board.max_agents`。
- **逻辑**：
  - 若 actor 不是 agent，或是 agent 但不是 board lead → 直接通过。
  - 否则统计该看板下 `is_board_lead == False` 的 Agent 数量；若已达 `board.max_agents`，则 409，detail 说明已达上限。
- **结果**：不超限则继续；超限则请求在此处失败。

### 4.4 步骤四：require_gateway（解析看板所属 Gateway）

- **入参**：上一步得到的 `board`。
- **逻辑**：调用 `require_gateway_for_board(session, board, require_workspace_root=True)`：
  - 若 `board.gateway_id` 为空 → 422 "Board gateway_id is required"。
  - 按 `gateway_id` 查出 Gateway；若不存在或未配置必要信息 → 422。
  - `require_workspace_root=True` 时，会要求 Gateway 配置了 `workspace_root`（用于后续在 Gateway 上创建 agent 工作目录等）。
- **结果**：得到该看板对应的 `Gateway`（及可选的 client config），用于后续落库与下发到 Gateway。

### 4.5 步骤五：写入 gateway_id 与 ensure_unique_agent_name（名称唯一）

- **写入**：`data = payload.model_dump()`，然后 `data["gateway_id"] = gateway.id`。创建请求里不传 `gateway_id`，完全由服务端根据看板解析出的 Gateway 写入。
- **名称唯一**：`ensure_unique_agent_name(board, gateway, requested_name)`：
  - 同一 **board** 下已存在同名（大小写不敏感）Agent → 409 "An agent with this name already exists on this board."
  - 同一 **gateway** 下（通过 board–gateway 关联查）已存在同名 Agent → 409 "An agent with this name already exists in this gateway workspace."
- **结果**：保证新 Agent 的 `gateway_id` 正确，且名称在 board 与 gateway 维度都不重复。

### 4.6 步骤六：persist_new_agent（落库并生成 token）

- **入参**：上述带 `gateway_id` 的 `data`（dict）。
- **逻辑**：
  1. **构造实体**：`Agent.model_validate(data)` 得到 `Agent` 实例（id 由默认 `uuid4` 生成，未传字段用模型默认，如 `status="provisioning"`）。
  2. **生成认证 token**：`raw_token = mint_agent_token(agent)`：
     - 调用 `generate_agent_token()` 生成原始 token；
     - `agent.agent_token_hash = hash_agent_token(raw_token)` 只存哈希，原始 token 仅在此刻返回，用于后续与 Gateway 通信。
  3. **标记待配置**：`mark_provision_requested(agent, action="provision", status="provisioning")`：
     - 若 `heartbeat_config` 为空则写入默认配置；
     - 设置 `provision_requested_at = now`、`provision_action = "provision"`、`status = "provisioning"`、`updated_at = now`。
  4. **会话 key**：`agent.openclaw_session_id = self.resolve_session_key(agent)`：
     - 新建的普通（非 main）Agent 非 board lead，使用 `board_agent_session_key(agent.id)`（基于 agent id 的会话 key）；
     - board lead 使用 `board_lead_session_key(agent.board_id)`；
     - gateway main 的 session key 在别处设定，此处不适用。
  5. **落库**：`await self.add_commit_refresh(agent)`，插入并提交，再 refresh 得到带数据库默认值的完整 `Agent`。
- **返回**：`(agent, raw_token)`，供下一步「下发到 Gateway」使用。

### 4.7 步骤七：provision_new_agent（下发到 Gateway 并唤醒）

- **目的**：在 Gateway 侧创建/更新该 Agent 的运行时环境（工作目录、模板文件等），并发送唤醒消息，使 Agent 进入可工作状态。
- **入参**：上一步的 `agent`、`board`、`gateway`、`raw_token`，以及 `user`（当前用户，若为 Agent 调用则为 None）、`force_bootstrap=False`。
- **逻辑**：内部调用 `_apply_gateway_provisioning`，其中：
  - **target**：`AgentUpdateProvisionTarget(is_main_agent=False, board=board, gateway=gateway)`，表示这是「看板下普通 Agent」的配置。
  - **OpenClawGatewayProvisioner().apply_agent_lifecycle(...)**：
    - **1) create agent (idempotent)**：在 Gateway 侧创建 agent 资源（若已存在则幂等）。
    - **2) set/update all template files**：根据 identity/soul 等模板与用户上下文，同步模板文件到 Gateway 工作目录。
    - **3) wake the agent session**：`ensure_session` 后通过 `send_message` 发送唤醒文案（如 "… has been provisioned."），使会话就绪。
  - 成功后调用 `mark_provision_complete(agent, status="online", clear_confirm_token=True)`，将 DB 中该 Agent 的 `status` 置为 `"online"`，并清理 provision 相关临时字段；并写 activity（如 "Provisioned directly for {name}."、"Wakeup message sent to {name}."）。
- **异常**：若 Gateway 调用失败（如 `OpenClawGatewayError`），会记录失败 activity、commit，然后根据配置抛出 502 等，将「Gateway 配置失败」反馈给前端。

### 4.8 步骤八：返回 AgentRead

- **最后**：`return self.to_agent_read(self.with_computed_status(agent))`。
- **with_computed_status**：可能根据 `last_seen_at`、provision 状态等计算展示用 status。
- **to_agent_read**：将 ORM 的 `Agent` 转为 API 的 `AgentRead`（含 `is_gateway_main` 等派生字段），作为 `POST /api/v1/agents` 的响应体返回给前端。

---

## 5. 数据流小结

```
前端 /agents/new
  → 校验 name、board_id，组 AgentCreate（name, board_id, heartbeat_config, identity_profile）
  → POST /api/v1/agents

API 层 (agents.py)
  → require_admin_or_agent 得到 ActorContext
  → AgentLifecycleService(session).create_agent(payload, actor)

AgentLifecycleService.create_agent
  1) coerce_agent_create_payload(payload, actor)     // 按 user/agent 身份修正 board_id
  2) require_board(payload.board_id)                // 查 Board、写权限
  3) enforce_board_spawn_limit_for_lead(board)      // Lead 代创建时的 max_agents 限制
  4) require_gateway(board)                         // 解析 Gateway（需 workspace_root）
  5) data["gateway_id"] = gateway.id
     ensure_unique_agent_name(...)                 // 同 board / 同 gateway 名称唯一
  6) persist_new_agent(data)                       // 落库、mint token、session key、status=provisioning
  7) provision_new_agent(agent, board, gateway, raw_token, user)
     → Gateway 侧：创建 agent、同步模板、发送唤醒
     → mark_provision_complete(agent, status="online")
  8) return to_agent_read(agent)
```

---

## 6. 关键文件索引

| 层级 | 文件 | 说明 |
|------|------|------|
| 前端页面 | `frontend/src/app/agents/new/page.tsx` | 新建表单、校验、POST 与跳转 |
| 前端 API | `frontend/src/api/generated/agents/agents.ts` | `useCreateAgentApiV1AgentsPost`、AgentCreate 类型 |
| 后端路由 | `backend/app/api/agents.py` | `POST ""`、依赖、调 service |
| 后端依赖 | `backend/app/api/deps.py` | `ActorContext`、`require_admin_or_agent` |
| 服务入口 | `backend/app/services/openclaw/provisioning_db.py` | `create_agent`、coerce/require/enforce/ensure/persist/provision |
| 网关解析 | `backend/app/services/openclaw/gateway_resolver.py` | `require_gateway_for_board` |
| Token/状态 | `backend/app/services/openclaw/db_agent_state.py` | `mint_agent_token`、`mark_provision_requested`、`mark_provision_complete` |
| Gateway 配置 | `backend/app/services/openclaw/provisioning.py` | `OpenClawGatewayProvisioner.apply_agent_lifecycle`（创建 + 模板 + 唤醒） |
| 模型 | `backend/app/models/agents.py` | `Agent` 表结构 |

---

以上即为「创建 Agent」从前端到 DB 再到 Gateway 的完整底层技术逻辑；复制 Agent 时只需在调用链前端构造与上述一致的 `AgentCreate`（并做名称区分），后续链路与本节相同。

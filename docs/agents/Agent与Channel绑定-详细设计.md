# Agent 与 Channel 绑定 — 详细设计

本文档描述「在 Mission Control Agents 页为 Agent 配置 Channel（如飞书）并写回 OpenClaw」的功能设计，重点包括 **Agent 与多 Channel 的数据关系**、与 OpenClaw 配置的映射、以及实现步骤。**不涉及直接改代码，仅出设计与步骤。**

---

## 1. 目标与背景

### 1.1 业务目标

- 在 **Agents 页面**（或 Agent 详情/编辑）中，为某个 Agent 配置其使用的 **Channel**（渠道），例如飞书。
- 用户可填写该 Channel 所需凭证（如飞书的 App ID、App Secret、Bot 名称），保存后由系统将配置 **写回** 到对应 OpenClaw 实例的 `openclaw.json` 中，使该 Agent 在 OpenClaw 侧通过该 Channel 对外提供服务。

### 1.2 约束与前提

- 写回通过 OpenClaw Gateway 的 **config.get** + **config.patch** 完成（已存在且被 Mission Control 使用）。
- OpenClaw 侧与 Channel 相关的配置集中在两处：
  - **`channels.<channel_type>.accounts`**：按 `accountId` 存该 Channel 的账号凭证（如飞书的 appId、appSecret、botName）。
  - **`bindings`**：数组，每项为 `{ "agentId": "<openclaw agent id>", "match": { "channel": "<channel_type>", "accountId": "<accountId>" } }`，表示「哪个 OpenClaw Agent 使用哪个 Channel 账号」。

---

## 2. 数据关系：Agent 与 Channel 的一对多

### 2.1 关系抽象

- **一个 Agent（MC 侧）** 在逻辑上可以绑定 **多个 Channel**：例如同时配置飞书、Slack 等；当前优先实现飞书，但数据模型应支持「一个 Agent 对应多条 Channel 配置」。
- **每条 Channel 配置** 对应：
  - 一个 **Channel 类型**（如 `feishu`、未来 `slack` 等），
  - 该类型下的一组 **凭证/配置**（飞书即 App ID、App Secret、Bot 名称等），
  - 以及写入 OpenClaw 时使用的 **accountId**（在 OpenClaw 的 `channels.<type>.accounts` 与 `bindings` 中作为 key 使用）。

因此：

- **Agent : Channel 配置 = 1 : N**（一个 Agent 可有多条 Channel 配置，每条对应一种 Channel 类型或同一类型下不同账号，取决于产品约定）。

### 2.2 与 OpenClaw 的对应关系

| Mission Control 侧 | OpenClaw 侧 |
|--------------------|-------------|
| Agent（一条记录） | `agents.list` 中一个条目，其 `id` 即 openclaw agent id（如 `lead-<board_id>`、`mc-<agent_id>`） |
| Agent 的「某条 Channel 配置」 | ① `channels.<channel_type>.accounts[accountId]` 中一组凭证<br>② `bindings` 中一条 `{ agentId, match: { channel, accountId } }` |
| 写回行为 | 对该 Agent 所属 Gateway 调用 config.get，合并更新 `channels` 与 `bindings`，再 config.patch |

同一 Agent 若配置了飞书和（未来）Slack，则 OpenClaw 中会有两条 binding，共用同一个 `agentId`，`match.channel` 分别为 `feishu` 与 `slack`。

---

## 3. 数据模型设计：Agent 与 Channel 的中间层

### 3.1 新增实体：Agent Channel 配置（建议表名：`agent_channel_configs`）

在保持现有 **agents** 表不变的前提下，增加一层「Agent ↔ Channel」关系表，用于持久化「每个 Agent 在哪些 Channel 上、用什么账号」。

建议字段（可按项目规范微调命名与类型）：

| 字段 | 类型 | 说明 |
|------|------|------|
| **id** | UUID, PK | 主键 |
| **agent_id** | UUID, FK → agents.id | 所属 MC Agent |
| **gateway_id** | UUID, FK → gateways.id | 该配置生效的 Gateway（与 Agent 的 gateway_id 一致；显式存一份便于查询与校验） |
| **channel_type** | 字符串，如 `feishu` | Channel 类型，与 OpenClaw `match.channel` 一致 |
| **account_id** | 字符串 | 在 OpenClaw 中使用的账号 key（`channels.<type>.accounts[account_id]`、`bindings[].match.accountId`），需在**同一 gateway + channel_type 下**唯一（或全局唯一，视 OpenClaw 约束而定） |
| **config** | JSONB / JSON | 该 Channel 类型的凭证与可选配置。飞书示例：`{ "appId": "...", "appSecret": "...", "botName": "..." }`；未来其他 Channel 可扩展字段 |
| **created_at** / **updated_at** | datetime | 审计与排序 |

**唯一约束建议**：

- 方案 A：`(agent_id, channel_type)` 唯一 —— 每个 Agent 每种 Channel 只能有一条配置（一个飞书账号、一个 Slack 账号等）。
- 方案 B：`(agent_id, channel_type, account_id)` 唯一 —— 允许同一 Agent 同类型多账号（如两个飞书 bot）。当前可先采用 **方案 A**，后续若有「多飞书账号」需求再引入 account_id 到唯一约束或增加「显示名称」等字段。

**敏感信息**：`config` 中的 `appSecret` 等应视为敏感数据，存储时需加密或在后续迭代中接入统一密钥/保险库；设计阶段先明确「此处存明文或加密后的凭证」，并在接口与前端做脱敏展示。

### 3.2 与现有模型的关系

```
agents (现有)
  id, board_id, gateway_id, name, ...
  1
  │
  └── agent_channel_configs (新增)  [1 : N]
        agent_id (FK), gateway_id (FK), channel_type, account_id, config, ...
        - 一条：channel_type=feishu, account_id=bob, config={ appId, appSecret, botName }
        - 未来：channel_type=slack, ...
```

- **Agent** 不变；通过 `agent_channel_configs.agent_id` 查询该 Agent 的所有 Channel 配置。
- **Gateway**：Agent 已有所属 `gateway_id`；写回 OpenClaw 时以该 Gateway 的 config 为目标。在 `agent_channel_configs` 中冗余 `gateway_id` 便于按 Gateway 做批量同步与校验（例如「某 Gateway 下所有 Channel 配置」）。

### 3.3 account_id 的生成与唯一性

- **来源**：可由前端传入（用户输入「飞书账号标识」），或后端根据 Agent 名称/ID 生成唯一 slug（如 `slugify(agent.name)` 或 `lead-<board_id>`），保证同一 Gateway 下 `channels.feishu.accounts` 的 key 不冲突。
- **唯一性**：若采用「同一 Gateway 下 account_id 唯一」，则新建/更新时需校验该 `gateway_id` + `channel_type` + `account_id` 在表中唯一（或与 OpenClaw 当前 config 一致）。

---

## 4. 与 OpenClaw 的读写映射

### 4.1 读（OpenClaw → MC 展示，可选）

- 若希望「从 OpenClaw 拉取已有 binding 与 accounts 并在 MC 展示」：
  - 对该 Agent 的 Gateway 调用 **config.get**，从返回的 `channels.feishu.accounts` 与 `bindings` 中，筛出 `agentId === openclaw_agent_id(agent)` 的条目，得到该 Agent 在 OpenClaw 侧已配置的 Channel 列表及 accountId。
  - 可与本地 `agent_channel_configs` 做对比或回填（例如首次同步时写入 `agent_channel_configs`）。

### 4.2 写（MC 保存 → OpenClaw）

1. **解析 OpenClaw agent id**：由 MC Agent 的 `id`、`board_id`、`is_board_lead` 等根据现有规则推导（如 `agent_key(agent)` → `lead-<board_id>` 或 `mc-<agent_id>`）。
2. **config.get**：用该 Agent 的 `gateway_id` 取对应 Gateway 的 config，得到当前 `channels`、`bindings` 及 `hash`。
3. **合并**：
   - 在内存中更新 `channels[channel_type].accounts[account_id]` 为本次要写入的凭证（如 `appId`、`appSecret`、`botName`）；若 `channels[channel_type]` 不存在则先初始化。
   - 在 `bindings` 中新增或更新一条：`{ "agentId": openclaw_agent_id, "match": { "channel": channel_type, "accountId": account_id } }`（若已存在同 agentId + channel 的 binding 则更新 accountId）。
4. **config.patch**：将合并后的 `channels` 与 `bindings` 作为 patch 的 `raw`（JSON 字符串），并带上 `baseHash` 做乐观锁。

注意：patch 的**合并语义**需与 OpenClaw 实现一致（通常是顶层 key 的合并或深合并）；若 OpenClaw 只做顶层覆盖，则需提交完整的 `channels` 与 `bindings`，避免覆盖其他 Channel 或其他 Agent 的 binding。

---

## 5. API 与前端交互设计（概要）

### 5.1 后端 API 建议

| 能力 | 方法与路径 | 说明 |
|------|------------|------|
| 列出某 Agent 的 Channel 配置 | `GET /api/v1/agents/{agent_id}/channel-configs` | 返回该 Agent 的 `agent_channel_configs` 列表；可对 `config` 中敏感字段脱敏 |
| 创建/更新某条 Channel 配置 | `PUT /api/v1/agents/{agent_id}/channel-configs/{channel_type}` 或 `POST` + 幂等 | Body：`account_id`（可选，可由后端生成）、`config`（如 appId、appSecret、botName）。内部：落库 + 调用写回 OpenClaw 逻辑 |
| 删除某条 Channel 配置 | `DELETE /api/v1/agents/{agent_id}/channel-configs/{channel_type}` | 删库表记录，并从 OpenClaw 的 `channels.<type>.accounts` 与 `bindings` 中移除对应项（需 config.get → 合并删除 → config.patch） |

以上为示意；具体 REST 风格（如用 `channel_config_id` 而非 `channel_type`）可按项目习惯调整。

### 5.2 前端交互（Agents 页或详情）

- 在 **Agents 列表页**：每行可提供「配置 Channel」入口（如按钮或链接），进入该 Agent 的 Channel 配置视图或弹窗。
- **Channel 配置视图**：
  - 列出当前已配置的 Channel（来自 `GET .../channel-configs`），如「飞书：account_id = bob」。
  - 支持「添加飞书」：表单输入 App ID、App Secret、Bot 名称（及可选 account_id）；提交后调用创建/更新 API，后端写库并写回 OpenClaw。
  - 支持编辑/删除已有 Channel 配置；删除时后端同步从 OpenClaw 移除对应 account 与 binding。

前端仅需关心「Agent + Channel 类型 + 凭证」，无需直接操作 OpenClaw 的 JSON 结构。

---

## 6. 实现步骤（分阶段）

### 阶段 1：数据层与模型

1. 新增表 **agent_channel_configs**（及迁移），字段见 3.1。
2. 在 MC 中实现 Agent 的 **openclaw agent id** 解析（复用现有 `agent_key` 等），确保与 OpenClaw 侧一致。
3. （可选）实现「从 OpenClaw config.get 拉取 bindings + accounts 并回填/展示」的逻辑，用于同步或校验。

### 阶段 2：写回 OpenClaw

1. 实现「给定 Agent + 其一条 Channel 配置，生成对 `channels` 与 `bindings` 的 patch」。
2. 在 Gateway 服务层封装：config.get → 合并 patch → config.patch，并处理冲突（如 baseHash 变更时重试或报错）。
3. 在创建/更新/删除 Channel 配置的 API 中调用上述写回逻辑，保证 MC 与 OpenClaw 双写一致。

### 阶段 3：API 与鉴权

1. 实现 `GET/PUT(or POST)/DELETE .../agents/{id}/channel-configs`（及必要子路径），鉴权需校验 Agent 属于当前组织且操作者有权限。
2. 对 `config` 中敏感字段做脱敏（如 appSecret 仅写入、不返回明文或返回占位符）。

### 阶段 4：前端

1. 在 Agents 页（或 Agent 详情）增加「Channel 配置」入口。
2. Channel 配置列表 + 飞书表单（App ID、App Secret、Bot 名称）；提交调用后端 API，成功后刷新列表或提示「已写回 OpenClaw」。
3. 编辑/删除已有配置并同步到 OpenClaw。

### 阶段 5（可选）：安全与体验

1. 敏感凭证加密存储或接入密钥管理。
2. 写回前可选的「连通性检查」（如飞书 API 或 OpenClaw 健康检查）。

---

## 7. 小结：数据关系与设计要点

- **Agent : Channel 配置 = 1 : N**：通过新增表 **agent_channel_configs** 表达，每条记录对应一个 Channel 类型在该 Agent 上的一份配置（含 account_id 与凭证 config）。
- **写回**：同一 Agent 的多个 Channel 配置会对应 OpenClaw 的多个 `channels.<type>.accounts` 条目及多条 `bindings`，共用同一个 openclaw `agentId`。
- **Gateway 维度**：配置写回时以 Agent 的 `gateway_id` 确定目标 OpenClaw 实例；`agent_channel_configs` 中冗余 `gateway_id` 便于按 Gateway 做批量或校验。
- 先实现 **飞书** 一种 Channel，数据模型与 API 预留 **channel_type**，便于后续扩展 Slack 等其它 Channel。

以上为详细设计概要；具体表名、字段名与 API 路径可在落地时按项目规范微调。

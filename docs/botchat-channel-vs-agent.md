# BotChat 与 Mission Control 的 Channel/Agent 设计对比

本文说明 BotsChat 原仓库与 Mission Control（MC）中「创建 Channel」的设计，以及 MC 当前采用的 BotsChat 风格方案。

## BotsChat 原仓库的设计

- **Channel**：在 BotsChat 自己的 DB 里的一张表 `channels`，存 `id, user_id, name, description, openclaw_agent_id, system_prompt`。
- **创建 Channel**：只在 `channels` 表插入一行；`openclaw_agent_id` 一般是根据 channel 名称生成的 slug（如 "My Channel" → `my-channel`），**不会**在 OpenClaw 里创建新 Agent。
- **Agent 列表**：BotsChat API 的「agents」是**虚拟**的：默认 agent + 每个 channel 对应一个「Agent」视图（channel + 默认 session），session key 形如 `agent:{openclaw_agent_id}:botschat:{userId}:adhoc`。
- **真实 Agent**：必须在 OpenClaw 侧**事先存在**（例如手动 `openclaw agents add python-helper ...`），或使用默认 main agent；BotsChat 只存一个「引用 ID」。

总结：**创建 Channel = 在 BotsChat 里新建一个「聊天窗口」+ 一个对 OpenClaw 的 agent 引用，不创建新 OpenClaw Agent。**

## Mission Control 当前的设计（已对齐 BotsChat 思路）

- **Channel**：MC 中有 **`botchat_channels` 表**，存 `id, organization_id, board_id, agent_id, name, description`。一个 Channel 是「聊天窗口 + 对已有 Agent 的引用」。
- **创建 Channel**：前端调用 **POST /api/v1/botchat/channels**，传 `name`、`agent_id`（必填）、`description`（可选）。后端只插入 Channel 行，**不**创建新 Agent；`agent_id` 必须是 BotChat board 上已存在的 Agent。
- **Channel 列表**：**GET /api/v1/botchat/channels?board_id=...**，返回该 Board 下所有 Channel（含嵌入的 `agent` 信息，用于聊天时取 `openclaw_session_id`）。
- **聊天**：选中某 Channel 后，用该 Channel 绑定的 `agent.openclaw_session_id` 和 `board_id` 调用现有 gateway 的 history / message 接口。

与 BotsChat 的**唯一区别**：在 MC 中，Channel 必须**基于当前 BotChat board 上已有的 Agent** 创建（下拉选择 agent），而不是传一个任意字符串作为 `openclaw_agent_id`。这样既复刻了「Channel = 聊天窗口 + 引用、不新建 Agent」的逻辑，又利用了 MC 已有的 Agent 与权限体系。

## 参考

- BotsChat: `packages/api/src/routes/channels.ts`（POST channel 只写 DB）、`packages/api/src/routes/agents.ts`（agents 为 channel + session 的虚拟列表）。
- MC: `backend/app/api/botchat.py`（GET /board、GET /channels、POST /channels）、`backend/app/models/botchat_channels.py`、`frontend/src/app/botchat/messages/page.tsx`（Channel 列表来自 channels API，创建时选择已有 agent + 输入 channel 名称）。

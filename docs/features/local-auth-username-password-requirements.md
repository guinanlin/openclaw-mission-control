# Self-Host 本地认证：用户名密码登录与用户绑定 Token 需求说明

本文档描述在 **Self-Host 模式（Local Authentication）** 下，从「仅输入 Access Token」升级为「用户名 + 密码登录，且每个用户绑定一个 Access Token」的需求与设计要点。实现前可据此评审与排期。

---

## 1. 背景与现状

### 1.1 当前行为

- **前端**：用户打开 Mission Control 后，需在登录页**手动粘贴**一个长度 ≥50 字符的 Access Token，才能解锁使用。
- **后端**：通过环境变量配置**唯一**的 `LOCAL_AUTH_TOKEN`；请求头中的 `Authorization: Bearer <token>` 与该值做常量时间比较，通过则解析为**单一**本地用户（如 `admin@home.local` / Local User）。
- **结果**：所有使用该 token 的人共享同一身份，且体验差（长 token 难记、难粘贴、易泄露）。

### 1.2 目标

- **登录方式**：支持**用户名 + 密码**登录，替代（或与「直接输入 Token」并存）当前「只输 Token」的方式。
- **授权语义**：每个「本地用户」**绑定一个 Access Token**；管理员可配置：用户 A 绑定 token X，用户 B 绑定 token Y。
- **运行时行为**：用户用账号密码登录后，系统在内部使用该用户绑定的 token 做后续 API 鉴权（对前端仍可为「拿到一个 token 后以 Bearer 方式请求」），用户无需再看到或复制长 token。

---

## 2. 功能需求

### 2.1 登录流程

- 登录页提供**用户名**、**密码**输入框（以及可选：「使用 Access Token 登录」入口，供已有 token 或脚本调用场景使用）。
- 用户提交用户名与密码后，前端调用**本地登录接口**（如 `POST /api/v1/auth/local/login`），请求体为 `{ "username", "password" }`。
- 后端校验用户名与密码（与本地用户表中的存储一致），校验通过后返回该用户**绑定的 Access Token**（例如 `{ "access_token": "..." }`）。
- 前端将返回的 `access_token` 存入现有存储（如 sessionStorage），后续所有 API 请求继续使用 `Authorization: Bearer <access_token>`，**与现有前端逻辑一致**，无需为「用户名密码登录」单独维护另一套会话形态。

### 2.2 用户与 Token 的绑定关系

- **数据模型**：需要能够表达「一个本地用户 ↔ 一个绑定的 Access Token」。
- **管理员**：具备途径为本地用户**创建/编辑**账号，并**指定其绑定的 Access Token**（以及用户名、初始密码等）。
- 同一 token 仅应绑定至一个用户；同一用户仅绑定一个 token（1:1）。

### 2.3 鉴权与兼容

- 请求携带 `Authorization: Bearer <token>` 时，后端应能：
  - **优先**根据「本地用户表」中「绑定 token = 当前 token」的记录解析出对应用户（并得到其关联的 `User`），用于后续权限与业务逻辑。
  - **可选**：若表中无匹配，再回退到与当前环境变量 `LOCAL_AUTH_TOKEN` 比较；若一致，则沿用现有「单例本地用户」逻辑，保证未迁移的部署仍可用。
- 现有依赖 `AuthContext` / `User` 的 API 无需因「多用户」而改变调用方式，仅 auth 解析层区分「按绑定 token 解析」与「按单 token 解析」。

### 2.4 安全与体验

- 密码**仅存哈希**，不可逆；推荐 bcrypt 或 argon2。
- 登录接口应具备**防暴力**措施（如按用户名/IP 的失败次数限制、可选锁定或冷却）。
- 绑定 token 的存储需按敏感配置处理；若合规要求高，可考虑加密存储（可后续迭代）。

---

## 3. 设计要点（供实现参考）

### 3.1 数据模型

- **建议**：新增「本地认证用户」表（如 `local_auth_user`），与现有 `users` 表解耦，便于与 Clerk 模式共存：
  - 字段示例：`id`、`username`（唯一）、`password_hash`、`bound_access_token`、`user_id`（FK → `users.id`）。
  - 一个 `local_auth_user` 对应一个 `User`（1:1）；登录后解析到该 `User`，其余业务逻辑不变。
- 不在现有 `User` 表上直接增加 password/token 字段，以避免与 Clerk 用户混用并便于后续扩展（如审计、多因素等）。

### 3.2 认证解析流程（Local 模式）

- 从请求中解析出 Bearer token。
- **第一步**：在 `local_auth_user` 中按 `bound_access_token` 做常量时间比较查找；若找到，则使用其 `user_id` 解析出 `User`，返回 `AuthContext(user=user)`。
- **第二步（可选）**：若未找到，再与 `settings.local_auth_token` 比较；若一致，则沿用现有 `_get_or_create_local_user()` 单例逻辑。
- 这样既支持「多用户 + 绑定 token」，又保留对仅配置 `LOCAL_AUTH_TOKEN` 的旧部署的兼容。

### 3.3 管理员如何配置「用户 ↔ Token」

可选方式（可组合）：

- **方式 A（配置驱动）**：通过环境变量或配置文件描述用户列表（如 `username:password_hash:bound_token`），应用启动时写入/更新 `local_auth_user`。优点：实现简单；缺点：修改需改配置并重启。
- **方式 B（管理 API）**：提供接口（如 `POST/PATCH /api/v1/auth/local/users` 或 `/admin/local-users`）用于创建/更新本地用户及绑定的 token；调用方需具备「管理员」权限（如通过单独的管理 token、或首个本地用户视为 admin 等）。优点：灵活、可做管理 UI；缺点：需设计管理员鉴权与首次 bootstrap。
- **方式 C（混合）**：用配置做首次/默认用户初始化，后续通过管理 API 或管理界面增删改本地用户与绑定 token。

### 3.4 前端

- 登录页从「仅输入 Access Token」改为**用户名 + 密码**为主；可选保留「使用 Access Token 登录」入口。
- 登录成功后：前端仅需将接口返回的 `access_token` 写入现有存储并继续用 Bearer 调用 API，**无需改动现有请求封装**。
- 登出：清除本地存储的 token 即可（与现有行为一致）。

---

## 4. 非功能性考虑

- **兼容性**：保留「仅配置 `LOCAL_AUTH_TOKEN`、不建本地用户表」时的单用户行为（可选），便于渐进迁移。
- **迁移**：提供 Alembic migration 创建 `local_auth_user` 表；可选提供「用当前 `LOCAL_AUTH_TOKEN` 生成一条默认本地用户」的 seed 或脚本，便于首次启用多用户。
- **与局域网访问的关系**：登录与鉴权逻辑与「本机 / 局域网」无关；只要前端能访问到后端且 CORS 正确，用户名密码登录在局域网访问场景下同样适用。API 基地址与 CORS 配置见本地开发/部署文档（如相对路径、`CORS_ORIGINS` 等）。

---

## 5. 验收要点（简要）

- [ ] 支持使用用户名 + 密码在登录页完成登录，并拿到对应用户绑定的 access_token。
- [ ] 使用该 token 的请求能正确解析为对应用户（`AuthContext.user`），且现有 API 行为不变。
- [ ] 管理员能够为本地用户指定/更新其绑定的 Access Token（通过配置或管理 API/界面）。
- [ ] 密码不以明文存储；登录接口具备基本防暴力措施。
- [ ] （可选）保留「直接使用 Access Token 登录」的入口及「仅 `LOCAL_AUTH_TOKEN` 单用户」的兼容行为。

---

## 6. 参考

- 现有 Local 认证逻辑：`backend/app/core/auth.py`（`_resolve_local_auth_context`、`_get_or_create_local_user`）。
- 前端登录组件：`frontend/src/components/organisms/LocalAuthLogin.tsx`。
- 前端 token 存储与使用：`frontend/src/auth/localAuth.ts`、`frontend/src/api/mutator.ts`。

---

## 7. 实现说明（已落地）

### 7.1 接口

- **POST /api/v1/auth/local/login**（无认证）：Body `{ "username", "password" }`，成功返回 `{ "access_token": "..." }`。仅当 `AUTH_MODE=local` 可用；失败 5 次同一用户名后 15 分钟内返回 429。
- **GET /api/v1/auth/local/users**（需 Bearer + super_admin）：返回本地用户列表（不含 token）。
- **POST /api/v1/auth/local/users**（需 Bearer + super_admin）：Body `{ "username", "password", "bound_access_token" }`，创建本地用户；`bound_access_token` 至少 50 字符且非占位符。

### 7.2 配置种子 LOCAL_AUTH_SEED_USERS

可选环境变量，用于应用启动时预置本地用户（仅当 `AUTH_MODE=local` 且非空时执行）。

- **格式**：多个用户用逗号分隔。每个用户为：`username|password_hash|bound_access_token`，其中 `|` 为分隔符，`bound_access_token` 中不得包含 `|`。若只写两段（`username|password_hash`），启动时会自动生成 `bound_access_token`，登录后返回的 access token 即为该绑定 token。
- **要求**：`password_hash` 为 bcrypt 哈希；`bound_access_token` 至少 50 字符且非占位符（如 `change-me`）。
- **首个用户**：列表中第一个用户会被设为 `is_super_admin=true`，可用于登录后调用管理 API 创建更多本地用户。
- **示例**（单用户）：  
  `LOCAL_AUTH_SEED_USERS=admin|$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VTtYpGpJqKqKqK|your-long-access-token-at-least-50-chars`
- 生成 bcrypt 哈希请使用 **bcrypt 库**（不要用 passlib，与 bcrypt 5.x 不兼容）。在项目下执行：  
  `cd backend && uv run python -c "import bcrypt; print(bcrypt.hashpw(b'你的密码', bcrypt.gensalt()).decode())"`

文档版本：初稿，供评审与实现前确认。已实现并补充接口与种子配置说明。

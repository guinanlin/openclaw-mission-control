# 🚀 OpenClaw Mission Control - DevContainer 启动指南

欢迎！你的开发环境已准备好。

## 快速启动

### 1️⃣ 后端开发服务器（热重载）

在终端中运行：
```bash
cd backend && uv run uvicorn app.main:app --reload --port 8000
```

后端服务将在 http://localhost:8000 运行
- OpenAPI 文档: http://localhost:8000/docs
- ReDoc 文档: http://localhost:8000/redoc

### 2️⃣ 前端开发服务器

在新终端中运行：
```bash
cd frontend && npm run dev
```

前端应用将在 http://localhost:3000 运行

### 3️⃣ 生成 API 客户端（可选，后端运行时）

```bash
make api-gen
```

---

## 常用命令

```bash
# 设置依赖（后端 + 前端）
make setup

# 格式化代码
make format

# 运行所有检查（lint + typecheck + tests）
make check

# 仅运行后端测试
make backend-test

# 仅运行前端测试
make frontend-test

# 检查后端测试覆盖率
make backend-coverage

# 应用数据库迁移
make backend-migrate

# 构建前端生产版本
make frontend-build
```

---

## 数据库

- **PostgreSQL** 已在后台运行（端口 5432）
- **Redis** 已在后台运行（端口 6379）
- 连接信息见 `.env` 文件

### 访问数据库

```bash
# 使用 psql 连接 PostgreSQL
psql -U postgres -d mission_control -h localhost

# 使用 redis-cli 连接 Redis
redis-cli -h localhost
```

---

## 文件结构

```
.
├── backend/          # FastAPI 服务
│   ├── app/          # 应用代码
│   │   ├── api/      # API 路由
│   │   ├── models/   # 数据模型
│   │   ├── schemas/  # 请求/响应 Schema
│   │   └── services/ # 服务逻辑
│   ├── migrations/   # Alembic 数据库迁移
│   └── tests/        # pytest 测试
├── frontend/         # Next.js 应用
│   └── src/          # 源代码
│       ├── app/      # 页面和路由
│       ├── components/
│       ├── lib/      # 工具函数
│       └── api/generated/ # 自动生成的 API 客户端
└── docs/             # 文档
```

---

## 开发工作流

1. **分支** - 基于最新 `master` 创建功能分支
2. **编码** - VS Code 会自动格式化和 lint
3. **测试** - `make backend-test` 或 `make frontend-test`
4. **提交** - 遵循 "Conventional Commits" 规范
5. **PR** - 包含描述、测试证据和截图

---

## 扩展和VS Code设置

- ✅ Python、ESLint、Prettier 已预装
- ✅ 代码格式化已启用（保存时自动）
- ✅ 推荐扩展已配置

---

## 需要帮助？

查看更多文档：
- [本地开发指南](../docs/本地开发指南.md)
- [开发文档](../docs/03-development.md)
- [贡献指南](../CONTRIBUTING.md)

---

**祝编码愉快！** 🎉

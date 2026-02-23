# 本地开发：Docker 只跑 DB + Redis

只让 Docker 跑 **Postgres** 和 **Redis**，backend、frontend、webhook-worker 在本地跑，便于热重载和调试。

---

## 可选：全 Docker 开发（卷挂载 + 热重载）

若希望 backend、frontend、worker 都在 Docker 里跑且改代码能热重载，可以用开发用 compose 叠加文件。**DB 和 Redis 可以继续用你已经在跑的那两个容器**，不必新建。

- **只起开发服务（复用已有 DB/Redis）**：若 db、redis 已经在本项目下跑着，只起带热重载的 backend、frontend、worker：
  ```bash
  docker compose -f compose.yml -f compose.dev.yml up --build backend frontend webhook-worker
  ```
  Compose 会复用当前项目里已有的 db、redis 容器，只启动/重启 backend、frontend、webhook-worker。

- **从零起全栈（含 DB/Redis）**：
  ```bash
  docker compose -f compose.yml -f compose.dev.yml up --build
  ```

- **做法**：用卷把宿主机 `backend/app`、`backend/migrations`、`backend/templates` 和整个 `frontend` 挂进容器，容器内跑 `uvicorn --reload` 和 `npm run dev`。
- **效果**：改本机代码保存后，后端/前端的 dev server 会自动重载，无需重建镜像。
- 详见仓库根目录 **`compose.dev.yml`** 及本目录 **`本地开发指南.md`**。

---

## 第一步：只保留 db 和 redis 容器

在仓库根目录执行（会停掉并删除 backend、frontend、webhook-worker 容器，**不动** db、redis 的数据）：

```bash
cd /root/openclaw-mission-control

# 停掉并移除 backend、frontend、webhook-worker（保留 db、redis 在跑）
docker stop openclaw-mission-control-backend-1 openclaw-mission-control-frontend-1 openclaw-mission-control-webhook-worker-1
docker rm   openclaw-mission-control-backend-1 openclaw-mission-control-frontend-1 openclaw-mission-control-webhook-worker-1
```

确认只剩 db 和 redis：

```bash
docker ps -a
# 应看到：db、redis 为 Up；backend/frontend/webhook-worker 已消失
```

若你希望「全部 down 再只起 db+redis」也可以：

```bash
docker compose -f compose.yml --env-file .env down
docker compose -f compose.yml --env-file .env up -d db redis

 docker compose -f compose.yml -f compose.dev.yml up --build backend frontend webhook-worker
```

---

## 第二步：本地跑后端（热重载）

**终端 1**：

```bash
cd /root/openclaw-mission-control/backend
uv sync --extra dev
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

看到 `Uvicorn running on http://0.0.0.0:8000` 且无报错即可。  
校验：`curl -f http://localhost:8000/healthz`

---

## 第三步：本地跑前端（热重载）

**终端 2**：

```bash
cd /root/openclaw-mission-control/frontend
npm install
npm run dev
```

浏览器打开：http://localhost:3000

---

## 第四步（可选）：本地跑 RQ Worker

若需要后台任务（例如 webhook 等），再开 **终端 3**：

```bash
cd /root/openclaw-mission-control
make rq-worker
```

---

## 环境说明

- **backend/.env**、**frontend/.env** 已按「连本机 Docker 的 5432/6379」配好。
- 后端连：`localhost:5432`（Postgres）、`localhost:6379`（Redis）。
- 若用局域网 IP（如 192.168.8.116）从别的设备访问前端，请把：
  - `frontend/.env` 里 `NEXT_PUBLIC_API_URL` 改为 `http://192.168.8.116:8000`
  - `backend/.env` 里 `CORS_ORIGINS` 已包含 `http://192.168.8.116:3000`，无需再改。

---

## 以后再次启动

Docker 里 db、redis 若一直在跑，只需：

1. 终端 1：`cd backend && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`
2. 终端 2：`cd frontend && npm run dev`
3. 需要时终端 3：`make rq-worker`

若曾执行过 `docker compose down`，先：

```bash
docker compose -f compose.yml --env-file .env up -d db redis
```

再按上面 1、2、3 启动本地服务。

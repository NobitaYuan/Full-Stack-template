# 首次启动

在仓库根目录执行命令。默认前端端口为 `5173`，后端端口为 `3000`。开发数据库默认用 Docker Compose 启动，也可以接入本机 PostgreSQL。

## 1. 安装依赖

使用 Node.js 22.18 或更新版本，推荐 Node.js 24 LTS。pnpm 版本以根目录 [package.json](../package.json) 的 `packageManager` 字段为准。

```sh
node --version
pnpm --version
pnpm install --frozen-lockfile
```

## 2. 准备开发库

### Docker Compose（默认）

启动 Docker 后，用仓库自带的 [compose.yaml](../compose.yaml) 启动 PostgreSQL 16。[Docker Compose 启动参数](https://docs.docker.com/reference/cli/docker/compose/up/)

```sh
docker compose up -d --wait postgres
```

数据库只监听宿主机的 `127.0.0.1:54320`，库名为 `server_template`，开发账号为 `template_dev`，密码为 `template_dev_password`。这组开发配置已写入后端的 `.env.example`，复制后即可使用。

运行 `docker compose stop postgres` 可停止服务，数据保存在命名卷中。下次继续使用时，再运行启动命令。如果 `54320` 已被占用，设置 `POSTGRES_HOST_PORT` 后启动，并同步修改 `apps/server/.env` 的连接端口。

### 本机 PostgreSQL

启动本机 PostgreSQL，创建专用开发库，准备数据库名、账号、密码、主机和端口。下一步复制环境文件后，把 `DATABASE_URL` 改为该数据库的连接串。

## 3. 配置环境变量并迁移

首次启动时，从模板复制一份 `apps/server/.env`。已有该文件时直接核对其中的配置。

Bash 或 Zsh

```bash
cp apps/server/.env.example apps/server/.env
```

PowerShell

```powershell
Copy-Item -LiteralPath apps/server/.env.example -Destination apps/server/.env
```

使用默认 Compose 配置时，复制后可直接迁移。已有 `.env` 时，只需确认 `DATABASE_URL` 指向选定的开发库。终端中已有的 `DATABASE_URL` 优先于文件配置。

```sh
pnpm --filter @repo/server db:migrate
```

迁移成功后启动服务。

```sh
pnpm dev
```

保持终端运行。开发环境下，Vite 会把前端的 `/api/v1` 请求转发到后端。可打开[前端登录页](http://localhost:5173/login)、[后端健康检查](http://localhost:3000/health)和 [API 文档](http://localhost:3000/api/v1/doc)。

## 4. 注册首个管理员

打开 [API 文档](http://localhost:3000/api/v1/doc)，调用 `POST /api/v1/auth/register`。也可以用任意 HTTP 客户端发送下面的请求体，设置 `Content-Type: application/json`。先把示例密码换成自己的密码，两处保持一致。

```json
{
  "username": "local_admin",
  "password": "换成你设置的密码",
  "confirmPassword": "换成你设置的密码"
}
```

1. 从响应中取出 `data.user.id`，写入 `apps/server/.env` 的 `ADMIN_USER_IDS`。
2. 停止并重新运行 `pnpm dev`，让后端读入管理员配置。
3. 打开[登录页](http://localhost:5173/login)，用刚注册的账号登录。点击 **用户管理**，确认列表中能看到该账号。

已经注册过时，可用 `POST /api/v1/auth/login` 获取现有账号的 ID。集成测试使用名称以 `_test` 结尾的独立数据库，详见[后端测试说明](../apps/server/README.md#集成测试)。

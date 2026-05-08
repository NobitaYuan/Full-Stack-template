# 标书合规审查系统 — API 接口文档

> 版本：1.0 | 日期：2026-05-08
> 基础路径：`/api/v1/reviewer`
> 完整的 OpenAPI spec 将由后端 Zod schema 自动生成，本文档为手工描述版本

---

## 1. 通用约定

### 1.1 请求头

| 头部 | 值 | 必要性 |
|------|-----|--------|
| Content-Type | application/json | 非文件上传接口 |
| Content-Type | multipart/form-data | 文件上传接口 |

### 1.2 响应格式

**成功响应：**

```json
{
  "code": 200,
  "data": { ... },
  "message": "success"
}
```

**分页响应：**

```json
{
  "code": 200,
  "data": {
    "items": [ ... ],
    "total": 100,
    "page": 1,
    "pageSize": 20
  },
  "message": "success"
}
```

**错误响应：**

```json
{
  "code": 400,
  "message": "Validation error: ...",
  "data": null
}
```

### 1.3 错误码

| HTTP 状态码 | 含义 | 场景 |
|-------------|------|------|
| 200 | 成功 | — |
| 400 | 请求参数错误 | 缺少必填字段、格式错误 |
| 404 | 资源不存在 | 项目/任务/产物 ID 不存在 |
| 409 | 冲突 | 已存在招标文件时重复上传 |
| 413 | 文件过大 | 上传文件超过大小限制 |
| 500 | 服务器内部错误 | 流水线执行异常 |

---

## 2. 项目管理 API

### 2.1 创建审查项目

```
POST /api/v1/reviewer/projects
```

**请求体：**

```json
{
  "name": "XX系统采购项目",
  "code": "2026-JZ-001",
  "clientOrg": "XX部队装备部"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 项目名称，最长 200 字符 |
| code | string | 是 | 项目编号，最长 50 字符，唯一 |
| clientOrg | string | 否 | 委托单位，最长 200 字符 |

**成功响应：**

```json
{
  "code": 200,
  "data": {
    "id": "uuid-xxx",
    "name": "XX系统采购项目",
    "code": "2026-JZ-001",
    "clientOrg": "XX部队装备部",
    "status": "未开始",
    "createdAt": "2026-05-08T10:00:00Z",
    "updatedAt": "2026-05-08T10:00:00Z"
  }
}
```

**错误场景：**
- 400：name 或 code 为空
- 409：code 已存在

---

### 2.2 获取项目列表

```
GET /api/v1/reviewer/projects?page=1&pageSize=20&keyword=XX
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | integer | 否 | 页码，默认 1 |
| pageSize | integer | 否 | 每页条数，默认 20 |
| keyword | string | 否 | 搜索关键词（匹配 name 或 code） |

**成功响应：**

```json
{
  "code": 200,
  "data": {
    "items": [
      {
        "id": "uuid-xxx",
        "name": "XX系统采购项目",
        "code": "2026-JZ-001",
        "clientOrg": "XX部队装备部",
        "status": "审查中",
        "latestTaskPhase": "BCA_FCA_RUNNING",
        "latestTaskCreatedAt": "2026-05-08T11:00:00Z",
        "createdAt": "2026-05-08T10:00:00Z",
        "updatedAt": "2026-05-08T11:00:00Z"
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 20
  }
}
```

---

### 2.3 获取项目详情

```
GET /api/v1/reviewer/projects/:id
```

**成功响应：**

```json
{
  "code": 200,
  "data": {
    "id": "uuid-xxx",
    "name": "XX系统采购项目",
    "code": "2026-JZ-001",
    "clientOrg": "XX部队装备部",
    "status": "审查中",
    "latestTask": {
      "id": "uuid-task-xxx",
      "phase": "BCA_FCA_RUNNING",
      "status": "running",
      "createdAt": "2026-05-08T11:00:00Z"
    },
    "createdAt": "2026-05-08T10:00:00Z",
    "updatedAt": "2026-05-08T11:00:00Z"
  }
}
```

**错误场景：**
- 404：项目不存在

---

### 2.4 更新项目

```
PATCH /api/v1/reviewer/projects/:id
```

**请求体（部分更新）：**

```json
{
  "name": "新项目名称",
  "clientOrg": "新委托单位"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 否 | 项目名称 |
| clientOrg | string | 否 | 委托单位 |

**成功响应：** 返回更新后的完整项目对象（同 2.3）

**错误场景：**
- 404：项目不存在

---

### 2.5 删除项目

```
DELETE /api/v1/reviewer/projects/:id
```

**成功响应：**

```json
{
  "code": 200,
  "data": null,
  "message": "删除成功"
}
```

**副作用：** 级联删除该项目的所有任务、文件（含文件系统）、产物和日志。

**错误场景：**
- 404：项目不存在

---

## 3. 任务管理 API

### 3.1 创建审查任务

```
POST /api/v1/reviewer/tasks
```

**请求体：**

```json
{
  "projectId": "uuid-xxx"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| projectId | string | 是 | 所属项目 ID |

**成功响应：**

```json
{
  "code": 200,
  "data": {
    "id": "uuid-task-xxx",
    "projectId": "uuid-xxx",
    "phase": "DOC_UPLOADING",
    "status": "created",
    "errorMessage": null,
    "createdAt": "2026-05-08T11:00:00Z",
    "updatedAt": "2026-05-08T11:00:00Z"
  }
}
```

**错误场景：**
- 400：projectId 为空
- 404：项目不存在

---

### 3.2 获取任务详情

```
GET /api/v1/reviewer/tasks/:id
```

**成功响应：**

```json
{
  "code": 200,
  "data": {
    "id": "uuid-task-xxx",
    "projectId": "uuid-xxx",
    "project": {
      "id": "uuid-xxx",
      "name": "XX系统采购项目",
      "code": "2026-JZ-001"
    },
    "phase": "BCA_FCA_RUNNING",
    "status": "running",
    "errorMessage": null,
    "documents": [
      {
        "id": "uuid-doc-xxx",
        "docType": "tender",
        "fileName": "招标文件.pdf",
        "charCount": 82340,
        "uploadOrder": 0,
        "createdAt": "2026-05-08T11:01:00Z"
      }
    ],
    "artifacts": [
      {
        "id": "uuid-art-xxx",
        "artifactType": "review_baseline",
        "name": "审查基准",
        "phase": "DPA_ROUND1",
        "version": 1,
        "createdAt": "2026-05-08T11:05:00Z"
      },
      {
        "id": "uuid-art-xxx2",
        "artifactType": "extracted_fields",
        "name": "字段护照",
        "phase": "DPA_ROUND2",
        "version": 1,
        "createdAt": "2026-05-08T11:10:00Z"
      }
    ],
    "createdAt": "2026-05-08T11:00:00Z",
    "updatedAt": "2026-05-08T11:10:00Z"
  }
}
```

---

### 3.3 获取项目最新任务

```
GET /api/v1/reviewer/projects/:id/latest-task
```

**成功响应：** 同 3.2 任务详情格式

**错误场景：**
- 404：项目不存在或项目无任务

---

### 3.4 删除任务

```
DELETE /api/v1/reviewer/tasks/:id
```

**成功响应：**

```json
{
  "code": 200,
  "data": null,
  "message": "删除成功"
}
```

**副作用：** 级联删除任务关联的文件记录（含文件系统）、产物和日志。如果任务正在运行，先中断流水线。

---

## 4. 文件上传 API

### 4.1 上传文件

```
POST /api/v1/reviewer/tasks/:id/upload
```

**请求格式：** `multipart/form-data`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file | File | 是 | PDF 或 DOCX 文件 |
| docType | string | 是 | "tender" 或 "bid" |

**成功响应：**

```json
{
  "code": 200,
  "data": {
    "id": "uuid-doc-xxx",
    "taskId": "uuid-task-xxx",
    "docType": "tender",
    "fileName": "招标文件.pdf",
    "charCount": 82340,
    "uploadOrder": 0,
    "createdAt": "2026-05-08T11:01:00Z"
  }
}
```

**后端处理流程：**
1. 校验文件类型（仅 .pdf / .docx / .doc）
2. 校验文件大小（<= 100MB）
3. 如果 docType=tender，检查是否已存在招标文件（409 冲突）
4. 保存文件到 `uploads/reviewer/{taskId}/{fileName}`
5. 使用 pdf-parse 或 mammoth 提取文本
6. 将文本存入 `review_documents.textContent`
7. 更新 `charCount`
8. 返回文件信息

**错误场景：**
- 400：文件格式不支持、docType 不合法
- 404：任务不存在
- 409：已存在招标文件时重复上传 tender 类型
- 413：文件超过大小限制

---

### 4.2 获取文件列表

```
GET /api/v1/reviewer/tasks/:id/documents
```

**成功响应：**

```json
{
  "code": 200,
  "data": [
    {
      "id": "uuid-doc-1",
      "docType": "tender",
      "fileName": "招标文件.pdf",
      "charCount": 82340,
      "uploadOrder": 0,
      "createdAt": "2026-05-08T11:01:00Z"
    },
    {
      "id": "uuid-doc-2",
      "docType": "bid",
      "fileName": "投标函.pdf",
      "charCount": 3200,
      "uploadOrder": 1,
      "createdAt": "2026-05-08T11:02:00Z"
    }
  ]
}
```

---

## 5. 流水线控制 API

### 5.1 启动审查

```
POST /api/v1/reviewer/tasks/:id/start
```

**前置校验：**
1. 任务状态为 `created`
2. 已上传招标文件（docType=tender）
3. 至少上传一个投标文件（docType=bid）

**成功响应：**

```json
{
  "code": 200,
  "data": {
    "taskId": "uuid-task-xxx",
    "status": "running",
    "phase": "DPA_ROUND1"
  },
  "message": "审查流水线已启动"
}
```

**后端行为：**
- 更新 task.status = "running"，phase = "DPA_ROUND1"
- 异步启动流水线（fire-and-forget）
- 流水线执行过程中通过 WebSocket 推送状态

**错误场景：**
- 400：任务状态不是 created、缺少必要文件
- 404：任务不存在
- 409：任务已在运行

---

### 5.2 暂停审查

```
POST /api/v1/reviewer/tasks/:id/pause
```

> 预留接口，后续迭代实现。

---

### 5.3 恢复审查

```
POST /api/v1/reviewer/tasks/:id/resume
```

> 预留接口，后续迭代实现。

---

## 6. 产物查看 API

### 6.1 获取全部产物列表

```
GET /api/v1/reviewer/tasks/:id/artifacts
```

**成功响应：**

```json
{
  "code": 200,
  "data": [
    {
      "id": "uuid-art-1",
      "artifactType": "review_baseline",
      "name": "审查基准",
      "phase": "DPA_ROUND1",
      "version": 1,
      "createdAt": "2026-05-08T11:05:00Z"
    },
    {
      "id": "uuid-art-2",
      "artifactType": "extracted_fields",
      "name": "字段护照",
      "phase": "DPA_ROUND2",
      "version": 1,
      "createdAt": "2026-05-08T11:10:00Z"
    },
    {
      "id": "uuid-art-3",
      "artifactType": "bca_result",
      "name": "BCA审查结果",
      "phase": "BCA_FCA_RUNNING",
      "version": 1,
      "createdAt": "2026-05-08T11:15:00Z"
    },
    {
      "id": "uuid-art-4",
      "artifactType": "fca_result",
      "name": "FCA审查结果",
      "phase": "BCA_FCA_RUNNING",
      "version": 1,
      "createdAt": "2026-05-08T11:15:00Z"
    },
    {
      "id": "uuid-art-5",
      "artifactType": "review_report",
      "name": "审查报告",
      "phase": "REPORT_COMPILING",
      "version": 1,
      "createdAt": "2026-05-08T11:20:00Z"
    }
  ]
}
```

---

### 6.2 获取指定产物内容

```
GET /api/v1/reviewer/tasks/:id/artifacts/:type
```

**type 取值：** `review_baseline` | `extracted_fields` | `bca_result` | `fca_result` | `review_report`

**成功响应：**

```json
{
  "code": 200,
  "data": {
    "id": "uuid-art-1",
    "artifactType": "review_baseline",
    "name": "审查基准",
    "phase": "DPA_ROUND1",
    "version": 1,
    "content": "## A. ★号条款提取\n| 序号 | ★条款编号 | 条款原文摘要 | ...",
    "metadata": null,
    "createdAt": "2026-05-08T11:05:00Z"
  }
}
```

**错误场景：**
- 404：任务不存在或指定类型的产物不存在

---

## 7. WebSocket 接口

### 7.1 连接

```
GET /api/v1/reviewer/ws/tasks/:id
```

**协议升级：** HTTP → WebSocket

### 7.2 服务端推送事件

所有事件为 JSON 格式：

#### 阶段变更

```json
{
  "type": "phase_changed",
  "from": "DPA_ROUND1",
  "to": "DPA_ROUND2"
}
```

#### 产物就绪

```json
{
  "type": "artifact_ready",
  "artifactType": "review_baseline",
  "artifactId": "uuid-art-1"
}
```

#### Agent 调用开始

```json
{
  "type": "agent_call_started",
  "agentRole": "dpa"
}
```

#### Agent 调用完成

```json
{
  "type": "agent_call_completed",
  "agentRole": "dpa",
  "latencyMs": 15230
}
```

#### 审查完成

```json
{
  "type": "completed"
}
```

#### 审查失败

```json
{
  "type": "failed",
  "error": "DPA Round 1 failed after 3 retries: empty response"
}
```

---

## 8. 接口汇总

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/v1/reviewer/projects | 创建项目 |
| GET | /api/v1/reviewer/projects | 项目列表 |
| GET | /api/v1/reviewer/projects/:id | 项目详情 |
| PATCH | /api/v1/reviewer/projects/:id | 更新项目 |
| DELETE | /api/v1/reviewer/projects/:id | 删除项目 |
| POST | /api/v1/reviewer/tasks | 创建任务 |
| GET | /api/v1/reviewer/tasks/:id | 任务详情 |
| GET | /api/v1/reviewer/projects/:id/latest-task | 最新任务 |
| DELETE | /api/v1/reviewer/tasks/:id | 删除任务 |
| POST | /api/v1/reviewer/tasks/:id/upload | 上传文件 |
| GET | /api/v1/reviewer/tasks/:id/documents | 文件列表 |
| POST | /api/v1/reviewer/tasks/:id/start | 启动审查 |
| POST | /api/v1/reviewer/tasks/:id/pause | 暂停审查（预留） |
| POST | /api/v1/reviewer/tasks/:id/resume | 恢复审查（预留） |
| GET | /api/v1/reviewer/tasks/:id/artifacts | 产物列表 |
| GET | /api/v1/reviewer/tasks/:id/artifacts/:type | 产物内容 |
| GET | /api/v1/reviewer/ws/tasks/:id | WebSocket |

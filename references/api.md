# 橙子学内部接口参考

> 仅用于用户本人已登录的会员账号。接口属于站内私有接口，可能随前端版本变化。

## 通用约定

- Base：`https://c.xkw.com`
- 所有 `/api/*` 请求需要：
  - 登录 Cookie（浏览器自动携带）
  - `xkw-client: czx`
  - `xkw-sign: <appId>-<ts>-<md5>`
- 返回体一般是 `{ status, data }`；部分接口直接返回对象或数组。

## 签名算法

来源：站点前端 `app.*.js` 的 axios 拦截器。

1. `GET /api/v1/sign/new-app`（无需签名）→ `{ appId, secret, aesKeys: [{key, iv}...], expire }`
2. 用 `appId.split('|')[1]` 计算下标：

```
total = Σ ( charCode(i) + charResult(charCode(i), nextCharCode) )
index = total % aesKeys.length
```

`charResult` / `nextCharCode` 的精确定义见 `scripts/inject.js`，不必手写。

3. `secretPlain = AES-CBC-Decrypt(secret, key=aesKeys[index].key, iv=aesKeys[index].iv, padding=ZeroPadding)`
4. `ts = parseInt(Date.now()/1000)`
5. `sign = appId + '-' + ts + '-' + MD5(`${appId}&${ts}&${signStr}&${secretPlain}`)`

参数串 `signStr`：

- GET：`T(query 参数)`，其中 query 是 URL 上的参数（不含 `/api/...` 路径）
- POST JSON：有 query 时 `T(query) + '||' + JSON.stringify(body)`；无 query 时直接 `JSON.stringify(body)`
- `T(obj)`：过滤 `undefined`；每项写成 `key|value`（`null` 写成空串）；按字符串排序；用 `||` 连接

`/api/v1/sign/new-app` 的结果可缓存到 `expire`；`inject.js` 已做进程内缓存。

## 接口清单

### 1. 试卷列表

```
GET /api/v1/student/document/list
```

| 参数 | 说明 |
|---|---|
| `index` | 页码，从 1 开始 |
| `size` | 每页条数（实测 10/20 可用） |
| `stageId` | 学段；0 = 不限 |
| `gradeId` | 年级；0 = 不限 |
| `subjectId` | 学科 ID |
| `scenarioId` | 场景 ID（期末/高考真题/名校…） |
| `year` | 年份；0 = 全部 |
| `provinceId` / `cityId` | 地区；0/0 = 全国 |
| `term` | `'next'`（下学期）等 |
| `orders` | `czx-update_time$2` 最新；`czx-download$2` 最热 |
| `keyword` | 标题关键词（可选） |
| `parentScenarioId` | 二级场景（可选） |

返回：

```json
{
  "status": 200,
  "data": {
    "index": 1,
    "size": 10,
    "total": 69,
    "totalPage": 7,
    "result": [{
      "documentId": 58816398,
      "title": "重庆市南开中学校2025-2026学年高一下学期期末学业水平检测数学试题",
      "schoolName": "重庆市南开中学校",
      "schoolLevelName": "百强校",
      "areaName": "重庆",
      "year": 2026,
      "stageName": "高中",
      "subjectName": "数学",
      "scenarioName": "期末",
      "updateTime": "2026-07-14",
      "downloads": 50,
      "paperAttrName": "答案解析",
      "paperQualityName": "精品解析",
      "enableDownload": true,
      "hasTest": true,
      "fileCount": 2,
      "fileExt": "zip"
    }]
  }
}
```

> 注意：`gradeId` 与 `stageId` 要么都给具体值，要么都为 0；混搭会 500。

### 2. 试卷详情

```
GET /api/v1/student/document/info/{documentId}
```

返回单份试卷的元数据（标题、学校、地区、场景、`hasTest`、`enableDownload` 等），**不含题目**。

### 3. 原卷 / 解析逐页图片（免费）

```
GET /api/v1/student/document/img-preview-more/{documentId}?fullPreview=false
```

返回：

```json
[{
  "fileExt": ".pdf",
  "fileName": "…(原卷版)A4",
  "fileTag": "原卷",
  "images": ["https://cdn-preview.xkw.com/…/1.jpg?Expires=…&Signature=…"]
}, {
  "fileTag": "解析",
  "images": ["…"]
}]
```

`fullPreview=true` 会返回全部页；`false` 只返回部分预览页。

### 4. 获取题目 ID 列表（免费）

```
POST /api/v1/student/online-training/can-check-answer
Body: {"resourceId":"<documentId>","sourceFrom":1}
```

返回：

```json
{
  "currentQuestionId": "…",
  "documentId": 58816398,
  "id": "…",
  "questionCount": 19,
  "questionIds": ["4053682092302336", "…"],
  "reportId": 2422090
}
```

副作用：会创建/复用一条「在线练」记录（同一份卷返回同一个 `reportId`）。如果试卷 `hasTest=false`，此接口不可用。

### 5. 批量取题目全文（免费）

```
POST /api/v1/student/paper/paper-questions-v2
Body: {
  "resourceId": "58816398",
  "sourceFrom": 1,
  "questions": [
    {"questionId": "4053682092302336", "questionIndex": 1},
    {"questionId": "4053682092441600", "questionIndex": 2}
  ]
}
```

返回数组，每项：

| 字段 | 说明 |
|---|---|
| `id` / `index` | 题目 ID / 题号 |
| `questionTagName` | 题型名（单选题/多选题/填空题…） |
| `questionType` | 题型 ID |
| `difficultyName` | 易 / 中 / 难 |
| `stemNoOptions` | 题干 HTML（不含选项），含 `<math latex="...">` |
| `stem` | 有时为空 |
| `optionsContents` | `["A|||<div>…</div>", "B|||…"]` |
| `correctAnswers` | `["B"]` 等 |
| `answer` | 答案 HTML |
| `explanation` | 解析 HTML |
| `hasSubQuestions` | 是否含小题 |

一次请求可传多题（实测 3 题、19 题均可）；建议单批 ≤ 40，批间间隔 ≥ 400ms。

### 6. 剩余下载券（免费）

```
GET /api/v1/student/vip/download-vouchers
```

返回：

```json
{
  "availableCount": 403,
  "list": [{
    "name": "365天学年卡套餐附赠下载券",
    "remainCount": 403,
    "totalCount": 500,
    "usedCount": 97,
    "expireTime": "2027-07-26 23:59:59"
  }]
}
```

### 7. 下载信封（消耗 1 张券）

```
GET /api/v1/student/download/signal?documentId=58816398&withAnswer=true&withQuestion=true&pageSize=A4
```

| 参数 | 说明 |
|---|---|
| `withAnswer` | 是否要解析版 |
| `withQuestion` | 是否要原卷版 |
| `pageSize` | `A4` 或 `A3`（A3 双栏） |

返回：

```json
{
  "documentId": 0,
  "errorCode": 0,
  "ext": "zip",
  "fileUrl": "https://downloadweb.zxxk.com/filedownload/ShowDownLoadView?mkey=…&timestamp=…&sn=…",
  "success": true,
  "training": true,
  "trainingParam": { "mkey": "…", "sn": "…", "timestamp": "…" }
}
```

**调用即扣券。** `fileUrl` 是打包页，不是文件。

### 8. 打包页 → 最终文件

1. `GET fileUrl` → HTML，内含
   `<a class="fileUrl" href="https://files.zxxk.com?mkey=…">`
2. `GET https://files.zxxk.com?mkey=…` → zip（`Content-Type: application/octet-stream`）

zip 内通常包含 `(原卷版)A4.pdf` 与 `(解析版)A4.pdf`。

> `files.zxxk.com` 对 `HEAD` 返回 403，但对 `GET`（含 Range）正常 200/206。用 GET 下载即可。
> 该签名链接有时效（OSS `x-oss-expiration`），拿到后尽快下载。

### 9. 高考真题（按年份 / 卷型）

```
GET /api/v1/student/gaokao/paper?type=&year=2026&provinceId=
GET /api/v1/student/gaokao/years
```

`gaokao/paper` 返回按卷型分组：

```json
[{
  "area": "全国一卷",
  "id": 4280,
  "intro": "适用地区：河北、江苏、浙江…",
  "year": 2026,
  "subjects": [
    {"subjectName": "语文", "paperId": 58273822, "analysisId": 58288700},
    {"subjectName": "数学", "paperId": 58248364, "analysisId": 58288230}
  ]
}]
```

关键区别：

- `paperId`：原卷，通常 `hasTest=false`，**不能**调 `can-check-answer`
- `analysisId`：参考版/解析版，通常 `hasTest=true`，可以预览题目
- 图片预览对 `paperId` 有效（返回「试卷」「答案」两组图）

`type` 预留给模考类型；高考真题页当前传空。高考模考不走这个接口，走 `document/list`（见上）。

## 元数据接口

| 接口 | 参数 | 返回 |
|---|---|---|
| `GET /api/v1/student/basic/stages` | — | `[{id,name}]` |
| `GET /api/v1/student/basic/grades` | `partnerId=0&stageId=4` | `[{id,name,stageId}]` |
| `GET /api/v1/student/basic/subjects` | `pageType=1&withUnlimited=true&partnerId=0&stageId&provinceId&gradeId` | `[{id,name,shortName}]` |
| `GET /api/v1/student/basic/scenarios` | `pageType=1&withUnlimited=false&gradeId&stageId` | `[{id,name,children:[…]}]` |
| `GET /api/v1/student/basic/years` | `withUnlimited=true` | `[{id,name}]` |

## 其他可用接口（未在 skill 主流程中使用）

| 用途 | 接口 |
|---|---|
| 试卷推荐阅读 | `GET /api/v1/student/document/recommend-read?documentId=` |
| 作文卷列表 | `GET /api/v1/student/document/composition/list` |
| 实验卷列表 | `GET /api/v1/student/document/experiment/list` |
| 中考真题卷 | `GET /api/v2 或 v1 student/zhongkao/paper` |
| 高考真题卷 | `GET /api/v1/student/gaokao/paper` |
| 错题本 | `GET/POST /api/v1/student/error-question/*` |
| 在线练记录 | `GET /api/v1/student/online-training/list` |
| 拍照搜题 | `POST /api/v1/ocr/recognition`、`/api/v1/search/photo` |

## 已确认的 ID

- 学段：2 小学、3 初中、4 高中
- 年级：10 高一、11 高二、12 高三
- 学科：1 语文、2 数学、3 英语、4 物理、5 化学、6 生物学、7 思想政治、8 历史、9 地理、12 信息技术、16 通用技术
- 场景（`document/list`）：904 阶段检测、420105 期中、420106 期末、420409 学考、906 名校、907 高考模考（全部）
- 高考模考场次：一模 420404、二模 420405、三模 420406、模拟预测 420407；请求时 **`scenarioId=子ID` 且 `parentScenarioId=907`**
- 高考真题：`905` 不是 `document/list` 的合法场景，走 `gaokao/paper`
- 重庆：provinceId=500000，cityId=500109

以上都会随站点调整，运行 `meta()` 为准。

---
name: czx-question-finder
description: 在橙子学（c.xkw.com，学科网学生版）检索真题试卷并批量预览题目。按学段/年级/学科/年份/地区/场景/关键词筛卷，免费预览题干、选项、答案与解析，确需时再下载原卷+解析 PDF（每份消耗 1 张下载券）。当用户说「在橙子学找题」「c.xkw.com 找试卷」「学科网学生版刷真题」「帮我找某校某年某科的卷子」「预览一下这套卷的题」时使用。
---

# 橙子学找题

## 第一原则：多预览，少下载

这是本 skill 的默认行为，不是建议：

1. **默认只做「检索 + 预览」。** 预览题目（题干、选项、答案、解析）**不消耗下载券**，只有下载 PDF 才消耗。
2. **先预览再决定。** 对同一份卷，先看关键题（压轴题、易错题、指定知识点），确认有用再整卷下载。
3. **下载必须经用户明确同意。** 用户说「下载 / 导出 / 打印 / 存 PDF」才进入下载流程；进入前先报当前券数，并说明「本次将消耗 N 张券」。
4. **不做未经确认的批量下载。** 一次下载多份时，逐份确认或先给清单让用户勾选。
5. 每份卷下载消耗 1 张下载券；券是消耗品，不可恢复。

## 能力与成本

| 动作 | 接口 | 消耗 |
|---|---|---|
| 搜卷 / 翻页 / 关键词 | `student/document/list` | 免费 |
| 试卷详情 | `student/document/info/{id}` | 免费 |
| 原卷 / 解析逐页图片 | `student/document/img-preview-more/{id}` | 免费 |
| 题目全文（题干/选项/答案/解析/难度） | `can-check-answer` + `paper-questions-v2` | 免费 |
| 剩余下载券 | `student/vip/download-vouchers` | 免费 |
| 下载 PDF（原卷+解析） | `student/download/signal` | **1 张券/份** |

> 预览会在账号的「在线练」里留下一条记录；同一份卷重复调用不会重复创建（返回同一个 reportId）。

## 前置条件

- Playwright MCP 已连接（扩展模式，驱动用户真实 Chrome）。
- 用户已在 Chrome 登录 `c.xkw.com`，并有有效会员/下载券。
- 如果页面出现「立即开通」或用户信息 `vipStatus.isVip = false`：**停止**，告诉用户会员状态异常，不要继续。

## 步骤 0 · 连上页面

```
browser_navigate  https://c.xkw.com/doc-list/qm
```

如果导航失败或要求授权：请用户在 Chrome 里点一下 Playwright 扩展的授权，然后重试。**不要**改用无头浏览器或无 Cookie 的请求。

## 步骤 1 · 注入客户端

读取并原样传入：

```
Read  <本 skill 目录>/scripts/inject.js
```

把文件内容（一个 `async () => {...}` 函数）作为 `function` 参数传给 `browser_evaluate`。成功返回 `"ready"`。

注入后可用：

```js
window.__xkw.search(opts)          // 搜卷
window.__xkw.gaokaoPapers({year})  // 高考真题（按卷型/科目）
window.__xkw.preview(id, opts)     // 题目预览（含 markdown；opts.altId 可切解析版）
window.__xkw.info(id)              // 试卷详情
window.__xkw.previewImages(id, full)
window.__xkw.vouchers()            // 剩余券
window.__xkw.downloadSignal(id)    // 扣券，返回下载页 URL
window.__xkw.meta({stageId, gradeId})
window.__xkw.xkw(path, params, method, body)  // 任意接口
```

每次页面刷新/导航后都要重新注入（`__v` 检查会自动判断，重复注入无副作用）。

### 登录检查

```js
async () => {
  const u = await window.__xkw.xkw('/api/v1/student/user/info');
  return { userId: u.data.userId, nick: u.data.nickName, vip: u.data.vipStatus };
}
```

`vipStatus.isVip` 必须为 `true`，否则停止。

## 步骤 2 · 元数据（第一次用时）

```js
async () => await window.__xkw.meta({ stageId: 4, gradeId: 10 })
```

返回各学段/年级/学科/场景/年份的 ID。把结果存到工作目录的 `.czx/meta.json`（用 `filename` 参数），后续直接查表。**不要凭记忆猜 ID。**

常用 ID 见下方速查表，但以接口返回为准。

## 步骤 3 · 搜卷

先判断用户要的是哪一类卷。**七个标签不是同一个接口：**

| 标签 | 接口 | 参数 |
|---|---|---|
| 阶段检测 | `document/list` | `scenarioId=904` |
| 期中 | `document/list` | `scenarioId=420105` |
| 期末 | `document/list` | `scenarioId=420106` |
| 学考 | `document/list` | `scenarioId=420409` |
| 名校 | `document/list` | `scenarioId=906` |
| 高考模考（全部） | `document/list` | `scenarioId=907` |
| 高考模考（某场） | `document/list` | `scenarioId=<场次ID>&parentScenarioId=907` |
| **高考真题** | **`gaokao/paper`** | 见 3.2 |

场次 ID：一模 `420404`、二模 `420405`、三模 `420406`、模拟预测 `420407`。注意是**子 ID 放 `scenarioId`、907 放 `parentScenarioId`**，反过来会失效。

### 3.1 普通试卷列表

```js
async () => await window.__xkw.search({
  scenarioId: 420106,      // 默认期末；按上表替换
  subjectId: 2,            // 数学
  stageId: 4, gradeId: 10, // 高中 / 高一
  year: 0,                 // 0 = 全部
  provinceId: 0, cityId: 0,// 0/0 = 全国；重庆 = 500000 / 500109
  keyword: '',             // 可选，按标题关键词
  orders: 'czx-update_time$2', // 最新；最热用 czx-download$2
  index: 1, size: 20
})
```

返回 `{ total, totalPage, rows: [...] }`。`rows` 已裁剪成：`documentId, title, school, schoolLevel, area, year, stage, subject, scenario, date, downloads, answer, quality, canDownload`。

**向用户汇报时只给表格摘要**（序号 / documentId / 标题 / 学校 / 年份 / 下载量 / 有无解析），不要把整页 JSON 打印出来。翻页改 `index`。

### 3.2 高考真题（特殊结构）

```js
async () => await window.__xkw.gaokaoPapers({ year: 2026, provinceId: '' })
```

返回：

```js
{
  year: 2026,
  years: [{ id, name }],
  groups: [{
    area: '全国一卷',
    intro: '适用地区：…',
    subjects: [{ subjectName: '数学', paperId: 58248364, analysisId: 58288230 }]
  }]
}
```

**关键：`paperId` 是原卷，通常 `hasTest=false`，不能在线练预览；`analysisId` 是参考版，才能预览题目。**
所以高考真题要预览时传 `altId`：

```js
async () => {
  const p = await window.__xkw.preview(58248364, { altId: 58288230, count: 5 });
  return p.markdown;
}
```

看版面用 `previewImages(paperId)`；下载时优先用 `paperId`（原卷），需要解析版时用 `analysisId`。

## 步骤 4 · 预览（默认动作）

### 4.1 单份卷，按需取题

```js
async () => {
  const p = await window.__xkw.preview(58816398, {
    count: 5,        // 取几题；不填 = 全部
    from: 1,         // 从第几题开始
    keyword: '',     // 可选：只保留题干/选项/解析含该词
    title: '重庆市南开中学校2025-2026学年高一下学期期末数学试题'
  });
  return p.markdown;
}
```

**给这次调用加上 `filename`**（例如 `.../预览-58816398.md`），让 Markdown 落盘，避免大段文本灌进上下文。返回给用户时只概括：总题数、预览题数、题型分布、代表题。

### 4.2 批量粗筛（推荐用于「找题材」）

先每份卷只看前 3 题，用最少调用判断值不值得深入：

```js
async () => {
  const ids = [111, 222, 333];
  const out = [];
  for (const id of ids) {
    const p = await window.__xkw.preview(id, { count: 3 });
    out.push({
      documentId: id,
      questionCount: p.questionCount,
      sample: p.items.map(q => `第${q.index}题/${q.type}/${q.difficulty}：${q.stem.slice(0, 60)}`)
    });
    await new Promise(r => setTimeout(r, 600));
  }
  return out;
}
```

### 4.3 只差特定知识点

用 `keyword` 过滤，或取全量后在 `items` 里筛：

```js
async () => {
  const p = await window.__xkw.preview(58816398, { count: 999 });
  return p.items.filter(q => (q.stem + q.explanation).includes('导数'));
}
```

### 4.4 看原卷版面

```js
async () => await window.__xkw.previewImages(58816398, true)
```

返回 `[{ fileName, fileTag: '原卷'|'解析', images: [jpg...] }]`。免费，用于确认版式、图表、听力材料。

## 步骤 5 · 下载（必须确认）

**只在用户明确要求时执行。** 一次下载 = 1 张券。

1. 查券并报告：

```js
async () => {
  const v = await window.__xkw.vouchers();
  return { available: v.availableCount };
}
```

2. 用户确认后，取下载页地址：

```js
async () => {
  const r = await window.__xkw.downloadSignal(58816398, {
    pageSize: 'A4',          // 'A4' 或 'A3'（A3 双栏）
    withAnswer: true,        // 解析版
    withQuestion: true       // 原卷版
  });
  return r.data && r.data.fileUrl;
}
```

`fileUrl` 是一个打包页，不是最终文件。调用这一步**已经扣券**。

3. 用脚本把打包页转成 zip 并解压：

```powershell
& "<本 skill 目录>\scripts\download.ps1" `
  -FileUrl "<上一步的 fileUrl>" `
  -OutDir "<工作目录>\橙子学找题\<主题>\58816398" `
  -Name "58816398"
```

脚本会：打开打包页 → 提取 `files.zxxk.com` 签名链接 → 下载 zip → 解压 → 列出 PDF。zip 内通常有两份：`(原卷版)` 和 `(解析版)`。

4. 汇报实际文件名和大小。

如果脚本报「没找到文件下载链接」，说明后台还在打包：等 3–5 秒重跑同一个 `download.ps1`（**不要重新调用 `downloadSignal`**，那会再扣一张券）。

## 步骤 6 · 落盘与汇报

建议目录：

```
<工作目录>/橙子学找题/<YYYY-MM-DD>-<主题>/
  index.md                  # 检索条件 + 候选表 + 最终选择与理由
  预览-<docId>.md           # 每份卷的题目预览
  <docId>/                  # 下载的 PDF（仅确有需要时）
```

`index.md` 至少写：检索条件、命中总数、选中哪几份（documentId + 标题 + 理由）、每份的题数/预览题数、是否下载。

## ID 速查（内容会随站点变化，以 `meta()` 为准）

**学段**：2 小学 · 3 初中 · 4 高中

**年级**：高中 10 高一 · 11 高二 · 12 高三（小学/初中用 `meta()` 查）

**学科**：1 语文 · 2 数学 · 3 英语 · 4 物理 · 5 化学 · 6 生物学 · 7 思想政治 · 8 历史 · 9 地理 · 12 信息技术 · 16 通用技术

**场景（`document/list`）**：904 阶段检测 · 420105 期中 · 420106 期末 · 420409 学考 · 906 名校

**高考模考**：全部 `scenarioId=907`；某场次 `scenarioId=420404/420405/420406/420407` + `parentScenarioId=907`（一模/二模/三模/模拟预测）

**高考真题**：不走 `document/list`，用 `gaokaoPapers()`；预览用 `analysisId`

**排序**：`czx-update_time$2` 最新 · `czx-download$2` 最热

**地区**：全国传 `provinceId: 0, cityId: 0`；重庆 `500000 / 500109`。其他地区用站点顶部的地区选择器确认，或问用户具体省市。

## 故障排查

| 现象 | 原因 / 处理 |
|---|---|
| `600 拒绝(1)：非法访问` | Cookie 会话过期或签名失效。导航到 `c.xkw.com`，确认已登录，重新注入 |
| `webpack require not found` | 页面没加载完或不是橙子学页面。等 2 秒重试 |
| `未找到 CryptoJS 模块` | 站点换构建。客户端会遍历 webpack 模块找 MD5+AES；若仍失败，报告用户 |
| `can-check-answer` 返回 600 / 无 questionIds | 该卷不支持在线练（详情里 `hasTest=false`）。高考真题改传 `altId=analysisId`；其他卷只能用图片预览或下载 |
| `document/list` 返回 500 | 参数组合不合法（例如 `stageId=0` 却传了具体 `gradeId`）。学段/年级要么都给具体值，要么都给 0 |
| 下载页提取不到链接 | 后台仍在打包。等 3–5 秒重跑 `download.ps1`，不要重调 `downloadSignal` |
| 券不足 | 停止，告诉用户剩余券数和所需券数 |
| 连续调用变慢/报错 | 降低频率，调用间隔 ≥ 500ms，不要并发 |

## 边界与合规

- 仅限**用户本人会员账号自用**：做个人备课、组卷、讲义、练习。
- 不转售、不公开分发、不上传到公开仓库；下载内容的版权归学科网及原学校。
- 不要绕过会员/券机制，不要并发轰炸接口，不要做全站爬取。
- 站点接口和签名可能随版本变化；本 skill 通过运行时读取签名算法，比硬编码更抗变更，但仍需在失败时回到页面重新确认。

## 接口细节

见 `references/api.md`。

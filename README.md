# czx-question-finder

> 橙子学（c.xkw.com，学科网学生版）找题 Agent Skill：在你自己已登录的浏览器里检索真题、预览题干/答案/解析，确需时再下载 PDF。

An Agent Skill for Claude Code. It does **not** export cookies, does **not** bypass membership, and does **not** run a scraping service. Every request is made inside your own logged-in page, with the site's own client-side signature.

## 功能

- 按学段 / 年级 / 学科 / 年份 / 地区 / 场景 / 关键词搜卷
- **免费**预览题目全文：题干、选项、答案、解析、难度、题型
- 原卷 / 解析逐页图片预览（看版面、图表、听力材料）
- 高考真题按卷型 / 科目定位；自动切到解析版（`analysisId`）预览
- 按需下载「原卷版 + 解析版」PDF
- 默认 **多预览、少下载**：下载前报剩余券数并等确认

## 成本

| 动作 | 消耗 |
|---|---|
| 搜卷、翻页、关键词 | 免费 |
| 题目全文预览 | 免费 |
| 原卷 / 解析图片预览 | 免费 |
| 下载 PDF（原卷 + 解析） | 1 张下载券 / 份 |

## 安装

```bash
git clone https://github.com/<your-name>/czx-question-finder.git \
  ~/.claude/skills/czx-question-finder
```

或者把本目录复制到：

```
~/.claude/skills/czx-question-finder/
```

### 前置条件

- Claude Code（支持 Skill）
- Playwright MCP，**扩展模式**，驱动你自己的 Chrome
- 已在 Chrome 登录 `c.xkw.com`，并拥有有效会员 / 下载券

## 使用

```
/czx-question-finder
```

或者直接用自然语言：

- 「在橙子学找 2026 年重庆高一期末数学卷，选 3 套」
- 「预览这套卷的第 18–22 题」
- 「把这道题下载成 PDF」

## 工作原理

1. 打开 `c.xkw.com` 页面，注入 `scripts/inject.js`
2. 从页面自身的 webpack 运行时借到 CryptoJS，按站内规则现场计算 `xkw-sign`
3. 所有 API 请求都在页面内发起，登录 Cookie 不离开浏览器
4. 下载时先拿打包页 URL，再由 `scripts/download.ps1` 提取签名直链、下载并解压

```
czx-question-finder/
├── SKILL.md                  # 流程、第一原则、故障排查
├── scripts/
│   ├── inject.js             # 页面内签名客户端（搜索 / 预览 / 高考真题 / 下载）
│   └── download.ps1          # 打包页 → zip → 解压 PDF
├── references/
│   └── api.md                # 接口与签名细节
└── README.md
```

## 隐私

- 不采集、不上传任何凭据
- 不包含遥测
- 不把 Cookie 写到磁盘或发给第三方

## 免责声明

- 非官方项目，与学科网 / 橙子学无任何关联。
- 仅供**个人学习与自用**。请遵守橙子学的用户协议与版权规定。
- 不要用于批量抓取、转售或公开分发站内内容。
- 站内接口与签名可能随前端版本变化而失效，这是正常现象。
- 使用本工具产生的任何后果由使用者自行承担。

## License

MIT

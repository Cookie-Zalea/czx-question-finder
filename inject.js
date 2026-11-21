async () => {
  // Injected into a logged-in c.xkw.com page. All API traffic stays inside the browser,
  // so the session cookie never leaves the page.
  if (window.__xkw && window.__xkw.__v === 2) return 'ready';

  // ---------- 1. borrow crypto-js from the page's webpack runtime ----------
  const chunkKey = Object.keys(window).find((k) => k.startsWith('webpackChunk'));
  if (!chunkKey) throw new Error('不是橙子学页面：未找到 webpack 运行时。请先打开 https://c.xkw.com/ 并确认已登录。');
  let req = null;
  window[chunkKey].push([[Math.floor(Math.random() * 1e9) + 7000], {}, (r) => { req = r; }]);
  if (!req) throw new Error('无法取得 webpack require');

  const tryModule = (id) => {
    try {
      const m = req(id);
      if (m && m.MD5 && m.AES && m.enc) return m;
    } catch (e) {}
    return null;
  };
  let C = tryModule(24873);
  if (!C && req.m) {
    for (const id of Object.keys(req.m)) {
      try {
        const src = String(req.m[id]);
        if (src.includes('MD5') && src.includes('AES') && src.includes('ZeroPadding')) {
          C = tryModule(id);
          if (C) break;
        }
      } catch (e) {}
    }
  }
  if (!C) throw new Error('未找到 CryptoJS 模块');
  window.__C = C;

  // ---------- 2. signer ----------
  const alg = { f3: 3, f4: 4, f2: 2, min: 88, def: 66 };
  const move = (ch) => ch.charCodeAt(0) >> (ch.charCodeAt(0) % alg.f4);
  const andOr = (e, t) => (e % alg.f2 === 0) ? (e & t) : (e | t);
  const firstMove = (e, t) => { let o = move(String.fromCharCode(e)); for (const ch of String(o)) o += andOr(ch.charCodeAt(0), t); return o; };
  const firstAndOr = (e, t) => { let o = andOr(e, t); for (const ch of String(o)) o += move(ch); return o; };
  const charResult = (e, t) => (e % alg.f3 > Math.ceil(alg.f3 / 2)) ? firstMove(e, t) : firstAndOr(e, t);

  let appId = null, secretPlain = null, initP = null;

  async function init() {
    const sj = await fetch('/api/v1/sign/new-app', { credentials: 'include' }).then((r) => r.json());
    const info = sj.data || sj;
    if (!info || !info.appId) throw new Error('获取签名信息失败：请确认当前页面已登录 c.xkw.com');
    const s = info.appId.split('|')[1] || '';
    let total = 0;
    for (let r = 0; r < s.length; r++) {
      const i = s.charCodeAt(r);
      total += i;
      const e = r < s.length - 1 ? s.charCodeAt(r + 1) : (i > alg.min ? i - alg.min : alg.def);
      total += charResult(i, e);
    }
    const aes = info.aesKeys[total % info.aesKeys.length];
    secretPlain = C.AES.decrypt(info.secret, C.enc.Utf8.parse(aes.key), {
      iv: C.enc.Utf8.parse(aes.iv), mode: C.mode.CBC, padding: C.pad.ZeroPadding
    }).toString(C.enc.Utf8);
    appId = info.appId;
  }

  async function ensure() {
    if (appId && secretPlain) return;
    if (!initP) initP = init().catch((e) => { initP = null; throw e; });
    await initP;
  }

  const T = (o) => Object.keys(o).filter((k) => o[k] !== undefined)
    .map((k) => `${k}|${o[k] === null ? '' : o[k]}`).sort().join('||');

  async function xkw(path, params, method, body) {
    await ensure();
    const clean = {};
    for (const [k, v] of Object.entries(params || {})) if (v !== undefined && v !== '' && v !== null) clean[k] = v;
    const qs = new URLSearchParams(clean).toString();
    const url = qs ? `${path}?${qs}` : path;
    const ts = parseInt(Date.now() / 1000);
    let signStr = T(clean);
    let payload;
    if (method && method !== 'GET') {
      payload = JSON.stringify(body === undefined ? {} : body);
      signStr = signStr ? `${signStr}||${payload}` : payload;
    }
    const md5 = C.MD5(`${appId}&${ts}&${signStr}&${secretPlain}`).toString().toLowerCase();
    const headers = { accept: 'application/json, text/plain, */*', 'xkw-client': 'czx', 'xkw-sign': `${appId}-${ts}-${md5}` };
    if (payload) headers['content-type'] = 'application/json';
    const r = await fetch(url, { method: method || 'GET', credentials: 'include', headers, body: payload });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { data = { raw: text.slice(0, 500) }; }
    return { status: r.status, data };
  }

  // ---------- 3. helpers ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function htmlToText(html) {
    if (!html) return '';
    let s = String(html);
    s = s.replace(/<math\b[^>]*\blatex="([^"]*)"[^>]*>[\s\S]*?<\/math>/gi, (m, tex) => ` ${tex} `);
    s = s.replace(/<img\b[^>]*\bsrc="([^"]*)"[^>]*>/gi, (m, src) => `\n![图](${src})\n`);
    s = s.replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, '\n');
    s = s.replace(/<br\s*\/?>/gi, '\n');
    s = s.replace(/<[^>]+>/g, '');
    s = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    s = s.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    return s;
  }

  async function meta(opts) {
    opts = opts || {};
    const stageId = opts.stageId === undefined ? 4 : opts.stageId;
    const gradeId = opts.gradeId === undefined ? 10 : opts.gradeId;
    const provinceId = opts.provinceId === undefined ? 0 : opts.provinceId;
    const [stages, grades, subjects, scenarios, years] = await Promise.all([
      xkw('/api/v1/student/basic/stages'),
      xkw('/api/v1/student/basic/grades', { partnerId: 0, stageId }),
      xkw('/api/v1/student/basic/subjects', { pageType: 1, withUnlimited: true, partnerId: 0, stageId, provinceId, gradeId }),
      xkw('/api/v1/student/basic/scenarios', { pageType: 1, withUnlimited: false, gradeId, stageId }),
      xkw('/api/v1/student/basic/years', { withUnlimited: true })
    ]);
    const norm = (r) => (Array.isArray(r.data) ? r.data : (r.data && r.data.list) || []);
    return {
      stages: norm(stages).map((x) => ({ id: x.id, name: x.name })),
      grades: norm(grades).map((x) => ({ id: x.id, name: x.name, stageId: x.stageId })),
      subjects: norm(subjects).map((x) => ({ id: x.id, name: x.name })),
      scenarios: norm(scenarios).map((x) => ({ id: x.id, name: x.name, children: (x.children || []).map((c) => ({ id: c.id, name: c.name })) })),
      years: norm(years).map((x) => ({ id: Number(x.id), name: x.name }))
    };
  }

  async function search(opts) {
    opts = opts || {};
    const p = Object.assign({
      index: 1, size: 20, year: 0, scenarioId: 420106, subjectId: 2,
      orders: 'czx-update_time$2', cityId: 0, provinceId: 0,
      gradeId: 0, stageId: 0, term: 'next'
    }, opts);
    for (const k of Object.keys(p)) if (p[k] === '' || p[k] === undefined) delete p[k];
    const r = await xkw('/api/v1/student/document/list', p);
    const d = r.data || {};
    return {
      status: r.status,
      total: d.total || 0,
      totalPage: d.totalPage || 0,
      page: p.index,
      rows: (d.result || []).map((x) => ({
        documentId: x.documentId,
        title: x.title,
        school: x.schoolName || '',
        schoolLevel: x.schoolLevelName || '',
        area: x.areaName || '',
        year: x.year,
        stage: x.stageName || '',
        subject: x.subjectName || '',
        scenario: x.scenarioName || '',
        date: x.updateTime || '',
        downloads: x.downloads || 0,
        answer: x.paperAttrName || '',
        quality: x.paperQualityName || '',
        canDownload: x.enableDownload !== false
      }))
    };
  }

  async function preview(documentId, opts) {
    opts = opts || {};
    let resourceId = String(documentId);
    let cc = await xkw('/api/v1/student/online-training/can-check-answer', null, 'POST', { resourceId, sourceFrom: 1 });
    // 高考真题的 paperId 通常 hasTest=false；解析版 analysisId 才能在线练。
    if ((cc.status !== 200 || !cc.data || !Array.isArray(cc.data.questionIds)) && opts.altId) {
      resourceId = String(opts.altId);
      cc = await xkw('/api/v1/student/online-training/can-check-answer', null, 'POST', { resourceId, sourceFrom: 1 });
    }
    if (cc.status !== 200 || !cc.data || !Array.isArray(cc.data.questionIds)) {
      return { error: `无法获取题目列表（${cc.status}）`, detail: JSON.stringify(cc.data).slice(0, 300) };
    }
    const ids = cc.data.questionIds;
    const from = Math.max(1, opts.from || 1);
    const count = Math.min(opts.count || ids.length, ids.length - from + 1);
    const selected = ids.slice(from - 1, from - 1 + count);
    const raw = [];
    const batch = opts.batch || 40;
    for (let i = 0; i < selected.length; i += batch) {
      const qs = selected.slice(i, i + batch).map((id, j) => ({ questionId: id, questionIndex: from + i + j }));
      const r = await xkw('/api/v1/student/paper/paper-questions-v2', null, 'POST', { resourceId, sourceFrom: 1, questions: qs });
      if (Array.isArray(r.data)) raw.push(...r.data);
      if (i + batch < selected.length) await sleep(400);
    }
    raw.sort((a, b) => (a.index || 0) - (b.index || 0));

    let items = raw.map((q) => ({
      id: q.id,
      index: q.index,
      type: q.questionTagName || '',
      difficulty: q.difficultyName || '',
      stem: htmlToText(q.stemNoOptions || q.stem),
      options: (q.optionsContents || []).map((o) => {
        const s = String(o);
        const i = s.indexOf('|||');
        return i < 0 ? { key: '', text: htmlToText(s) } : { key: s.slice(0, i), text: htmlToText(s.slice(i + 3)) };
      }),
      answer: (q.correctAnswers && q.correctAnswers.length) ? q.correctAnswers.join(', ') : htmlToText(q.answer),
      explanation: htmlToText(q.explanation),
      hasSubQuestions: !!q.hasSubQuestions
    }));

    if (opts.keyword) {
      const kw = String(opts.keyword);
      items = items.filter((q) => (q.stem + q.explanation + JSON.stringify(q.options)).includes(kw));
    }

    const head = [];
    if (opts.title) head.push(`# ${opts.title}`, '');
    head.push(`共 ${ids.length} 题，本次预览 ${items.length} 题（第 ${from} 题起）。`, '');
    const body = [];
    for (const q of items) {
      body.push(`## 第${q.index}题${q.type ? ' · ' + q.type : ''}${q.difficulty ? ' · 难度' + q.difficulty : ''}`, '');
      body.push(q.stem || '（题干为空）', '');
      for (const o of q.options) body.push(`${o.key}. ${o.text}`);
      if (q.options.length) body.push('');
      body.push(`**答案**：${q.answer || '—'}`, '');
      if (q.explanation) body.push('**解析**：', '', q.explanation, '');
      body.push('---', '');
    }
    return {
      documentId,
      resourceId,
      reportId: cc.data.reportId,
      questionCount: ids.length,
      got: items.length,
      markdown: head.join('\n') + '\n' + body.join('\n'),
      items
    };
  }

  async function gaokaoPapers(opts) {
    opts = opts || {};
    const year = opts.year || new Date().getFullYear();
    const [list, yrs] = await Promise.all([
      xkw('/api/v1/student/gaokao/paper', { type: opts.type || '', year, provinceId: opts.provinceId || '' }),
      xkw('/api/v1/student/gaokao/years')
    ]);
    const norm = (r) => (Array.isArray(r.data) ? r.data : (r.data && r.data.list) || []);
    return {
      year,
      years: norm(yrs).map((x) => ({ id: x.id ?? x.year, name: x.name ?? x.year })),
      groups: norm(list).map((g) => ({
        area: g.area,
        areaId: g.id,
        intro: g.intro || '',
        year: g.year,
        subjects: (g.subjects || []).map((s) => ({
          subjectName: s.subjectName,
          paperId: s.paperId || null,
          analysisId: s.analysisId || null
        }))
      }))
    };
  }

  async function info(documentId) {
    const r = await xkw(`/api/v1/student/document/info/${documentId}`);
    return r.data;
  }

  async function previewImages(documentId, full) {
    const r = await xkw(`/api/v1/student/document/img-preview-more/${documentId}`, { fullPreview: !!full });
    return r.data;
  }

  async function vouchers() {
    const r = await xkw('/api/v1/student/vip/download-vouchers');
    return r.data;
  }

  // NOTE: this call spends one download coupon. Only use after the user confirms.
  async function downloadSignal(documentId, opts) {
    opts = opts || {};
    const r = await xkw('/api/v1/student/download/signal', {
      documentId: String(documentId),
      withAnswer: opts.withAnswer === false ? false : true,
      withQuestion: opts.withQuestion === false ? false : true,
      pageSize: opts.pageSize || 'A4'
    });
    return r;
  }

  xkw.__v = 2;
  xkw.xkw = xkw;
  xkw.meta = meta;
  xkw.search = search;
  xkw.gaokaoPapers = gaokaoPapers;
  xkw.preview = preview;
  xkw.info = info;
  xkw.previewImages = previewImages;
  xkw.vouchers = vouchers;
  xkw.downloadSignal = downloadSignal;
  xkw.htmlToText = htmlToText;
  window.__xkw = xkw;

  await ensure();
  return 'ready';
}

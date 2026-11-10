/*
 * 買い物ホンネ帳 — 画面の動き
 * ビルド不要の素の JavaScript です。ページの切り替えは URL の # の後ろで行います。
 *
 *   #/                     トップ
 *   #/board/osusume        ◎ まじでおすすめ（kaizen = △ 改善してほしい / kauna = × 絶対買うな）
 *   #/theme/筋トレするなら    テーマ別
 *   #/companies            企業の一覧
 *   #/company/ローソン       企業ごとのページ
 *   #/product/<商品キー>     商品ページ
 *   #/new                  新商品（毎日自動で取り込み）
 *   #/post                 投稿フォーム
 *   #/about                このサイトについて
 */
(function () {
  "use strict";

  // ------------------------------------------------------------------ 設定

  const CFG = window.HONNE_CONFIG || {};
  const SUPABASE_URL = String(CFG.supabaseUrl || "").trim().replace(/\/+$/, "");
  const SUPABASE_KEY = String(CFG.supabaseKey || "").trim();
  const DEMO = !(SUPABASE_URL && SUPABASE_KEY);

  const VERDICTS = {
    osusume: { mark: "◎", label: "まじでおすすめ", cls: "v-good", tone: "good", desc: "人にすすめたくなったもの。リピート確定のやつ。" },
    kaizen: { mark: "△", label: "改善してほしい", cls: "v-fix", tone: "fix", desc: "ここさえ直れば最高なのに、というもの。メーカーさんに届け。" },
    kauna: { mark: "×", label: "絶対買うな", cls: "v-bad", tone: "bad", desc: "お金と時間をムダにした話。同じ思いをする人を減らしたい。" },
  };
  const VERDICT_IDS = ["osusume", "kaizen", "kauna"];
  const THEME_SUGGESTIONS = ["筋トレするなら"];
  const PLACEHOLDERS = {
    osusume: "どこがよかった？（例: 3日使っただけで違いがわかった）",
    kaizen: "どこを直してほしい？（例: 殻が剥きづらくて、白身が半分なくなった）",
    kauna: "なにがダメだった？（例: 1週間で壊れた、説明と全然違った）",
    "": "使ってみてどうだった？",
  };

  // 表記ゆれをまとめる（左が正式名）
  const COMPANY_ALIASES = {
    "セブン-イレブン": ["セブンイレブン", "セブン‐イレブン", "セブン−イレブン", "セブン", "セブイレ", "7-11", "7-eleven", "seven-eleven", "seveneleven"],
    "ファミリーマート": ["ファミマ", "familymart", "family mart", "famima"],
    "ローソン": ["lawson"],
  };

  const LIMITS = { name: 80, company: 40, theme: 20, body: 400, alt: 80, nickname: 20 };
  const POST_COOLDOWN_MS = 20_000;

  // ------------------------------------------------------------------ 小道具

  const app = document.getElementById("app");
  const enc = encodeURIComponent;
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // 比較用に文字をそろえる（全角半角・大文字小文字・空白や記号の違いを無視）
  function normKey(s) {
    return String(s || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[\s・･\-‐‑–—−_.,、。!?'"「」『』()\[\]【】〈〉《》]/g, "");
  }

  // 文字列から短いIDを作る（同じ企業名＋商品名なら、だれが投稿しても同じ商品になる）
  function hash53(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  }
  const userProductKey = (company, name) => "u-" + hash53(normKey(company) + "|" + normKey(name)).toString(36);

  function fmtDate(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
  }
  function fmtDateTime(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    const p = (n) => String(n).padStart(2, "0");
    return `${fmtDate(iso)} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  const fmtDay = (ymd) => (ymd ? ymd.replace(/-/g, ".") : "");

  const store = {
    get(k, fallback) {
      try {
        const v = localStorage.getItem(k);
        return v == null ? fallback : JSON.parse(v);
      } catch (e) {
        return fallback;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, JSON.stringify(v));
      } catch (e) {
        /* 保存できない環境（プライベートモードなど）では何もしない */
      }
    },
  };

  function clientId() {
    let id = store.get("honne.client", null);
    if (!id) {
      id = window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
      store.set("honne.client", id);
    }
    return id;
  }

  // ------------------------------------------------------------------ データの読み書き

  const REVIEW_COLUMNS = "id,product_key,product_name,company,verdict,theme,body,alt,nickname,created_at";

  function supabaseApi() {
    const baseHeaders = { apikey: SUPABASE_KEY };
    // 新しい publishable key (sb_publishable_...) は apikey ヘッダーだけ、古い anon key は両方に入れる
    if (!SUPABASE_KEY.startsWith("sb_")) baseHeaders.Authorization = "Bearer " + SUPABASE_KEY;

    async function rest(path, opts = {}) {
      const headers = { ...baseHeaders };
      if (opts.body) headers["Content-Type"] = "application/json";
      if (opts.prefer) headers.Prefer = opts.prefer;
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        method: opts.method || "GET",
        headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
      if (!res.ok) {
        let msg = "";
        try {
          msg = (await res.json()).message || "";
        } catch (e) {
          /* 本文なし */
        }
        const err = new Error(msg || "HTTP " + res.status);
        err.status = res.status;
        throw err;
      }
      const t = await res.text();
      return t ? JSON.parse(t) : null;
    }

    return {
      loadReviews: () => rest(`reviews?select=${REVIEW_COLUMNS}&order=created_at.desc&limit=1000`),
      loadAgrees: () => rest("agree_counts?select=review_id,n&order=n.desc&limit=1000"),
      async addReview(row) {
        const rows = await rest(`reviews?select=${REVIEW_COLUMNS}`, { method: "POST", body: row, prefer: "return=representation" });
        return rows[0];
      },
      async addAgree(reviewId) {
        try {
          await rest("agrees", { method: "POST", body: { review_id: reviewId, client_id: clientId() }, prefer: "return=minimal" });
        } catch (e) {
          if (e.status !== 409) throw e; // 409 = すでに押している
        }
      },
      report: (reviewId) => rest("reports", { method: "POST", body: { review_id: reviewId }, prefer: "return=minimal" }),
    };
  }

  // お試しモード: Supabase をつなぐ前でも動きを確かめられるよう、ブラウザの中にだけ保存する
  function demoApi() {
    const KEY = "honne.demo.reviews";
    const AGREE = "honne.demo.agrees";
    const sample = [
      {
        id: "demo-sample-1",
        product_key: userProductKey("ローソン", "半熟ゆで卵"),
        product_name: "半熟ゆで卵",
        company: "ローソン",
        verdict: "kaizen",
        theme: null,
        body: "殻がめっちゃ剥きづらい。白身が殻にくっついてきて、半分くらい捨てるはめになった。いつもはファミマで買っていて、こんなことはなかった。",
        alt: "ファミリーマートの半熟ゆで卵",
        nickname: "管理人",
        created_at: "2026-11-09T12:00:00+09:00",
      },
    ];
    const list = () => store.get(KEY, null) || sample.slice();
    return {
      loadReviews: async () => list(),
      loadAgrees: async () => Object.entries(store.get(AGREE, {})).map(([review_id, n]) => ({ review_id, n })),
      async addReview(row) {
        const saved = { ...row, id: "demo-" + Date.now().toString(36), created_at: new Date().toISOString() };
        store.set(KEY, [saved, ...list()]);
        return saved;
      },
      async addAgree(id) {
        const m = store.get(AGREE, {});
        m[id] = (m[id] || 0) + 1;
        store.set(AGREE, m);
      },
      report: async () => {},
    };
  }

  const api = DEMO ? demoApi() : supabaseApi();

  // ------------------------------------------------------------------ 状態

  const S = {
    loading: true,
    reviews: [], // 新しい順
    agrees: new Map(), // review_id -> 件数
    catalog: [], // data/products.json の商品
    catalogUpdated: "",
    reviewsError: "",
    catalogError: "",
    myAgrees: new Set(store.get("honne.agreed", [])),
    reported: new Set(store.get("honne.reported", [])),
    armedReport: null,
  };
  let IDX = null;

  function isValidReview(r) {
    return r && typeof r === "object" && VERDICTS[r.verdict] && r.product_key && r.product_name && r.company && r.body;
  }

  function emptyCounts() {
    return { osusume: 0, kaizen: 0, kauna: 0 };
  }

  // 商品・企業・テーマの索引を作る
  function buildIndex() {
    const products = new Map();
    const companies = new Map();
    const themes = new Map();
    const catalogByName = new Map();

    const companyOf = (name) => {
      const k = normKey(name);
      let c = companies.get(k);
      if (!c) {
        c = { name, key: k, productKeys: new Set(), counts: emptyCounts(), reviews: 0, catalog: 0, lastAt: "" };
        companies.set(k, c);
      }
      return c;
    };

    for (const p of S.catalog) {
      if (!p || !p.id || !p.name || !p.company) continue;
      products.set(p.id, {
        key: p.id,
        name: p.name,
        company: p.company,
        category: p.category || "",
        price: p.price || "",
        release: p.release || "",
        url: p.url || "",
        firstSeen: p.firstSeen || "",
        official: true,
        counts: emptyCounts(),
        reviews: [],
        lastAt: "",
      });
      catalogByName.set(normKey(p.company) + "|" + normKey(p.name), p.id);
      const c = companyOf(p.company);
      c.productKeys.add(p.id);
      c.catalog++;
    }

    for (const r of S.reviews) {
      let prod = products.get(r.product_key);
      if (!prod) {
        prod = {
          key: r.product_key,
          name: r.product_name,
          company: r.company,
          category: "",
          price: "",
          release: "",
          url: "",
          firstSeen: "",
          official: false,
          counts: emptyCounts(),
          reviews: [],
          lastAt: "",
        };
        products.set(prod.key, prod);
      }
      prod.reviews.push(r);
      prod.counts[r.verdict]++;
      if (r.created_at > prod.lastAt) prod.lastAt = r.created_at;

      const c = companyOf(prod.company);
      c.productKeys.add(prod.key);
      c.reviews++;
      c.counts[r.verdict]++;
      if (r.created_at > c.lastAt) c.lastAt = r.created_at;

      if (r.theme) {
        let t = themes.get(r.theme);
        if (!t) {
          t = { name: r.theme, count: 0, counts: emptyCounts(), lastAt: "" };
          themes.set(r.theme, t);
        }
        t.count++;
        t.counts[r.verdict]++;
        if (r.created_at > t.lastAt) t.lastAt = r.created_at;
      }
    }
    return { products, companies, themes, catalogByName };
  }

  function canonicalCompany(input) {
    const raw = String(input || "").normalize("NFKC").trim();
    const k = normKey(raw);
    for (const [name, aliases] of Object.entries(COMPANY_ALIASES)) {
      if (normKey(name) === k || aliases.some((a) => normKey(a) === k)) return name;
    }
    const known = IDX && IDX.companies.get(k);
    return known ? known.name : raw;
  }

  function canonicalTheme(input) {
    const raw = String(input || "").normalize("NFKC").trim();
    if (!raw) return "";
    const k = normKey(raw);
    for (const t of [...(IDX ? IDX.themes.keys() : []), ...THEME_SUGGESTIONS]) {
      if (normKey(t) === k) return t;
    }
    return raw;
  }

  // ------------------------------------------------------------------ 部品

  function verdictBadge(id) {
    const v = VERDICTS[id];
    return `<span class="verdict ${v.cls}"><span aria-hidden="true">${v.mark}</span>${v.label}</span>`;
  }

  function tally(counts) {
    const total = counts.osusume + counts.kaizen + counts.kauna;
    if (!total) return `<span class="tally-zero">まだ評価なし</span>`;
    return `<span class="tally" aria-label="おすすめ${counts.osusume}件、改善してほしい${counts.kaizen}件、買うな${counts.kauna}件">
      <span><span class="mark mark-good">◎</span> <b>${counts.osusume}</b></span>
      <span><span class="mark mark-fix">△</span> <b>${counts.kaizen}</b></span>
      <span><span class="mark mark-bad">×</span> <b>${counts.kauna}</b></span>
    </span>`;
  }

  function vbar(counts) {
    const total = counts.osusume + counts.kaizen + counts.kauna;
    if (!total) return `<div class="vbar" aria-hidden="true"></div>`;
    const pct = (n) => ((n / total) * 100).toFixed(1) + "%";
    return `<div class="vbar" aria-hidden="true">
      <span class="seg-good" style="width:${pct(counts.osusume)}"></span>
      <span class="seg-fix" style="width:${pct(counts.kaizen)}"></span>
      <span class="seg-bad" style="width:${pct(counts.kauna)}"></span>
    </div>`;
  }

  function reviewCard(r, opts = {}) {
    const showProduct = opts.showProduct !== false;
    const n = S.agrees.get(r.id) || 0;
    const agreed = S.myAgrees.has(r.id);
    const reported = S.reported.has(r.id);
    const armed = S.armedReport === r.id;
    return `<article class="Box review">
      <div class="Box-header review-head">
        ${verdictBadge(r.verdict)}
        ${r.theme ? `<a class="tag" href="#/theme/${enc(r.theme)}">${esc(r.theme)}</a>` : ""}
        <time class="review-date text-mono" datetime="${esc(r.created_at)}">${fmtDate(r.created_at)}</time>
      </div>
      <div class="Box-body">
        ${
          showProduct
            ? `<p class="review-company"><a href="#/company/${enc(r.company)}">${esc(r.company)}</a></p>
               <h3 class="review-product"><a href="#/product/${enc(r.product_key)}">${esc(r.product_name)}</a></h3>`
            : ""
        }
        <p class="review-text">${esc(r.body)}</p>
        ${r.alt ? `<p class="review-alt"><span class="review-alt-label">代わりにこれ</span>${esc(r.alt)}</p>` : ""}
        <div class="review-foot">
          <span class="review-nick">${esc(r.nickname || "名無しさん")}</span>
          <button type="button" class="btn btn-sm agree-btn" data-agree="${esc(r.id)}" aria-pressed="${agreed}" ${agreed ? "disabled" : ""}
            title="${agreed ? "わかる を押しました" : "共感したら押してください"}">わかる <span class="Counter">${n}</span></button>
          ${
            reported
              ? `<span class="report-btn">通報済み</span>`
              : `<button type="button" class="btn-link report-btn${armed ? " armed" : ""}" data-report="${esc(r.id)}">${armed ? "架空・荒らしとして通報する" : "通報"}</button>`
          }
        </div>
      </div>
    </article>`;
  }

  function reviewList(list, opts) {
    return `<div class="stack">${list.map((r) => reviewCard(r, opts)).join("")}</div>`;
  }

  function productCard(p) {
    const meta = [p.category, p.price, p.release ? `${fmtDay(p.release)}発売` : ""].filter(Boolean).join("・");
    return `<div class="pcard">
      <span class="pcard-company">${esc(p.company)}</span>
      <a class="pcard-name" href="#/product/${enc(p.key)}">${esc(p.name)}</a>
      ${meta ? `<span class="pcard-meta">${esc(meta)}</span>` : ""}
      ${tally(p.counts)}
      <a class="btn btn-sm" href="#/post/${enc(p.key)}">評価する</a>
    </div>`;
  }

  function productRow(p, opts = {}) {
    const meta = [
      opts.showCompany ? p.company : "",
      p.category,
      p.price,
      p.release ? `${fmtDay(p.release)}発売` : "",
      !p.official ? "訪問者が追加" : "",
    ].filter(Boolean);
    return `<li class="prow">
      <div class="prow-main">
        <a class="prow-name" href="#/product/${enc(p.key)}">${esc(p.name)}</a>
        ${meta.length ? `<span class="prow-meta">${meta.map((m) => `<span>${esc(m)}</span>`).join("")}</span>` : ""}
      </div>
      <div class="prow-side">
        ${tally(p.counts)}
        <a class="btn btn-sm" href="#/post/${enc(p.key)}">評価する</a>
      </div>
    </li>`;
  }

  function emptyBox(message, action) {
    return `<div class="empty"><p>${message}</p>${action || ""}</div>`;
  }

  function loadingBox() {
    return `<p class="color-fg-muted">読み込み中…</p>`;
  }

  function banners() {
    const out = [];
    if (DEMO) {
      out.push(`<div class="banner banner-warn"><p><strong>お試しモード：</strong>投稿はこのブラウザの中にだけ保存され、ほかの人には見えません。</p>
        <p>みんなで共有するには、README の「手順2」で Supabase をつないでください。</p></div>`);
    }
    if (S.reviewsError) out.push(`<div class="banner banner-error"><p>${esc(S.reviewsError)}</p></div>`);
    if (S.catalogError) out.push(`<div class="banner banner-error"><p>${esc(S.catalogError)}</p></div>`);
    return out.join("");
  }

  function sortReviews(list, sort) {
    if (sort !== "agree") return list;
    return list.slice().sort((a, b) => (S.agrees.get(b.id) || 0) - (S.agrees.get(a.id) || 0) || (b.created_at > a.created_at ? 1 : -1));
  }

  function sortChips(baseHash, sort) {
    return `<div class="BtnGroup" role="group" aria-label="並び順">
      <a class="btn btn-sm BtnGroup-item" href="${baseHash}" aria-current="${sort !== "agree"}">新着順</a>
      <a class="btn btn-sm BtnGroup-item" href="${baseHash}${baseHash.includes("?") ? "&" : "?"}sort=agree" aria-current="${sort === "agree"}">わかる順</a>
    </div>`;
  }

  // ------------------------------------------------------------------ ページ

  function pageHome() {
    const reviews = S.reviews;
    const companiesCount = IDX.companies.size;

    const boards = VERDICT_IDS.map((id) => {
      const v = VERDICTS[id];
      const list = reviews.filter((r) => r.verdict === id);
      const rows = list
        .slice(0, 3)
        .map(
          (r) => `<a class="mini" href="#/product/${enc(r.product_key)}">
            <span class="mini-company">${esc(r.company)}</span>
            <span class="mini-name">${esc(r.product_name)}</span>
            <span class="mini-text">${esc(r.body)}</span>
          </a>`
        )
        .join("");
      return `<div class="Box board-col">
        <div class="Box-header">
          <a class="board-title" href="#/board/${id}"><span class="mark mark-${v.tone}">${v.mark}</span> ${v.label}</a>
          <span class="Counter">${list.length}</span>
        </div>
        <div class="Box-body">${rows || `<p class="mini-empty">${S.loading ? "読み込み中…" : "まだ投稿がありません"}</p>`}</div>
        <a class="board-more" href="#/board/${id}">すべて見る →</a>
      </div>`;
    }).join("");

    const themeList = [...IDX.themes.values()].sort((a, b) => b.count - a.count || (b.lastAt > a.lastAt ? 1 : -1));
    for (const s of THEME_SUGGESTIONS) if (!IDX.themes.has(s)) themeList.push({ name: s, count: 0 });
    const themeChips = themeList
      .slice(0, 20)
      .map((t) => `<a class="chip" href="#/theme/${enc(t.name)}">${esc(t.name)} <span class="Counter">${t.count}</span></a>`)
      .join("");

    const companyList = [...IDX.companies.values()].sort((a, b) => b.reviews - a.reviews || b.catalog - a.catalog || a.name.localeCompare(b.name, "ja"));
    const companyChips = companyList
      .slice(0, 12)
      .map((c) => `<a class="chip" href="#/company/${enc(c.name)}">${esc(c.name)} <span class="Counter">${c.reviews}</span></a>`)
      .join("");

    // まだ評価のない新商品を、各社から少しずつ
    const fresh = [];
    const perCompany = new Map();
    for (const p of [...IDX.products.values()].filter((p) => p.official && p.reviews.length === 0)) {
      const n = perCompany.get(p.company) || 0;
      if (n >= 2) continue;
      perCompany.set(p.company, n + 1);
      fresh.push(p);
      if (fresh.length >= 6) break;
    }

    return `
      ${banners()}
      <section class="intro">
        <h1 class="intro-title">買い物ホンネ帳</h1>
        <p class="intro-lead">毎日使うモノの「まじでおすすめ」「改善してほしい」「絶対買うな」を、使った人が書き足していくサイトです。ログインなしで、だれでも書けます。</p>
        <div class="intro-actions">
          <a class="btn btn-primary" href="#/post">投稿する</a>
          <a class="btn" href="#/new">新商品を評価する</a>
        </div>
        <p class="intro-stats text-mono">投稿 ${S.loading ? "–" : reviews.length} ・ 商品 ${IDX.products.size} ・ 企業 ${companiesCount}</p>
      </section>

      <section class="section" aria-labelledby="h-boards">
        <div class="section-head"><h2 class="section-title" id="h-boards">判定で見る</h2></div>
        <div class="grid-3">${boards}</div>
      </section>

      <section class="section" aria-labelledby="h-themes">
        <div class="section-head">
          <h2 class="section-title" id="h-themes">テーマで見る</h2>
          <span class="color-fg-muted f6">テーマは投稿するときに自由に作れます</span>
        </div>
        <div class="chips">${themeChips}<a class="chip chip-new" href="#/post">＋ 新しいテーマで投稿</a></div>
      </section>

      <section class="section" aria-labelledby="h-companies">
        <div class="section-head">
          <h2 class="section-title" id="h-companies">企業で見る</h2>
          <a class="section-link" href="#/companies">すべての企業 →</a>
        </div>
        <div class="chips">${companyChips || `<span class="color-fg-muted">${S.loading ? "読み込み中…" : "まだありません"}</span>`}</div>
      </section>

      <section class="section" aria-labelledby="h-fresh">
        <div class="section-head">
          <h2 class="section-title" id="h-fresh">まだ評価のない新商品</h2>
          <a class="section-link" href="#/new">新商品をすべて見る →</a>
        </div>
        ${fresh.length ? `<div class="cards">${fresh.map(productCard).join("")}</div>` : S.loading ? loadingBox() : emptyBox("いまは評価待ちの新商品がありません。")}
      </section>

      <section class="section" aria-labelledby="h-latest">
        <div class="section-head"><h2 class="section-title" id="h-latest">新着の投稿</h2></div>
        ${
          S.loading
            ? loadingBox()
            : reviews.length
              ? reviewList(reviews.slice(0, 15))
              : emptyBox("まだ投稿がありません。最初の1件を書いてみませんか。", `<a class="btn btn-primary" href="#/post">投稿する</a>`)
        }
      </section>`;
  }

  function pageBoard(id, params) {
    const v = VERDICTS[id];
    const sort = params.get("sort") === "agree" ? "agree" : "new";
    const company = params.get("company") || "";
    let list = S.reviews.filter((r) => r.verdict === id);
    const companiesHere = new Map();
    for (const r of list) companiesHere.set(r.company, (companiesHere.get(r.company) || 0) + 1);
    if (company) list = list.filter((r) => r.company === company);
    list = sortReviews(list, sort);

    const base = `#/board/${id}`;
    const chips = [...companiesHere.entries()].sort((a, b) => b[1] - a[1]);
    const companyChips = chips.length
      ? `<div class="chips">
          <a class="chip" href="${base}" aria-current="${!company}">すべての企業</a>
          ${chips.map(([c, n]) => `<a class="chip" href="${base}?company=${enc(c)}" aria-current="${company === c}">${esc(c)} <span class="Counter">${n}</span></a>`).join("")}
        </div>`
      : "";

    return `
      ${banners()}
      <div class="page-head">
        <h1><span class="mark mark-${v.tone}">${v.mark}</span> ${v.label}</h1>
        <p>${v.desc}</p>
      </div>
      ${companyChips}
      <div class="section-head">
        <span class="color-fg-muted f6">${S.loading ? "読み込み中…" : `${list.length}件`}</span>
        <div class="d-flex flex-items-center" style="gap:8px">
          ${sortChips(company ? `${base}?company=${enc(company)}` : base, sort)}
          <a class="btn btn-sm btn-primary" href="#/post?verdict=${id}">投稿する</a>
        </div>
      </div>
      ${
        S.loading
          ? loadingBox()
          : list.length
            ? reviewList(list)
            : emptyBox(`「${v.label}」の投稿はまだありません。`, `<a class="btn btn-primary" href="#/post?verdict=${id}">最初の1件を書く</a>`)
      }`;
  }

  function pageTheme(name, params) {
    const verdict = VERDICTS[params.get("verdict")] ? params.get("verdict") : "";
    const sort = params.get("sort") === "agree" ? "agree" : "new";
    const t = IDX.themes.get(name);
    let list = S.reviews.filter((r) => r.theme === name);
    if (verdict) list = list.filter((r) => r.verdict === verdict);
    list = sortReviews(list, sort);
    const counts = t ? t.counts : emptyCounts();
    const base = `#/theme/${enc(name)}`;

    return `
      ${banners()}
      <div class="page-head">
        <p class="crumbs"><a href="#/">ホーム</a> / テーマ</p>
        <h1>${esc(name)}</h1>
        <p>このテーマで投稿された ◎ おすすめ・△ 改善してほしい・× 買うな の一覧です。</p>
      </div>
      <div class="chips">
        <a class="chip" href="${base}" aria-current="${!verdict}">すべて <span class="Counter">${t ? t.count : 0}</span></a>
        ${VERDICT_IDS.map(
          (id) => `<a class="chip" href="${base}?verdict=${id}" aria-current="${verdict === id}"><span class="mark mark-${VERDICTS[id].tone}">${VERDICTS[id].mark}</span>${VERDICTS[id].label} <span class="Counter">${counts[id]}</span></a>`
        ).join("")}
      </div>
      <div class="section-head">
        <span class="color-fg-muted f6">${S.loading ? "読み込み中…" : `${list.length}件`}</span>
        <div class="d-flex flex-items-center" style="gap:8px">
          ${sortChips(verdict ? `${base}?verdict=${verdict}` : base, sort)}
          <a class="btn btn-sm btn-primary" href="#/post?theme=${enc(name)}">このテーマで投稿</a>
        </div>
      </div>
      ${
        S.loading
          ? loadingBox()
          : list.length
            ? reviewList(list)
            : emptyBox(`「${esc(name)}」の投稿はまだありません。`, `<a class="btn btn-primary" href="#/post?theme=${enc(name)}">最初の1件を書く</a>`)
      }`;
  }

  function companyCard(c) {
    return `<a class="ccard" href="#/company/${enc(c.name)}">
      <span class="ccard-name">${esc(c.name)}</span>
      <span class="ccard-meta">商品 ${c.productKeys.size} ・ 投稿 ${c.reviews}</span>
      ${tally(c.counts)}
      ${vbar(c.counts)}
    </a>`;
  }

  function sortedCompanies(q) {
    const k = normKey(q);
    const alias = normKey(canonicalCompany(q)); // 「ファミマ」→「ファミリーマート」
    return [...IDX.companies.values()]
      .filter((c) => !k || c.key.includes(k) || c.key === alias)
      .sort((a, b) => b.reviews - a.reviews || b.productKeys.size - a.productKeys.size || a.name.localeCompare(b.name, "ja"));
  }

  function pageCompanies(params) {
    const q = params.get("q") || "";
    const list = sortedCompanies(q);
    return `
      ${banners()}
      <div class="page-head">
        <h1>企業から探す</h1>
        <p>メーカーやお店ごとに、◎△× がどれくらい集まっているかを見られます。</p>
      </div>
      <div class="field" style="max-width:420px">
        <label for="companySearch" class="sr-only">企業名で絞り込む</label>
        <input id="companySearch" class="form-control" type="search" placeholder="企業名で絞り込む（例: ローソン、無印）" value="${esc(q)}" autocomplete="off">
      </div>
      <div class="grid-3" id="companyGrid">${companyGridHtml(list)}</div>`;
  }

  function companyGridHtml(list) {
    if (S.loading && !list.length) return loadingBox();
    if (!list.length) return emptyBox("該当する企業がありません。投稿すると企業ページが自動でできます。", `<a class="btn" href="#/post">投稿する</a>`);
    return list.map(companyCard).join("");
  }

  function pageCompany(name) {
    const c = IDX.companies.get(normKey(name));
    if (!c) {
      if (S.loading) return loadingBox();
      return `${banners()}
        <div class="page-head"><p class="crumbs"><a href="#/companies">企業</a></p><h1>${esc(name)}</h1></div>
        ${emptyBox("この企業の商品はまだありません。", `<a class="btn btn-primary" href="#/post?company=${enc(name)}">この企業の商品を投稿する</a>`)}`;
    }
    const prods = [...c.productKeys].map((k) => IDX.products.get(k)).filter(Boolean);
    const rated = prods.filter((p) => p.reviews.length).sort((a, b) => b.reviews.length - a.reviews.length || (b.lastAt > a.lastAt ? 1 : -1));
    const unrated = prods.filter((p) => !p.reviews.length && p.official).sort((a, b) => (b.firstSeen || "").localeCompare(a.firstSeen || "") || (b.release || "").localeCompare(a.release || ""));
    const reviews = S.reviews.filter((r) => normKey(r.company) === c.key);
    const SHOW = 30;

    return `
      ${banners()}
      <div class="page-head">
        <p class="crumbs"><a href="#/companies">企業</a> / ${esc(c.name)}</p>
        <h1>${esc(c.name)}</h1>
        <p>商品 ${prods.length} ・ 投稿 ${c.reviews}${c.catalog ? ` ・ うち ${c.catalog} 商品は公式サイトの新商品から自動で取り込み` : ""}</p>
      </div>
      <div class="product-score">
        ${tally(c.counts)}
        ${vbar(c.counts)}
        <div><a class="btn btn-sm btn-primary" href="#/post?company=${enc(c.name)}">${esc(c.name)}の商品を投稿する</a></div>
      </div>

      <section class="section" aria-labelledby="h-rated">
        <div class="section-head"><h2 class="section-title" id="h-rated">評価された商品</h2><span class="color-fg-muted f6">${rated.length}件</span></div>
        ${rated.length ? `<ul class="Box plist">${rated.map((p) => productRow(p)).join("")}</ul>` : emptyBox("まだ評価された商品はありません。")}
      </section>

      <section class="section" aria-labelledby="h-creviews">
        <div class="section-head"><h2 class="section-title" id="h-creviews">新着の投稿</h2><span class="color-fg-muted f6">${reviews.length}件</span></div>
        ${reviews.length ? reviewList(reviews.slice(0, 20)) : emptyBox("まだ投稿がありません。")}
      </section>

      ${
        unrated.length
          ? `<section class="section" aria-labelledby="h-unrated">
              <div class="section-head">
                <h2 class="section-title" id="h-unrated">まだ評価のない新商品</h2>
                <a class="section-link" href="#/new?company=${enc(c.name)}">${unrated.length}件すべて見る →</a>
              </div>
              <ul class="Box plist">${unrated.slice(0, SHOW).map((p) => productRow(p)).join("")}</ul>
            </section>`
          : ""
      }`;
  }

  function pageProduct(key) {
    const p = IDX.products.get(key);
    if (!p) {
      if (S.loading) return loadingBox();
      return `${banners()}${emptyBox("この商品は見つかりませんでした。削除されたか、まだ読み込まれていない可能性があります。", `<a class="btn" href="#/">ホームへ</a>`)}`;
    }
    const meta = [
      p.category,
      p.price,
      p.release ? `${fmtDay(p.release)}発売` : "",
      p.official ? "公式サイトの新商品から自動で取り込み" : "訪問者が追加した商品",
    ].filter(Boolean);
    return `
      ${banners()}
      <div class="page-head">
        <p class="crumbs"><a href="#/companies">企業</a> / <a href="#/company/${enc(p.company)}">${esc(p.company)}</a></p>
        <h1>${esc(p.name)}</h1>
        <p class="product-meta">${meta.map((m) => `<span>${esc(m)}</span>`).join("")}
          ${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">公式ページ ↗</a>` : ""}</p>
      </div>
      <div class="product-score">
        ${tally(p.counts)}
        ${vbar(p.counts)}
        <div><a class="btn btn-primary" href="#/post/${enc(p.key)}">この商品を評価する</a></div>
      </div>
      <section class="section" aria-labelledby="h-previews">
        <div class="section-head"><h2 class="section-title" id="h-previews">みんなの評価</h2><span class="color-fg-muted f6">${p.reviews.length}件</span></div>
        ${
          p.reviews.length
            ? reviewList(p.reviews, { showProduct: false })
            : emptyBox("まだ評価がありません。使ったことがあれば、最初の1件を書いてください。", `<a class="btn btn-primary" href="#/post/${enc(p.key)}">評価する</a>`)
        }
      </section>`;
  }

  function pageNew(params) {
    const company = params.get("company") || "";
    const q = params.get("q") || "";
    const all = [...IDX.products.values()]
      .filter((p) => p.official)
      .sort((a, b) => (b.firstSeen || "").localeCompare(a.firstSeen || "") || (b.release || "").localeCompare(a.release || ""));
    const companies = new Map();
    for (const p of all) companies.set(p.company, (companies.get(p.company) || 0) + 1);
    const updated = S.catalogUpdated ? fmtDateTime(S.catalogUpdated) : "";

    return `
      ${banners()}
      <div class="page-head">
        <h1>新商品</h1>
        <p>各社の公式サイトの「新商品」ページから、毎日1回自動で取り込んでいます。食べた・使ったものがあれば評価してください。${updated ? `<br><span class="f6">最終更新: ${esc(updated)}</span>` : ""}</p>
      </div>
      <div class="chips">
        <a class="chip" href="#/new" aria-current="${!company}">すべて <span class="Counter">${all.length}</span></a>
        ${[...companies.entries()].map(([c, n]) => `<a class="chip" href="#/new?company=${enc(c)}" aria-current="${company === c}">${esc(c)} <span class="Counter">${n}</span></a>`).join("")}
      </div>
      <div class="field" style="max-width:420px">
        <label for="newSearch" class="sr-only">商品名で絞り込む</label>
        <input id="newSearch" class="form-control" type="search" placeholder="商品名で絞り込む（例: おむすび、ラテ）" value="${esc(q)}" autocomplete="off" data-company="${esc(company)}">
      </div>
      <div id="newList">${newListHtml(all, company, q)}</div>`;
  }

  function newListHtml(all, company, q) {
    const k = normKey(q);
    const list = all.filter((p) => (!company || p.company === company) && (!k || normKey(p.name).includes(k)));
    if (S.loading && !all.length) return loadingBox();
    if (!list.length) return emptyBox(all.length ? "条件に合う商品がありません。" : "新商品のデータがまだありません。");
    const SHOW = 150;
    return `<ul class="Box plist">${list.slice(0, SHOW).map((p) => productRow(p, { showCompany: !company })).join("")}</ul>
      ${list.length > SHOW ? `<p class="color-fg-muted f6 mt-2">ほか ${list.length - SHOW} 件。商品名で絞り込めます。</p>` : ""}`;
  }

  function pagePost(key, params) {
    const prod = key ? IDX.products.get(key) : null;
    const verdict = VERDICTS[params.get("verdict")] ? params.get("verdict") : "";
    const company = prod ? prod.company : params.get("company") || "";
    const theme = params.get("theme") || "";
    const nickname = store.get("honne.nickname", "");

    const productNames = [...new Set([...IDX.products.values()].map((p) => p.name))].slice(0, 2000);
    const companyNames = [...new Set([...Object.keys(COMPANY_ALIASES), ...[...IDX.companies.values()].map((c) => c.name)])];
    const themeNames = [...new Set([...THEME_SUGGESTIONS, ...IDX.themes.keys()])];

    return `
      ${banners()}
      <div class="page-head">
        ${prod ? `<p class="crumbs"><a href="#/company/${enc(prod.company)}">${esc(prod.company)}</a> / <a href="#/product/${enc(prod.key)}">${esc(prod.name)}</a></p>` : ""}
        <h1>${prod ? "この商品を評価する" : "投稿する"}</h1>
        <p>実際に買った・使ったものについて書いてください。ログインは不要です。</p>
      </div>

      <form class="post-form" id="postForm" novalidate>
        <div class="field-row">
          <div class="field">
            <label for="fName">商品名<span class="req">必須</span></label>
            <input id="fName" name="name" class="form-control" maxlength="${LIMITS.name}" list="dlProducts" autocomplete="off"
              placeholder="例: 半熟ゆで卵" value="${esc(prod ? prod.name : "")}" required>
          </div>
          <div class="field">
            <label for="fCompany">企業・お店<span class="req">必須</span></label>
            <input id="fCompany" name="company" class="form-control" maxlength="${LIMITS.company}" list="dlCompanies" autocomplete="off"
              placeholder="例: ローソン、無印良品" value="${esc(company)}" required>
            <p class="hint">メーカー名か、買ったお店の名前。</p>
          </div>
        </div>

        <fieldset class="field">
          <legend>判定<span class="req">必須</span></legend>
          <div class="verdict-pick">
            ${VERDICT_IDS.map(
              (id) => `<div class="verdict-opt ${VERDICTS[id].tone}">
                <input type="radio" name="verdict" id="fV-${id}" value="${id}" ${verdict === id ? "checked" : ""}>
                <label for="fV-${id}"><span class="vmark" aria-hidden="true">${VERDICTS[id].mark}</span>${VERDICTS[id].label}</label>
              </div>`
            ).join("")}
          </div>
        </fieldset>

        <div class="field">
          <label for="fBody">ひとこと<span class="req">必須</span></label>
          <textarea id="fBody" name="body" class="form-control" maxlength="${LIMITS.body}" placeholder="${esc(PLACEHOLDERS[verdict])}" required></textarea>
          <span class="count" id="fBodyCount">0 / ${LIMITS.body}</span>
        </div>

        <div class="field" id="fAltField" ${verdict === "kaizen" || verdict === "kauna" ? "" : "hidden"}>
          <label for="fAlt">代わりにこれ</label>
          <input id="fAlt" name="alt" class="form-control" maxlength="${LIMITS.alt}" placeholder="例: ファミリーマートの半熟ゆで卵" autocomplete="off">
          <p class="hint">こっちの方がよかった、というものがあれば。</p>
        </div>

        <div class="field-row">
          <div class="field">
            <label for="fTheme">テーマ（任意）</label>
            <input id="fTheme" name="theme" class="form-control" maxlength="${LIMITS.theme}" list="dlThemes" autocomplete="off"
              placeholder="例: 筋トレするなら" value="${esc(theme)}">
            <p class="hint">新しい言葉を書けば、新しいテーマができます。</p>
          </div>
          <div class="field">
            <label for="fNick">ニックネーム（任意）</label>
            <input id="fNick" name="nickname" class="form-control" maxlength="${LIMITS.nickname}" autocomplete="nickname"
              placeholder="名無しさん" value="${esc(nickname)}">
            <p class="hint">本名や連絡先は書かないでください。</p>
          </div>
        </div>

        <p class="form-error" id="fError" role="alert" hidden></p>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary" id="fSubmit">投稿する</button>
          <a class="btn" href="${prod ? `#/product/${enc(prod.key)}` : "#/"}">やめる</a>
          <span class="color-fg-muted f6">投稿すると<a href="#/about">投稿のルール</a>に同意したことになります。</span>
        </div>

        <datalist id="dlProducts">${productNames.map((n) => `<option value="${esc(n)}"></option>`).join("")}</datalist>
        <datalist id="dlCompanies">${companyNames.map((n) => `<option value="${esc(n)}"></option>`).join("")}</datalist>
        <datalist id="dlThemes">${themeNames.map((n) => `<option value="${esc(n)}"></option>`).join("")}</datalist>
      </form>`;
  }

  function pageAbout() {
    const repo = CFG.repoUrl || "";
    return `
      <div class="page-head"><h1>このサイトについて</h1></div>
      <div class="prose">
        <p>買い物ホンネ帳は、毎日使うモノの「まじでおすすめ」「改善してほしい」「絶対買うな」を、使った人が書き足していくサイトです。ログインなしで、だれでも投稿できます。</p>

        <h2>使い方</h2>
        <ul>
          <li><strong>◎ まじでおすすめ</strong>：人にすすめたくなったもの。</li>
          <li><strong>△ 改善してほしい</strong>：ここさえ直れば最高なのに、というもの。</li>
          <li><strong>× 絶対買うな</strong>：お金と時間をムダにしたもの。</li>
          <li><strong>テーマ</strong>：「筋トレするなら」のような切り口。投稿のときに新しく作れます。</li>
          <li><strong>わかる</strong>：共感した投稿に押してください（1つの投稿に1回まで）。</li>
        </ul>

        <h2>投稿のルール</h2>
        <ul>
          <li>実際に買った・使ったものだけを書いてください。</li>
          <li>人の名前、店員さんの特徴、連絡先などの個人情報は書かないでください。</li>
          <li>悪口ではなく「どこがダメだったか」を具体的に書いてください。</li>
          <li>架空の商品や荒らしと思われる投稿は「通報」してください。管理人が確認して非表示にします。</li>
        </ul>

        <h2>新商品の自動取り込み</h2>
        <p>セブン-イレブン、ファミリーマート、ローソンの公式サイトの「新商品」ページを毎日1回読み、商品名・価格・発売日・公式ページへのリンクを取り込んでいます。商品画像は使っていません。価格や販売地域は変わることがあるので、購入前に公式ページで確認してください。</p>

        <h2>ソースコード</h2>
        <p>このサイトのプログラムは MIT ライセンスで公開しています。デザインには GitHub が公開している <a href="https://primer.style/css" rel="noopener">Primer CSS</a>（MITライセンス）を使っています。だれでも自由に使ったり改造したりできます。</p>
        ${repo ? `<p><a href="${esc(repo)}" rel="noopener">${esc(repo)}</a></p>` : ""}

        <h2>削除の依頼</h2>
        <p>自分の投稿を消したいとき、または権利の侵害などで削除してほしい投稿があるときは、その投稿の「通報」を押すか、${CFG.issuesUrl ? `<a href="${esc(CFG.issuesUrl)}" rel="noopener">GitHub の Issues</a>` : "管理人"}に連絡してください。</p>
      </div>`;
  }

  function pageNotFound() {
    return emptyBox("ページが見つかりませんでした。", `<a class="btn" href="#/">ホームへ</a>`);
  }

  // ------------------------------------------------------------------ 画面の切り替え

  function parseRoute() {
    const h = location.hash.replace(/^#\/?/, "");
    const qi = h.indexOf("?");
    const path = qi >= 0 ? h.slice(0, qi) : h;
    const params = new URLSearchParams(qi >= 0 ? h.slice(qi + 1) : "");
    const parts = path
      .split("/")
      .filter(Boolean)
      .map((s) => {
        try {
          return decodeURIComponent(s);
        } catch (e) {
          return s;
        }
      });
    return { name: parts[0] || "home", arg: parts.slice(1).join("/"), params };
  }

  function titleFor(r) {
    const site = "買い物ホンネ帳";
    switch (r.name) {
      case "board":
        return VERDICTS[r.arg] ? `${VERDICTS[r.arg].label}｜${site}` : site;
      case "theme":
        return `${r.arg}｜${site}`;
      case "companies":
        return `企業から探す｜${site}`;
      case "company":
        return `${r.arg}の評価｜${site}`;
      case "product": {
        const p = IDX.products.get(r.arg);
        return p ? `${p.name}（${p.company}）｜${site}` : site;
      }
      case "new":
        return `新商品｜${site}`;
      case "post":
        return `投稿する｜${site}`;
      case "about":
        return `このサイトについて｜${site}`;
      default:
        return site;
    }
  }

  function render() {
    const r = parseRoute();
    IDX = buildIndex();
    let html;
    switch (r.name) {
      case "home":
        html = pageHome();
        break;
      case "board":
        html = VERDICTS[r.arg] ? pageBoard(r.arg, r.params) : pageNotFound();
        break;
      case "theme":
        html = r.arg ? pageTheme(r.arg, r.params) : pageNotFound();
        break;
      case "companies":
        html = pageCompanies(r.params);
        break;
      case "company":
        html = r.arg ? pageCompany(r.arg) : pageCompanies(r.params);
        break;
      case "product":
        html = pageProduct(r.arg);
        break;
      case "new":
        html = pageNew(r.params);
        break;
      case "post":
        html = pagePost(r.arg, r.params);
        break;
      case "about":
        html = pageAbout();
        break;
      default:
        html = pageNotFound();
    }
    const keepForm = r.name === "post" && document.getElementById("postForm") && app.dataset.route === location.hash;
    if (!keepForm) {
      app.innerHTML = html;
      app.dataset.route = location.hash;
      if (r.name === "post") wirePostForm(r.arg);
      if (r.name === "companies" || (r.name === "company" && !r.arg)) wireCompanySearch();
      if (r.name === "new") wireNewSearch();
    }
    document.title = titleFor(r);
    for (const a of document.querySelectorAll("#siteNav a")) {
      const key = a.dataset.nav;
      const current = key === r.name || key === `${r.name}/${r.arg}` || (key === "companies" && r.name === "company");
      if (current) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    }
  }

  function wireCompanySearch() {
    const input = document.getElementById("companySearch");
    if (!input) return;
    input.addEventListener("input", () => {
      document.getElementById("companyGrid").innerHTML = companyGridHtml(sortedCompanies(input.value));
    });
  }

  function wireNewSearch() {
    const input = document.getElementById("newSearch");
    if (!input) return;
    input.addEventListener("input", () => {
      const all = [...IDX.products.values()]
        .filter((p) => p.official)
        .sort((a, b) => (b.firstSeen || "").localeCompare(a.firstSeen || "") || (b.release || "").localeCompare(a.release || ""));
      document.getElementById("newList").innerHTML = newListHtml(all, input.dataset.company || "", input.value);
    });
  }

  // ------------------------------------------------------------------ 投稿フォーム

  function wirePostForm(fixedKey) {
    const form = document.getElementById("postForm");
    if (!form) return;
    const $ = (id) => document.getElementById(id);
    const err = $("fError");

    form.addEventListener("input", () => {
      form.dataset.dirty = "1";
    });

    const showError = (msg, focusId) => {
      err.textContent = msg;
      err.hidden = false;
      if (focusId) $(focusId).focus();
    };

    const syncVerdict = () => {
      const v = form.querySelector('input[name="verdict"]:checked');
      const id = v ? v.value : "";
      $("fBody").placeholder = PLACEHOLDERS[id] || PLACEHOLDERS[""];
      $("fAltField").hidden = !(id === "kaizen" || id === "kauna");
    };
    form.addEventListener("change", (e) => {
      if (e.target.name === "verdict") syncVerdict();
    });

    $("fBody").addEventListener("input", () => {
      $("fBodyCount").textContent = `${$("fBody").value.length} / ${LIMITS.body}`;
    });

    // 知っている商品名を選んだら、企業名を自動で入れる
    $("fName").addEventListener("change", () => {
      if ($("fCompany").value.trim()) return;
      const k = normKey($("fName").value);
      const hits = [...IDX.products.values()].filter((p) => normKey(p.name) === k);
      const companies = [...new Set(hits.map((p) => p.company))];
      if (companies.length === 1) $("fCompany").value = companies[0];
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      err.hidden = true;

      const nameRaw = $("fName").value.normalize("NFKC").trim();
      const companyRaw = $("fCompany").value.trim();
      const v = form.querySelector('input[name="verdict"]:checked');
      const body = $("fBody").value.trim();
      const altVisible = !$("fAltField").hidden;
      const alt = altVisible ? $("fAlt").value.normalize("NFKC").trim() : "";
      const theme = canonicalTheme($("fTheme").value);
      const nickname = $("fNick").value.normalize("NFKC").trim();

      if (!nameRaw) return showError("商品名を入れてください。", "fName");
      if (!companyRaw) return showError("企業・お店の名前を入れてください。", "fCompany");
      if (!v) return showError("◎ △ × のどれかを選んでください。", "fV-osusume");
      if (!body) return showError("ひとことを書いてください。", "fBody");
      if (nameRaw.length > LIMITS.name || body.length > LIMITS.body || theme.length > LIMITS.theme || alt.length > LIMITS.alt || nickname.length > LIMITS.nickname) {
        return showError("文字数が多すぎる項目があります。");
      }

      const last = store.get("honne.lastPost", 0);
      if (Date.now() - last < POST_COOLDOWN_MS) return showError("続けて投稿するときは、少し待ってからもう一度押してください。");

      const company = canonicalCompany(companyRaw);
      const catalogKey = IDX.catalogByName.get(normKey(company) + "|" + normKey(nameRaw));
      let key = catalogKey || userProductKey(company, nameRaw);
      // 商品ページから来て、名前と企業を変えていなければその商品に付ける
      const fixed = fixedKey && IDX.products.get(fixedKey);
      if (fixed && normKey(fixed.name) === normKey(nameRaw) && normKey(fixed.company) === normKey(company)) key = fixed.key;
      const existing = IDX.products.get(key);

      const row = {
        product_key: key,
        product_name: (existing ? existing.name : nameRaw).slice(0, LIMITS.name),
        company: (existing ? existing.company : company).slice(0, LIMITS.company),
        verdict: v.value,
        theme: theme || null,
        body: body.slice(0, LIMITS.body),
        alt: alt || null,
        nickname: nickname || null,
      };

      const btn = $("fSubmit");
      btn.disabled = true;
      btn.textContent = "投稿中…";
      try {
        const saved = await api.addReview(row);
        if (saved && isValidReview(saved)) S.reviews.unshift(saved);
        store.set("honne.nickname", nickname);
        store.set("honne.lastPost", Date.now());
        toast("投稿しました。ありがとうございます！", "success");
        location.hash = `#/product/${enc(key)}`;
      } catch (ex) {
        console.error(ex);
        showError("投稿できませんでした。通信状況を確かめて、もう一度押してください。" + (ex && ex.message ? `（${ex.message}）` : ""));
      } finally {
        btn.disabled = false;
        btn.textContent = "投稿する";
      }
    });
  }

  // ------------------------------------------------------------------ わかる・通報

  document.addEventListener("click", async (e) => {
    const agree = e.target.closest("[data-agree]");
    if (agree) {
      const id = agree.dataset.agree;
      if (S.myAgrees.has(id)) return;
      S.myAgrees.add(id);
      S.agrees.set(id, (S.agrees.get(id) || 0) + 1);
      store.set("honne.agreed", [...S.myAgrees].slice(-2000));
      refreshKeepingScroll();
      try {
        await api.addAgree(id);
      } catch (ex) {
        console.error(ex);
        S.myAgrees.delete(id);
        S.agrees.set(id, Math.max(0, (S.agrees.get(id) || 1) - 1));
        store.set("honne.agreed", [...S.myAgrees]);
        refreshKeepingScroll();
        toast("「わかる」を送れませんでした。もう一度押してください。", "error");
      }
      return;
    }

    const report = e.target.closest("[data-report]");
    if (report) {
      const id = report.dataset.report;
      if (S.armedReport !== id) {
        S.armedReport = id;
        refreshKeepingScroll();
        return;
      }
      S.armedReport = null;
      try {
        await api.report(id);
        S.reported.add(id);
        store.set("honne.reported", [...S.reported].slice(-500));
        toast("通報しました。管理人が確認します。", "success");
      } catch (ex) {
        console.error(ex);
        toast("通報を送れませんでした。もう一度押してください。", "error");
      }
      refreshKeepingScroll();
    }
  });

  function refreshKeepingScroll() {
    const y = window.scrollY;
    app.dataset.route = ""; // 再描画させる
    render();
    window.scrollTo(0, y);
  }

  let toastTimer = 0;
  function toast(message, kind) {
    const wrap = document.getElementById("toastWrap");
    const icon = kind === "error" ? "!" : "✓";
    wrap.innerHTML = `<div class="Toast ${kind === "error" ? "Toast--error" : "Toast--success"}" role="status">
      <span class="Toast-icon" aria-hidden="true">${icon}</span>
      <span class="Toast-content">${esc(message)}</span>
    </div>`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      wrap.innerHTML = "";
    }, 3500);
  }

  // ------------------------------------------------------------------ 起動

  async function load() {
    const catalog = fetch("data/products.json", { cache: "no-cache" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("HTTP " + res.status))))
      .then((json) => {
        S.catalog = Array.isArray(json.products) ? json.products : [];
        S.catalogUpdated = json.updatedAt || "";
      })
      .catch((ex) => {
        console.error(ex);
        S.catalogError = "新商品のデータを読み込めませんでした。時間をおいて再読み込みしてください。";
      });

    const reviews = Promise.all([api.loadReviews(), api.loadAgrees()])
      .then(([rows, agrees]) => {
        S.reviews = (rows || []).filter(isValidReview);
        S.agrees = new Map((agrees || []).map((a) => [a.review_id, Number(a.n) || 0]));
      })
      .catch((ex) => {
        console.error(ex);
        S.reviewsError = "投稿を読み込めませんでした。時間をおいて再読み込みしてください。";
      });

    await Promise.all([catalog, reviews]);
    S.loading = false;
    // 投稿フォームに入力中なら、書きかけを消さないよう作り直さない
    const form = document.getElementById("postForm");
    if (!(form && form.dataset.dirty)) app.dataset.route = "";
    render();
  }

  const repoLink = document.getElementById("repoLink");
  if (repoLink && CFG.repoUrl) repoLink.href = CFG.repoUrl;

  window.addEventListener("hashchange", () => {
    S.armedReport = null;
    render();
    window.scrollTo(0, 0);
    app.focus({ preventScroll: true });
  });

  render();
  load();
})();

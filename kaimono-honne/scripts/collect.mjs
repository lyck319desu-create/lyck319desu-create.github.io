#!/usr/bin/env node
// 1日1回、コンビニ各社の「新商品」ページから商品を集めて data/products.json に保存します。
// 依存パッケージなし（Node.js 20 以上）。GitHub Actions から毎日自動で動きます。
//
//   手元で試す:  node scripts/collect.mjs
//
// 各社のページの作りが変わると、その会社の分だけ 0 件になります。
// そのときは既存のデータを消さずに残し、ログに警告を出します。

import { readFile, writeFile, mkdir } from "node:fs/promises";

const OUT = new URL("../data/products.json", import.meta.url);
const KEEP_DAYS = 120; // 最後に見かけてから何日まで残すか
const MAX_PRODUCTS = 2000;
const REPO = process.env.GITHUB_REPOSITORY || "kaimono-honne";
const UA = `Mozilla/5.0 (compatible; kaimono-honne-collector/1.0; +https://github.com/${REPO})`;

// ---------------------------------------------------------------- 共通の小道具

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, "Accept-Language": "ja,en;q=0.5" },
        redirect: "follow",
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      await sleep(1500); // 相手のサーバーに負担をかけないよう、1件ごとに少し待つ
      return html;
    } catch (e) {
      if (attempt === 2) throw new Error(`${url} を取得できませんでした: ${e.message}`);
      await sleep(3000);
    }
  }
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function text(html) {
  return String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

function pick(re, s) {
  const m = re.exec(s);
  return m ? text(m[1]) : "";
}

// "2026年11月10日（火）以降順次発売" や "2026.11.10" → "2026-11-10"
function isoDate(s) {
  const m = /(\d{4})\s*[年.\/-]\s*(\d{1,2})\s*[月.\/-]\s*(\d{1,2})/.exec(s || "");
  if (!m) return "";
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

function todayJST() {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- 各社の読み取り

async function sevenEleven() {
  const base = "https://www.sej.co.jp";
  const html = await get(`${base}/products/a/thisweek/`);
  const out = [];
  const block = /<div class="list_inner -item-code-(\d+)">([\s\S]*?)<!--\s*list_inner\s*-->/g;
  for (const m of html.matchAll(block)) {
    const [, code, body] = m;
    const name = pick(/<div class="item_ttl">[\s\S]*?<a [^>]*>([\s\S]*?)<\/a>/, body);
    if (!name) continue;
    out.push({
      id: `seven-${code}`,
      name,
      company: "セブン-イレブン",
      category: "",
      price: pick(/<div class="item_price">\s*<p>([\s\S]*?)<\/p>/, body),
      release: isoDate(pick(/<div class="item_launch">\s*<p>([\s\S]*?)<\/p>/, body)),
      // 地域ごとのURLもあるが、地域なしのURLでも同じ商品ページが開く
      url: `${base}/products/a/item/${code}/`,
    });
  }
  return out;
}

async function familyMart() {
  const base = "https://www.family.co.jp";
  const html = await get(`${base}/goods/newgoods.html`);
  const out = [];
  const block = /<a href="((?:https:\/\/www\.family\.co\.jp)?\/goods\/[a-z_]+\/(\d+)\.html)" class="ly-mod-infoset3-link">([\s\S]*?)<\/a>/g;
  for (const m of html.matchAll(block)) {
    const [, href, code, body] = m;
    const name = pick(/<h3 class="ly-mod-infoset3-ttl">([\s\S]*?)<\/h3>/, body);
    if (!name) continue;
    out.push({
      id: `familymart-${code}`,
      name,
      company: "ファミリーマート",
      category: pick(/<p class="ly-mod-infoset3-cate">([\s\S]*?)<\/p>/, body),
      price: pick(/<p class="ly-mod-infoset3-txt">([\s\S]*?)<\/p>/, body),
      release: "",
      url: new URL(href, base).href,
    });
  }
  return out;
}

async function lawson() {
  const base = "https://www.lawson.co.jp";
  // /recommend/new/ は最新の発売日ページへ自動で移動するだけのページ
  const top = await get(`${base}/recommend/new/`);
  const redirect = /url=([^"'>\s]+)/i.exec(top)?.[1];
  const firstUrl = new URL(redirect || "/recommend/new/", base).href;
  const first = await get(firstUrl);

  // 直近の発売日ページもいくつか読む（初回や取りこぼし対策）
  const nav = /<ul class="contentsNav">([\s\S]*?)<\/ul>/.exec(first)?.[1] || "";
  const recent = [...nav.matchAll(/href="(\/recommend\/new\/list\/[^"]+)"/g)].slice(0, 2).map((m) => new URL(m[1], base).href);

  const pages = [first];
  for (const url of recent) {
    try {
      pages.push(await get(url));
    } catch (e) {
      console.warn(`::warning::ローソン ${e.message}`);
    }
  }

  const out = [];
  for (const html of pages) {
    const block = /<a href="(\/recommend\/original\/detail\/(\d+_\d+)\.html)">([\s\S]*?)<\/a>/g;
    for (const m of html.matchAll(block)) {
      const [, href, code, body] = m;
      const name = pick(/<p class="ttl">([\s\S]*?)<\/p>/, body);
      if (!name) continue;
      const yen = /<p class="price">\s*<span>([\d,]+)<\/span>\s*<span>([^<]*)<\/span>/.exec(body);
      out.push({
        id: `lawson-${code}`,
        name,
        company: "ローソン",
        category: "",
        price: yen ? `${yen[1]}${text(yen[2])}` : "",
        release: isoDate(pick(/<p class="date">([\s\S]*?)<\/p>/, body)),
        url: new URL(href, base).href,
      });
    }
  }
  return out;
}

const SOURCES = [
  ["セブン-イレブン", sevenEleven],
  ["ファミリーマート", familyMart],
  ["ローソン", lawson],
];

// ---------------------------------------------------------------- まとめて保存

async function main() {
  let current = { updatedAt: null, products: [] };
  try {
    current = JSON.parse(await readFile(OUT, "utf8"));
  } catch {
    // 初回はファイルがないので空から始める
  }

  const today = todayJST();
  const byId = new Map((current.products || []).map((p) => [p.id, p]));
  let ok = 0;

  for (const [label, fn] of SOURCES) {
    try {
      const items = await fn();
      if (!items.length) {
        console.warn(`::warning::${label}: 商品が0件でした。ページの作りが変わったかもしれません。`);
        continue;
      }
      ok++;
      let added = 0;
      for (const item of items) {
        const prev = byId.get(item.id);
        if (!prev) added++;
        byId.set(item.id, {
          ...item,
          release: item.release || prev?.release || "",
          firstSeen: prev?.firstSeen || today,
          lastSeen: today,
        });
      }
      console.log(`${label}: ${items.length}件（新しく追加 ${added}件）`);
    } catch (e) {
      console.warn(`::warning::${label}: ${e.message}`);
    }
  }

  if (ok === 0) {
    console.error("::error::どの会社のページも読めませんでした。データは変更していません。");
    process.exit(1);
  }

  const cutoff = new Date(Date.now() + 9 * 3600_000 - KEEP_DAYS * 86400_000).toISOString().slice(0, 10);
  const products = [...byId.values()]
    .filter((p) => (p.lastSeen || p.firstSeen) >= cutoff)
    .sort((a, b) =>
      (b.firstSeen || "").localeCompare(a.firstSeen || "") ||
      (b.release || "").localeCompare(a.release || "") ||
      a.company.localeCompare(b.company, "ja") ||
      a.id.localeCompare(b.id))
    .slice(0, MAX_PRODUCTS);

  // 1商品1行で書き出す（GitHub上で差分が読みやすいように）
  const body = products.map((p) => "    " + JSON.stringify(p)).join(",\n");
  const json = `{\n  "updatedAt": ${JSON.stringify(new Date().toISOString())},\n  "products": [\n${body}\n  ]\n}\n`;
  await mkdir(new URL("../data/", import.meta.url), { recursive: true });
  await writeFile(OUT, json);
  console.log(`保存しました: ${products.length}件`);
}

main().catch((e) => {
  console.error(`::error::${e.stack || e.message}`);
  process.exit(1);
});

# 買い物ホンネ帳

毎日使うモノの「◎ まじでおすすめ」「△ 改善してほしい」「× 絶対買うな」を、使った人が書き足していくサイトです。ログインなしで、だれでも投稿できます。

- **公開URL**: https://lyck319desu-create.github.io/kaimono-honne/
- **できること**
  - ◎ △ × の判定つきで商品の感想を投稿する（ログイン不要）
  - 「筋トレするなら」のような**テーマ**を、投稿するときに自由に作る
  - **企業ごとのページ**で、その会社の商品に ◎ △ × がどれくらい付いているかを見る
  - コンビニ3社（セブン-イレブン・ファミリーマート・ローソン）の**新商品を毎日1回自動で取り込み**、評価を待つ
  - 共感した投稿に「わかる」を押す、架空・荒らしの投稿を「通報」する

デザインには GitHub が公開しているデザインシステム [Primer CSS](https://primer.style/css)（MITライセンス）を使っています。このサイトのコードも MIT ライセンスなので、だれでも自由に使ったり改造したりできます。

> このサイトは、リポジトリ `lyck319desu-create.github.io` の中の **`kaimono-honne/` フォルダ**に入っています。
> リポジトリのほかのファイル（トップページや analysis/ など）とは関係ありません。

---

## いまの状態

| 項目 | 状態 |
| --- | --- |
| サイトの公開 | ✅ 公開済み（GitHub Pages・無料） |
| 新商品の毎日取り込み | ✅ 毎日 6:17 に自動で動く（GitHub Actions・無料） |
| 投稿をみんなで共有 | ⏳ **まだ**。いまは「お試しモード」で、投稿は書いた人のブラウザにだけ保存される。下の「手順: 投稿を共有する」をやると共有される |

---

## しくみ

```
  訪問者のブラウザ
      │  ページを開く                 投稿を読む・書く
      ▼                                   ▼
  GitHub Pages（無料）               Supabase（無料のデータベース）
  kaimono-honne/ フォルダ            reviews（投稿）・agrees（わかる）・reports（通報）
      ▲
      │  毎日1回 kaimono-honne/data/products.json を更新
  GitHub Actions（無料）
  kaimono-honne/scripts/collect.mjs が各社の「新商品」ページを読む
```

- サーバーを借りる必要はありません。すべて無料枠で動きます。
- ビルド作業はありません。ファイルを直してコミットすれば、そのまま公開されます。

---

## 手順: 投稿を共有する（Supabase をつなぐ・約10分・無料）

1. https://supabase.com を開き、**GitHub アカウントでサインイン**する（無料プランのまま。カード登録は不要）
2. **New project** を押して、次のように入れて作成する
   - Name: `kaimono-honne`（なんでもよい）
   - Database Password: 自動生成でよい（**どこかに保存しておく**）
   - Region: **Northeast Asia (Tokyo)**
3. 左メニューの **SQL Editor** を開き、[`supabase/schema.sql`](supabase/schema.sql) の中身を**全部コピーして貼りつけ**、**Run** を押す
   - 「Success」と出ればOK。最初の1件（ローソンの半熟ゆで卵）も入ります
4. 画面上部の **Connect** ボタン、または **Project Settings → API Keys / Data API** から、次の2つをコピーする
   - **Project URL**（`https://xxxxxxxx.supabase.co` の形）
   - **Publishable key**（`sb_publishable_` で始まる。古いプロジェクトでは **anon public** key）
5. GitHub で [`kaimono-honne/config.js`](config.js) を開き、鉛筆マーク（Edit）を押して2か所に貼りつけ、**Commit changes** を押す

   ```js
   window.HONNE_CONFIG = {
     supabaseUrl: "https://xxxxxxxx.supabase.co",
     supabaseKey: "sb_publishable_xxxxxxxxxxxx",
     ...
   };
   ```

   > この2つは**公開してよい値**です（ブラウザに置く前提の鍵で、できることは上の SQL で「読む・投稿する」だけに絞ってあります）。
   > **`secret` key や `service_role` key は絶対に貼らないでください。** こちらは何でもできてしまう鍵です。

   Claude に頼む場合は、Project URL と Publishable key の2つだけを伝えれば入れてもらえます。

6. 1〜2分後にサイトを開き直し、黄色の「お試しモード」の表示が消えていれば完成です

---

## 毎日の新商品の取り込み

- リポジトリ直下の [`.github/workflows/kaimono-honne-collect.yml`](../.github/workflows/kaimono-honne-collect.yml) が**毎日 6:17（日本時間）**に動き、[`scripts/collect.mjs`](scripts/collect.mjs) が各社の「新商品」ページを読んで [`data/products.json`](data/products.json) を更新します。
- すぐに動かしたいとき: **Actions** タブ →「買い物ホンネ帳: 新商品を集める」→ **Run workflow**
- 読むページ（どれも robots.txt で禁止されていないページです）
  - セブン-イレブン: https://www.sej.co.jp/products/a/thisweek/
  - ファミリーマート: https://www.family.co.jp/goods/newgoods.html
  - ローソン: https://www.lawson.co.jp/recommend/new/
- 取り込むのは商品名・価格・発売日・公式ページのURLだけです。**商品画像は使いません**（著作権のため）。
- 各社のページの作りが変わると、その会社の分だけ取り込めなくなります。Actions の実行結果に黄色の警告が出るので、そのときは `scripts/collect.mjs` の該当する会社の部分を直してください。3社とも失敗した日は赤い失敗になり、GitHub からメールが届きます。

### 会社を増やしたいとき

`scripts/collect.mjs` の `SOURCES` に、同じ形の関数を1つ足します。返す値は次の形の配列です。

```js
{ id: "会社名-商品番号", name: "商品名", company: "会社名", category: "", price: "価格の文字", release: "2026-11-10", url: "公式ページのURL" }
```

追加する前に、その会社のサイトの robots.txt と利用規約で自動取得が禁止されていないか確認してください。

---

## 管理のしかた（荒らし・架空の投稿）

ログインなしでだれでも書けるので、架空の商品やいたずらも入ります。最初はある程度しかたないので、次のように対応します（Supabase をつないだあと）。

- **通報の確認**: Supabase の **Table Editor** → `report_summary` を開くと、通報の多い投稿が見られます。
- **非表示にする**: Table Editor の `reviews` で、その行の `hidden` を `true` にして保存。サイトから消えます（データは残ります）。
- **完全に消す**: `reviews` でその行を選んで削除。
- 訪問者は他人の投稿を**書き換えたり消したりできません**（`schema.sql` の権限設定でそうしてあります）。
- 連続投稿は1つのブラウザから20秒に1回までにしています。荒らしが増えてきたら、Supabase の Auth（匿名ログイン）や Cloudflare Turnstile（無料の「ロボットではありません」チェック）を足すのが次の一手です。

### Supabase 無料プランの注意

無料プランのプロジェクトは、**1週間ほどアクセスがないと一時停止**されます。止まったらサイトに「投稿を読み込めませんでした」と出るので、Supabase の画面でプロジェクトを開いて **Restore** を押してください（データは消えません）。

---

## 独自ドメイン（例: `kaimono-honne.com`）にするとき

いまは無料の `lyck319desu-create.github.io/kaimono-honne/` で公開しています。ドメインを買ったら、**このサイト専用のリポジトリに引っ越してから**ドメインを設定します（いまのリポジトリにドメインを設定すると、ほかのページまでそのドメインになってしまうため）。

1. ドメインを買う（`.com` なら年1,500〜2,000円くらい。Cloudflare Registrar、お名前.com、ムームードメインなど。初年度だけ1円などの安売りは、2年目以降が高いことが多いので注意）
2. GitHub で新しい公開リポジトリ（例: `kaimono-honne`）を作り、この `kaimono-honne/` フォルダの中身をそのまま一番上に置く
3. `.github/workflows/kaimono-honne-collect.yml` もコピーし、`kaimono-honne/` の部分を消す（パスを一番上に合わせる）
4. 新しいリポジトリの **Settings → Pages** で Source を `main` / `/ (root)` にして公開し、**Custom domain** にドメインを入れる
5. ドメインを買ったサービスの DNS 設定で、GitHub の案内どおりに `A` レコード（`185.199.108.153` など4つ）か `CNAME` レコードを追加し、しばらく待って **Enforce HTTPS** にチェック

Supabase の設定（`config.js`）はそのまま使えます。Claude に「ドメインを買ったので引っ越して」と頼めば、2〜4はやってもらえます。

---

## ファイル構成（`kaimono-honne/` の中）

| ファイル | 役割 |
| --- | --- |
| `index.html` | サイトの外枠（ヘッダー・メニュー・フッター） |
| `assets/app.js` | 画面の中身と動き（ページ切り替え、投稿、わかる、通報） |
| `assets/style.css` | Primer CSS に足している、このサイト用の見た目 |
| `config.js` | Supabase の接続先（上の手順5で書き換える） |
| `data/products.json` | 自動で取り込んだ新商品（毎日更新。手で直さない） |
| `scripts/collect.mjs` | 新商品を取り込むプログラム |
| `supabase/schema.sql` | データベースの設定（上の手順3で1回だけ実行） |

### 手元のパソコンで動かす

```bash
cd kaimono-honne
python3 -m http.server 8000
```

ブラウザで http://localhost:8000 を開きます（`index.html` を直接ダブルクリックすると新商品データが読めないので、この方法で開いてください）。

新商品の取り込みを手元で試すときは Node.js 20 以上で:

```bash
node kaimono-honne/scripts/collect.mjs
```

---

## ライセンス

- このサイトのコード: [MIT License](LICENSE)
- デザイン: [Primer CSS](https://github.com/primer/css)（MIT License, © GitHub Inc.）
- 新商品の情報（商品名・価格など）の権利は各社にあります。このサイトは公式ページへのリンクを付けて紹介しています。

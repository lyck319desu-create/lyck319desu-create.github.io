// 買い物ホンネ帳の設定ファイル
//
// supabaseUrl と supabaseKey を入れると、投稿がサイトを見た全員で共有されます。
// 空のままだと「お試しモード」になり、投稿はそのブラウザの中にだけ保存されます。
//
// どちらも「公開してよい値」です（Supabase の publishable key / anon key は
// ブラウザに置く前提の鍵です）。secret key / service_role key は絶対に入れないでください。
// 入れ方は README.md の「手順2」を見てください。

window.HONNE_CONFIG = {
  supabaseUrl: "", // 例: "https://abcdefghijklmnop.supabase.co"
  supabaseKey: "", // 例: "sb_publishable_xxxxxxxxxxxx"（古いプロジェクトなら anon key）

  // フッターの「ソースコード」リンク先と、削除依頼などの連絡先
  repoUrl: "https://github.com/lyck319desu-create/lyck319desu-create.github.io/tree/main/kaimono-honne",
  issuesUrl: "https://github.com/lyck319desu-create/lyck319desu-create.github.io/issues",
};

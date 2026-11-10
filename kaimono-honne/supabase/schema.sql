-- =====================================================================
-- 買い物ホンネ帳 データベースの設定
--
-- 使い方: Supabase の画面で「SQL Editor」を開き、このファイルの中身を
--         全部貼りつけて「Run」を押すだけです。何回実行しても大丈夫です。
--
-- できること:
--   ・だれでも（ログインなしで）投稿を読める・書ける
--   ・だれも他人の投稿を書き換えたり消したりできない
--   ・管理人は Supabase の画面（Table Editor）から投稿を非表示・削除できる
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 投稿（レビュー）
-- ---------------------------------------------------------------------
create table if not exists public.reviews (
  id           uuid primary key default gen_random_uuid(),
  product_key  text not null check (char_length(product_key) between 1 and 80),
  product_name text not null check (char_length(product_name) between 1 and 80),
  company      text not null check (char_length(company) between 1 and 40),
  verdict      text not null check (verdict in ('osusume', 'kaizen', 'kauna')),
  theme        text check (theme is null or char_length(theme) between 1 and 20),
  body         text not null check (char_length(body) between 1 and 400),
  alt          text check (alt is null or char_length(alt) <= 80),
  nickname     text check (nickname is null or char_length(nickname) <= 20),
  hidden       boolean not null default false,  -- true にすると、サイトに表示されなくなる
  created_at   timestamptz not null default now()
);

comment on table public.reviews is '投稿。verdict: osusume=まじでおすすめ / kaizen=改善してほしい / kauna=絶対買うな。荒らしは hidden を true にすると非表示になります。';

create index if not exists reviews_created_at_idx on public.reviews (created_at desc);
create index if not exists reviews_product_key_idx on public.reviews (product_key);
create index if not exists reviews_company_idx on public.reviews (company);

-- 投稿日時と非表示フラグは、送られてきた値ではなくサーバー側で決める
create or replace function public.honne_before_insert_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := now();
  new.hidden := false;
  return new;
end;
$$;

drop trigger if exists honne_before_insert_review on public.reviews;
create trigger honne_before_insert_review
  before insert on public.reviews
  for each row execute function public.honne_before_insert_review();

-- ---------------------------------------------------------------------
-- 2. 「わかる」（共感）: 1つのブラウザから1投稿に1回まで
-- ---------------------------------------------------------------------
create table if not exists public.agrees (
  review_id  uuid not null references public.reviews (id) on delete cascade,
  client_id  text not null check (char_length(client_id) between 8 and 64),
  created_at timestamptz not null default now(),
  primary key (review_id, client_id)
);

-- 投稿ごとの「わかる」の数
create or replace view public.agree_counts
with (security_invoker = true) as
  select review_id, count(*)::int as n
  from public.agrees
  group by review_id;

-- ---------------------------------------------------------------------
-- 3. 通報: 管理人だけが Supabase の画面で見る
-- ---------------------------------------------------------------------
create table if not exists public.reports (
  id         bigint generated always as identity primary key,
  review_id  uuid not null references public.reviews (id) on delete cascade,
  reason     text check (reason is null or char_length(reason) <= 200),
  created_at timestamptz not null default now()
);

-- 通報が多い順に見るための一覧（Supabase の画面から見る用。サイトからは見えない）
create or replace view public.report_summary
with (security_invoker = true) as
  select r.id as review_id, r.company, r.product_name, r.body, r.hidden,
         count(p.id)::int as reports, max(p.created_at) as last_reported_at
  from public.reports p
  join public.reviews r on r.id = p.review_id
  group by r.id;

-- ---------------------------------------------------------------------
-- 4. 権限（行レベルセキュリティ）
--    anon = ログインしていない訪問者。サイトからのアクセスはすべてこれ。
-- ---------------------------------------------------------------------
alter table public.reviews enable row level security;
alter table public.agrees  enable row level security;
alter table public.reports enable row level security;

grant usage on schema public to anon, authenticated;

-- reviews: 読む・書くだけ（書き換え・削除は不可）
revoke all on public.reviews from anon, authenticated;
grant select, insert on public.reviews to anon, authenticated;

drop policy if exists "reviews: 非表示以外はだれでも読める" on public.reviews;
create policy "reviews: 非表示以外はだれでも読める" on public.reviews
  for select to anon, authenticated
  using (hidden = false);

drop policy if exists "reviews: だれでも投稿できる" on public.reviews;
create policy "reviews: だれでも投稿できる" on public.reviews
  for insert to anon, authenticated
  with check (hidden = false);

-- agrees: 押すことだけできる。だれが押したか（client_id）は読めない
revoke all on public.agrees from anon, authenticated;
grant insert on public.agrees to anon, authenticated;
grant select (review_id) on public.agrees to anon, authenticated;

drop policy if exists "agrees: 件数はだれでも読める" on public.agrees;
create policy "agrees: 件数はだれでも読める" on public.agrees
  for select to anon, authenticated
  using (true);

drop policy if exists "agrees: 表示中の投稿にだけ押せる" on public.agrees;
create policy "agrees: 表示中の投稿にだけ押せる" on public.agrees
  for insert to anon, authenticated
  with check (exists (select 1 from public.reviews r where r.id = review_id and r.hidden = false));

revoke all on public.agree_counts from anon, authenticated;
grant select on public.agree_counts to anon, authenticated;

-- reports: 送ることだけできる。読めるのは管理人だけ
revoke all on public.reports from anon, authenticated;
grant insert on public.reports to anon, authenticated;

drop policy if exists "reports: だれでも通報できる" on public.reports;
create policy "reports: だれでも通報できる" on public.reports
  for insert to anon, authenticated
  with check (exists (select 1 from public.reviews r where r.id = review_id and r.hidden = false));

revoke all on public.report_summary from anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. 最初の1件（サイトを作るきっかけになった投稿）
--    いらなければ Table Editor の reviews から消してください。
-- ---------------------------------------------------------------------
insert into public.reviews (product_key, product_name, company, verdict, body, alt, nickname)
select
  'u-197vmptfzo',
  '半熟ゆで卵',
  'ローソン',
  'kaizen',
  '殻がめっちゃ剥きづらい。白身が殻にくっついてきて、半分くらい捨てるはめになった。いつもはファミマで買っていて、こんなことはなかった。',
  'ファミリーマートの半熟ゆで卵',
  '管理人'
where not exists (
  select 1 from public.reviews where product_key = 'u-197vmptfzo' and nickname = '管理人'
);

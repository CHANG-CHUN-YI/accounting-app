-- ════════════════════════════════════════
-- 記帳本 Supabase 資料庫設定
-- 在 Supabase > SQL Editor 貼上執行
-- ════════════════════════════════════════

-- transactions 表（記帳記錄）
create table if not exists transactions (
  id          text primary key,
  user_id     uuid references auth.users(id) on delete cascade not null,
  book_id     text not null default 'b1',
  type        text not null check (type in ('income','expense')),
  amount      numeric not null check (amount > 0),
  cat_id      text not null default 'other',
  sub_cat     text default '',
  note        text default '',
  date        date not null,
  who         text default '',
  goal_id     text default '',
  created_at  timestamptz default now()
);

-- Row Level Security：每人只能存取自己的資料
alter table transactions enable row level security;
create policy "own transactions" on transactions
  for all using (auth.uid() = user_id);

-- 索引（提升查詢速度）
create index if not exists idx_tx_user_date
  on transactions(user_id, date desc);

-- ════════════════════════════════════════
-- 完成！接著做：
-- 1. Authentication > Providers > Google > 開啟
-- 2. 填入 Google OAuth Client ID + Secret
-- 3. Authorized Redirect URI 填：
--    https://你的專案.supabase.co/auth/v1/callback
-- ════════════════════════════════════════

-- ════════════════════════════════════════
-- 記帳本 Supabase 資料庫設定 v2
-- 在 Supabase > SQL Editor 貼上執行
-- ════════════════════════════════════════

-- 1. 個人交易記錄表
create table if not exists transactions (
  id          text primary key,
  user_id     uuid references auth.users(id) on delete cascade not null,
  book_id     text not null default 'personal',
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

alter table transactions enable row level security;
create policy "own transactions" on transactions
  for all using (auth.uid() = user_id);

create index if not exists idx_tx_user_date
  on transactions(user_id, date desc);

-- ════════════════════════════════════════
-- 2. 共同帳本表
-- ════════════════════════════════════════
create table if not exists shared_books (
  id          text primary key,           -- 帳本 ID（邀請碼）
  name        text not null,              -- 帳本名稱
  created_by  uuid references auth.users(id) on delete cascade not null,
  members     uuid[] default '{}',        -- 成員 user_id 陣列
  member_names jsonb default '{}',        -- {user_id: 顯示名稱}
  cats        jsonb default '{}',         -- 自訂分類
  budgets     jsonb default '{}',         -- 預算設定
  created_at  timestamptz default now()
);

alter table shared_books enable row level security;

-- 帳本成員才能讀取
create policy "members can read shared book" on shared_books
  for select using (
    auth.uid() = created_by or
    auth.uid() = any(members)
  );

-- 只有建立者能修改帳本設定
create policy "creator can update shared book" on shared_books
  for update using (auth.uid() = created_by);

-- 任何登入者都能建立帳本
create policy "authenticated can create shared book" on shared_books
  for insert with check (auth.uid() = created_by);

-- 建立者才能刪除
create policy "creator can delete shared book" on shared_books
  for delete using (auth.uid() = created_by);

-- ════════════════════════════════════════
-- 3. 共同帳本交易記錄表
-- ════════════════════════════════════════
create table if not exists shared_transactions (
  id          text primary key,
  book_id     text references shared_books(id) on delete cascade not null,
  user_id     uuid references auth.users(id) on delete cascade not null,
  who_name    text default '',            -- 記帳者顯示名稱
  type        text not null check (type in ('income','expense')),
  amount      numeric not null check (amount > 0),
  cat_id      text not null default 'other',
  sub_cat     text default '',
  note        text default '',
  date        date not null,
  goal_id     text default '',
  created_at  timestamptz default now()
);

alter table shared_transactions enable row level security;

-- 帳本成員才能讀取
create policy "members can read shared tx" on shared_transactions
  for select using (
    exists (
      select 1 from shared_books sb
      where sb.id = shared_transactions.book_id
      and (sb.created_by = auth.uid() or auth.uid() = any(sb.members))
    )
  );

-- 帳本成員才能新增
create policy "members can insert shared tx" on shared_transactions
  for insert with check (
    auth.uid() = user_id and
    exists (
      select 1 from shared_books sb
      where sb.id = shared_transactions.book_id
      and (sb.created_by = auth.uid() or auth.uid() = any(sb.members))
    )
  );

-- 只能刪除自己的記錄
create policy "own shared tx delete" on shared_transactions
  for delete using (auth.uid() = user_id);

create index if not exists idx_stx_book_date
  on shared_transactions(book_id, date desc);

-- ════════════════════════════════════════
-- 4. 加入帳本 Function（用邀請碼加入）
-- ════════════════════════════════════════
create or replace function join_shared_book(invite_code text, display_name text)
returns jsonb
language plpgsql security definer
as $$
declare
  book shared_books;
  uid uuid := auth.uid();
begin
  -- 找到帳本
  select * into book from shared_books where id = invite_code;
  if not found then
    return jsonb_build_object('error', '找不到此邀請碼');
  end if;

  -- 已經是成員
  if uid = book.created_by or uid = any(book.members) then
    return jsonb_build_object('error', '你已經是此帳本的成員');
  end if;

  -- 加入成員
  update shared_books
  set
    members = array_append(members, uid),
    member_names = member_names || jsonb_build_object(uid::text, display_name)
  where id = invite_code;

  return jsonb_build_object('success', true, 'book_name', book.name);
end;
$$;

-- ════════════════════════════════════════
-- 新增：個人設定表（預算等）
-- 在 Supabase SQL Editor 貼上執行
-- ════════════════════════════════════════
create table if not exists user_settings (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  settings_json text default '{}',
  updated_at  timestamptz default now()
);

alter table user_settings enable row level security;

create policy "own settings" on user_settings
  for all using (auth.uid() = user_id);

-- ════════════════════════════════════════
-- 記帳本 Supabase v3：存錢罐 + 資金帳戶
-- 在 Supabase SQL Editor 貼上執行
-- ════════════════════════════════════════

-- 1. 存錢罐主表
create table if not exists goals (
  id          text primary key,
  user_id     uuid references auth.users(id) on delete cascade not null,
  book_id     text not null default 'b1',
  emoji       text default '🎯',
  name        text not null,
  target      numeric default 0,
  note        text default '',
  created_at  date default current_date
);

alter table goals enable row level security;
create policy "own goals" on goals
  for all using (auth.uid() = user_id);

-- 2. 存錢罐撥款記錄
create table if not exists goal_allocs (
  id          text primary key,
  goal_id     text references goals(id) on delete cascade not null,
  user_id     uuid references auth.users(id) on delete cascade not null,
  amount      numeric not null,
  note        text default '',
  date        date not null
);

alter table goal_allocs enable row level security;
create policy "own goal allocs" on goal_allocs
  for all using (auth.uid() = user_id);

-- 3. 存錢罐花費記錄
create table if not exists goal_spends (
  id          text primary key,
  goal_id     text references goals(id) on delete cascade not null,
  user_id     uuid references auth.users(id) on delete cascade not null,
  amount      numeric not null,
  note        text default '',
  date        date not null
);

alter table goal_spends enable row level security;
create policy "own goal spends" on goal_spends
  for all using (auth.uid() = user_id);

-- 4. 資金帳戶主表
create table if not exists assets (
  id          text primary key,
  user_id     uuid references auth.users(id) on delete cascade not null,
  book_id     text not null default 'b1',
  emoji       text default '🏦',
  name        text not null,
  init_amount numeric default 0,
  note        text default '',
  created_at  date default current_date
);

alter table assets enable row level security;
create policy "own assets" on assets
  for all using (auth.uid() = user_id);

-- 5. 資金帳戶交易記錄
create table if not exists asset_txs (
  id          text primary key,
  asset_id    text references assets(id) on delete cascade not null,
  user_id     uuid references auth.users(id) on delete cascade not null,
  type        text not null check (type in ('in','out')),
  amount      numeric not null,
  note        text default '',
  date        date not null
);

alter table asset_txs enable row level security;
create policy "own asset txs" on asset_txs
  for all using (auth.uid() = user_id);

-- 索引
create index if not exists idx_goals_user on goals(user_id);
create index if not exists idx_assets_user on assets(user_id);
create index if not exists idx_goal_allocs_goal on goal_allocs(goal_id);
create index if not exists idx_goal_spends_goal on goal_spends(goal_id);
create index if not exists idx_asset_txs_asset on asset_txs(asset_id);

-- ════════════════════════════════════════
-- v4：更新 goals / assets RLS，讓共同帳本成員互相看到
-- 在 Supabase SQL Editor 貼上執行
-- ════════════════════════════════════════

-- 刪除舊的 goals RLS
drop policy if exists "own goals" on goals;

-- 新的 goals RLS：自己的 OR 是共同帳本成員
create policy "goals access" on goals
  for all using (
    auth.uid() = user_id
    or
    book_id in (
      select id from shared_books
      where created_by = auth.uid()
      or auth.uid() = any(members)
    )
  );

-- 刪除舊的 assets RLS
drop policy if exists "own assets" on assets;

-- 新的 assets RLS：自己的 OR 是共同帳本成員
create policy "assets access" on assets
  for all using (
    auth.uid() = user_id
    or
    book_id in (
      select id from shared_books
      where created_by = auth.uid()
      or auth.uid() = any(members)
    )
  );

-- asset_txs 也要更新
drop policy if exists "own asset txs" on asset_txs;

create policy "asset txs access" on asset_txs
  for all using (
    auth.uid() = user_id
    or
    asset_id in (
      select a.id from assets a
      where a.book_id in (
        select id from shared_books
        where created_by = auth.uid()
        or auth.uid() = any(members)
      )
    )
  );

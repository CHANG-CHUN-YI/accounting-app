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

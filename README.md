# 🌿 記帳本 — 架設說明

## 整體架構

```
你的電腦 D:\記帳本\index.html   ← 原始碼（改這裡）
        ↓ git push
  GitHub repo
        ↓ 自動部署
    Vercel（永遠在線，家人朋友都能用）
        ↓ Google 登入
  Supabase（雲端資料庫）
        ↓ 每天自動備份
  每個人自己的 Google Drive
```

---

## 步驟一：Supabase 設定（約 10 分鐘）

1. 前往 https://supabase.com，用 GitHub 登入，建立新專案
   - 區域選 **Asia Northeast 1（Tokyo）**
   - 記下 Database Password

2. 左側 **SQL Editor** → 貼上 `supabase-setup.sql` 全部內容 → Run

3. 左側 **Authentication > Providers > Google** → 開啟

4. 前往 https://console.cloud.google.com
   - 建立專案 → APIs & Services → Credentials → Create OAuth 2.0 Client
   - Application type: **Web application**
   - Authorized redirect URIs 填入：
     `https://你的專案ID.supabase.co/auth/v1/callback`
   - 複製 Client ID 和 Client Secret 填回 Supabase

5. 左側 **Settings > API** → 複製：
   - Project URL（長得像 `https://abcd1234.supabase.co`）
   - anon public key（很長的 JWT）

---

## 步驟二：填入程式碼設定

打開 `index.html`，找到這段（約第 620 行）：

```javascript
const SB_URL  = ''; // 填入你的 Supabase Project URL
const SB_KEY  = ''; // 填入你的 anon public key
const GD_CLIENT_ID = ''; // 填入你的 Google OAuth Client ID
```

改成：

```javascript
const SB_URL  = 'https://abcd1234.supabase.co';
const SB_KEY  = 'eyJhbGci...（你的 anon key）';
const GD_CLIENT_ID = '123456789-abc.apps.googleusercontent.com';
```

---

## 步驟三：部署到 Vercel（約 5 分鐘）

### 方法 A：直接拖拉（最簡單）
1. 前往 https://vercel.com，用 Google 登入
2. Add New Project → 拖拉整個 `記帳本` 資料夾
3. Deploy → 等 30 秒 → 取得網址

### 方法 B：GitHub 自動部署（推薦，之後改程式自動更新）
1. 把資料夾推上 GitHub
2. Vercel 連結 GitHub repo
3. 之後只要 `git push`，Vercel 自動更新，**使用者資料完全不受影響**

---

## 步驟四：加入 Google Drive 備份授權

在 Google Cloud Console：
- APIs & Services → Library → 搜尋 **Google Drive API** → 啟用
- Credentials → 你的 OAuth Client → Authorized origins 加入你的 Vercel 網址

---

## 更新程式注意事項

**更新程式 ≠ 清除資料**

| 動作 | 使用者資料 |
|---|---|
| 你更新 Vercel 程式碼 | ✅ 完全不動 |
| 使用者換手機 | 雲端版自動同步，不影響 |
| 使用者清除瀏覽器快取 | 從 Supabase 重新拉取 |

---

## 備份機制

每位使用者登入後：
- **每天自動備份**一次到他自己的 Google Drive（靜默進行，不打擾）
- 可隨時點頭像 → 「立即備份到 Google Drive」手動觸發
- 同時產生 **JSON**（完整資料，可還原）和 **CSV**（Excel 可開）兩份檔案
- 檔名格式：`記帳本備份_2026-06-25.json`

---

## 使用者如何開始

1. 你把 Vercel 網址傳給家人：`https://mybook.vercel.app`
2. 家人用手機開啟 → 點「使用 Google 帳號登入」
3. Android：瀏覽器右上角 → 加入主畫面
   iPhone：分享按鈕 → 加入主畫面
4. 桌面出現 App 圖示，之後直接開啟

每個人各自登入，資料完全獨立，自動備份到各自的 Google Drive。

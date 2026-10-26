# 台灣收納盒規劃器

輸入抽屜、層架、櫃內等空間的內尺寸，從 MUJI、NITORI、IKEA、大創（DAISO）在台灣販售的收納盒中，算出放得下的排列組合，並提供收納配件與收納技巧查詢，以及 AI 收納顧問。

- 已發布的網站（私人 Artifact，目前線上版本見下方「已知發布問題」）：https://claude.ai/artifact/EYDg1oRJwnNymk7rq14AJb
- 資料查詢日：2026-10-26

## 資料夾結構

```
收納盒規劃器/
├─ data/                     原始資料與合併結果（UTF-8 含 BOM 的 CSV）
│  ├─ muji.csv / nitori.csv / ikea.csv / daiso.csv     各品牌收納盒
│  ├─ acc_muji.csv / acc_nitori.csv / acc_ikea.csv / acc_daiso.csv   各品牌收納配件
│  ├─ tips_brand.csv         品牌官方收納技巧
│  ├─ tips_media.csv         台日居家媒體收納技巧
│  ├─ tips_*.csv             其他技巧來源（例如 tips_tw_pro.csv 台灣整理師）
│  ├─ boxes_all.csv          ← 自動產生：所有收納盒
│  ├─ accessories_all.csv    ← 自動產生：所有配件
│  └─ tips_all.csv           ← 自動產生：所有技巧
├─ engine/
│  ├─ engine.js              尺寸適配計算引擎（瀏覽器與 Node 共用）
│  └─ test.mjs               引擎測試（檢查排列是否越界、重疊、間隙不足）
├─ site/
│  ├─ app.html               網站原始碼（模板，含兩個佔位符）
│  └─ dist/                  ← 自動產生
│     ├─ index.html          發布用（資料與引擎已嵌入）
│     └─ preview.html        本機預覽用（多補了文件骨架）
├─ tools/
│  ├─ build_db.py            合併 CSV、檢查資料、產生試算表
│  └─ build_site.py          把資料和引擎嵌進網站
├─ 收納盒資料庫_v*.xlsx       給人檢查用的試算表（v3 為最新）
└─ .claude/launch.json       本機預覽伺服器設定
```

只要改 `data/` 底下各品牌與各來源的 CSV、`engine/engine.js` 或 `site/app.html`。標示「自動產生」的檔案每次建置都會被覆寫，不要手動編輯。

## 重建網站

需要 Python 3（含 openpyxl）與 Node.js。在專案根目錄執行：

```bash
python tools/build_db.py 4
```

合併所有 CSV 並檢查資料，產生 `收納盒資料庫_v4.xlsx`（版號自訂）。任何一列不符規則就會停止，並指出是哪個 id。

```bash
python tools/build_site.py
```

產生 `site/dist/index.html` 和 `preview.html`。

```bash
cd engine && node test.mjs
```

（可選）跑引擎測試。每一組結果都應顯示「幾何:OK」。

### 本機預覽

在 Claude Code 裡請 Claude 用 `.claude/launch.json` 的 `site` 設定開預覽。也可以自己執行下面的指令，再開 http://localhost:8765/preview.html：

```bash
python -m http.server 8765 --directory site/dist
```

本機預覽看不到 AI 顧問與拍照按鈕，這兩個功能只在 claude.ai 上開啟時才會出現。

### 重新發布

請 Claude 把 `site/dist/index.html` 發布到上面那個 Artifact 網址，網址就會保持不變。capabilities 要維持 `{"sample": {"images": true}}`，AI 顧問與照片評估才能使用。

`tools/build_site.py` 的 `SITE_EXCLUDE` 可以把個別技巧排除在網站之外，CSV 和試算表仍會保留完整資料。

**已知發布問題（2026-10-26）**：
- 技巧超過 260 條時，claude.ai 會把頁面誤判成「PR 審查頁」而拒絕發布。加入任何第 5 條整理師技巧都會觸發，與是哪一條、欄位名稱、頁面大小、網址都無關。
- 舊網址 `EYDg1oRJwnNymk7rq14AJb`：v3 加上整理師技巧 TP-001～004，沒有對話紀錄。
- 測試網址 `PagseDHd537oV3E9KKNFzV`（https://claude.ai/artifact/PagseDHd537oV3E9KKNFzV）：同樣 260 條技巧，加上對話紀錄功能。
- 本機 `site/dist/index.html` 是完整版（306 條技巧＋對話紀錄），等發布問題排除後再上線。
- `engine/check_dist.mjs` 可以檢查建置結果：`node engine/check_dist.mjs`。

## 資料規則

### 收納盒（各品牌 CSV）

- **收錄範圍**：台灣目前在售、最長邊 ≤ 40cm 的盒類。圓形容器、櫃子、層架本體不收。
- **尺寸**：外寸、內寸單位 cm，順序為寬×深×高。內寸只在官方有標時填寫，不推算。
- **套組與多件裝**：`price_twd` 留空，`notes` 開頭寫 `SET:<商品編號>|<整組價>|<此尺寸件數>|<整組件數>;`。引擎會依這個標記換算要買幾組。
- **可信度**：`high` 是官方商品頁直接取得；`medium` 是型錄、推定，或來源之間數值衝突（見 notes）。
- **大創**：官方規格沒標寬深高的順序，高度是依商品圖判讀，`notes` 保留了官方原文。

### 收納配件（acc_*.csv）

- **類別**：只能是 伸縮棒、伸縮層架、鐵網、網片配件、抽屜隔板、小型置物架、掛勾、吊掛收納。
- **伸縮品**：填 `length_min` 與 `length_max`；其他品項填寬、深、高。
- **usage**：只寫官方說明的建議用途。

### 收納技巧（tips_*.csv）

- **space**：只能是 抽屜、衣櫃、廚房、水槽下、洗手台下、冰箱、浴室、玄關、桌面、層架、壁櫥、通用。
- **出處**：每條都要有實際開過的出處網址；媒體來源要有發布日期。
- **tip**：用自己的話改寫的摘要，50–150 字。出處沒寫的內容一律放在結尾並標示，格式為「（一般安全提醒，非原文：…）」或「（補充，非原文：…）」。
- **how_to**：只保留原文寫到的步驟。

## 計算引擎概要

`engine/engine.js` 的 `recommend(space, boxes, opts)` 採兩階段排列：

1. 先把空間寬度切成多個欄。
2. 每欄沿深度放一排盒子，以動態規劃求最佳組合，並嘗試轉向後取較佳的結果。

演算法的其他規則：
- **尺寸取整**：盒子尺寸向上、空間尺寸向下取整到 0.5cm，結果保守。
- **間隙**：盒與盒、盒與壁的間隙預設每邊 0.5cm。
- **結果**：每個空間最多 6 組，包括混搭最佳、精簡混搭（2–3 款）、同系列、單一款式。面積貢獻低於 3% 的零碎款式會被移除。
- **預算**：以價格懲罰係數二分搜尋，找出預算內填滿率最高的組合。
- **購買清單**：套組依整組件數換算購買組數。

## 已知限制

- 大部分盒子沒有官方內寸，無法判斷特定物品放不放得進盒子裡。
- 只用到套組其中幾件時，結果不會提示剩下幾件。
- 大創配件只來自官方線上店，門市品項可能更多。
- 台灣媒體技巧多數來自設計家 Searchome，正在補台灣具名整理師的專欄（`tips_tw_pro.csv`）。
- 價格為查詢日的官網價，之後可能變動。

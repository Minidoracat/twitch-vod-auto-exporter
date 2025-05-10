# Twitch VOD 自動匯出助手 (Minidoracat 專用版)

[![Tampermonkey](https://img.shields.io/badge/Tampermonkey-Script-orange.svg)](https://greasyfork.org/zh-TW/scripts/YOUR_SCRIPT_ID_HERE) <!-- 請在發布後替換 YOUR_SCRIPT_ID_HERE -->
[![GitHub](https://img.shields.io/badge/GitHub-Repo-blue.svg)](https://github.com/Minidoracat/twitch_tampermonkey_script) <!-- 假設這是您的倉庫 -->
[![Discord](https://img.shields.io/badge/Discord-Join-blue.svg)](https://discord.gg/Gur2V67)

大家好！我是 Minidoracat。
近期 Twitch 公告調整了精華和上傳影片的儲存空間政策，將於 **2025 年 5 月 19 日** 起對超出 100 小時儲存上限的頻道自動刪除觀看次數最少的內容。
為了應對這項變更，並方便地將大量的 VOD (隨選影片) 備份轉移到 YouTube，我開發了這款 **Twitch VOD 自動匯出助手**。
希望能透過此腳本簡化匯出流程，自動填寫相關資訊，並確保影片內容得以妥善保存。

## 簡介

Twitch VOD 自動匯出助手是一個油猴 (Tampermonkey) 腳本，專為 Minidoracat 的 Twitch 儀表板設計。
它旨在輔助將 Twitch VOD 快速、方便地匯出到 YouTube，並自動化許多重複性的填寫工作，特別是在需要大量轉移影片時。

## 功能

-   **自動填寫匯出資訊**:
    -   根據使用者定義的模板，自動產生 YouTube 影片的標題。
    -   自動在 YouTube 影片描述中加入影片的原始錄製日期和遊戲/分類名稱。
    -   可選擇附加到現有描述或完全覆蓋。
    -   自動根據遊戲/分類名稱填寫 YouTube 標籤。
-   **處理狀態追蹤**:
    -   標記已處理的影片，避免重複匯出。
    -   可在影片卡片上顯示「已處理」或「未處理」的狀態標籤。
    -   提供清理全部快取或單獨清除特定影片快取的功能。
-   **自動化與便利性**:
    -   支援「開始自動匯出」功能，腳本將依序處理當前頁面所有未處理的影片。
    -   支援自動翻頁，處理完一頁後自動前往下一頁繼續匯出。
    -   提供可拖動的控制面板，方便操作。
    -   可自訂快取過期時間。
    -   可自訂 YouTube 匯出時的影片能見度 (公開/私人)。
-   **客製化模板**:
    -   使用者可以自訂 YouTube 標題、描述和標籤的生成模板。
    -   描述模板支援在原有描述之前或之後附加內容。

## 安裝

1.  安裝 [Tampermonkey](https://www.tampermonkey.net/) 瀏覽器擴充功能。
    *   [Chrome Web Store](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
    *   [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/tampermonkey/)
    *   [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)
2.  點擊以下連結安裝此腳本 (請在發布到 Greasy Fork 後更新此連結)：

    [從 Greasy Fork 安裝腳本](https://greasyfork.org/zh-TW/scripts/YOUR_SCRIPT_ID_HERE) <!-- 請在發布後替換 YOUR_SCRIPT_ID_HERE -->
    或者，如果您想從 GitHub 安裝最新開發版：
    [從 GitHub 安裝腳本](https://github.com/Minidoracat/twitch_tampermonkey_script/raw/main/twitch_auto_exporter.user.js) <!-- 假設 main 是您的主要分支 -->

## 使用方法

1.  安裝腳本後，前往您的 Twitch 影片製作人頁面：`https://dashboard.twitch.tv/u/minidoracat/content/video-producer`。
2.  腳本會在頁面右下角顯示一個「匯出控制面板」。
    *   **開始自動匯出**: 點擊此按鈕，腳本將開始掃描目前頁面的影片，並依序處理未被標記為「已處理」的影片，自動完成匯出到 YouTube 的流程。處理完畢會自動翻到下一頁。
    *   **停止自動匯出**: 在自動匯出過程中，點擊此按鈕可以中斷。
    *   **清理已處理快取**: 點擊此按鈕將清除所有已處理影片的記錄，允許它們被重新匯出。
    *   **狀態顯示**: 顯示腳本目前的運作狀態。
3.  在每個影片卡片上，腳本會顯示「已處理」或「未處理」的標籤。
    *   對於「已處理」的影片，旁邊會有一個紅色的 "✕" 按鈕，點擊它可以單獨清除該影片的快取記錄。
4.  腳本內的參數 (如 `YOUTUBE_TITLE_TEMPLATE`, `YOUTUBE_DESCRIPTION_APPEND_TEMPLATE` 等) 可以在 Tampermonkey 編輯器中修改以符合您的需求。

## 開發者

此腳本為 Minidoracat 開發。
如果您有任何問題、建議或需要協助，歡迎加入 Minidoracat 的 Discord 社群：

[![Discord](https://i.imgur.com/GmQ8MzA.png)](https://discord.gg/Gur2V67)
(點擊圖片加入)

## 貢獻

歡迎對本專案提出貢獻。請遵循以下步驟：

1.  Fork 本倉庫 ([`Minidoracat/twitch_tampermonkey_script`](https://github.com/Minidoracat/twitch_tampermonkey_script))。
2.  創建您的功能分支 (`git checkout -b feature/AmazingFeature`)。
3.  提交您的修改 (`git commit -m 'Add some AmazingFeature'`)。
4.  推送到分支 (`git push origin feature/AmazingFeature`)。
5.  開啟一個 Pull Request。

## 授權

本專案採用 MIT 授權。詳細資訊請參閱 [`LICENSE`](LICENSE) 檔案 (如果有的話，或者您可以自行添加一個)。
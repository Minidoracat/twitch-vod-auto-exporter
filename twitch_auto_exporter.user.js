// ==UserScript==
// @name         Twitch VOD 自動匯出助手 (Minidoracat 專用版)
// @namespace    https://github.com/Minidoracat
// @version      0.8.1
// @description  輔助將 Twitch VOD 匯出到 YouTube，自動填寫日期和遊戲標題（保留原有描述），追蹤已處理影片（可設快取時效），並支援自動化順序匯出、多頁處理、清理快取、單獨清除影片快取及拖動控制面板。新增可客製化的 YouTube 匯出資訊模板及描述附加選項。
// @author       Minidoracat
// @homepageURL  https://github.com/Minidoracat/twitch_tampermonkey_script
// @supportURL   https://github.com/Minidoracat/twitch_tampermonkey_script/issues
// @icon         https://www.google.com/s2/favicons?sz=64&amp;domain=twitch.tv
// @downloadURL  https://greasyfork.org/scripts/YOUR_SCRIPT_ID_HERE/twitch_auto_exporter.user.js
// @updateURL    https://greasyfork.org/scripts/YOUR_SCRIPT_ID_HERE/twitch_auto_exporter.user.js
// @match        https://dashboard.twitch.tv/u/minidoracat/content/video-producer*
// @grant        GM.setValue
// @grant        GM.getValue
// @grant        GM.addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    console.log('Twitch VOD 自動匯出助手腳本已載入！ (v0.8.1)');

    // --- 使用者可配置參數 ---
    const CACHE_EXPIRY_HOURS = 0; // 快取過期時間（小時），0 表示永不過期
    const DEBOUNCE_SCAN_DELAY = 500; // DOM 掃描延遲（毫秒）

    // YouTube 匯出資訊客製化模板
    // 可用變數:
    // {originalTitle} - Twitch 影片的原始標題
    // {videoDate}     - 影片發布日期 (格式 YYYY-MM-DD)
    // {videoRawDate}  - 影片發布日期 (Twitch 原始格式，例如 "2025年4月25日")
    // {gameName}      - 影片的遊戲/分類名稱
    // {gameNameNoSpace} - 影片的遊戲/分類名稱 (無空格)
    // {existingDescription} - YouTube 描述欄位中已有的內容 (如果 YOUTUBE_APPEND_TO_EXISTING_DESCRIPTION 為 true 且原有描述存在)
    const YOUTUBE_TITLE_TEMPLATE = "{originalTitle} [{videoDate}]";
    const YOUTUBE_DESCRIPTION_PREPEND_TEXT = ""; // 加在原有描述之前的文字 (僅當 YOUTUBE_APPEND_TO_EXISTING_DESCRIPTION 為 true 且原有描述存在時有效)
    const YOUTUBE_DESCRIPTION_APPEND_TEMPLATE = "剪輯日期：{videoRawDate}\n#{gameName}\n#{gameNameNoSpace}\n"; // 要附加的內容，或當不附加時作為完整描述
    const YOUTUBE_TAGS_TEMPLATE = "{gameName}";
    const YOUTUBE_VISIBILITY = "private"; // "private" 或 "public"
    const YOUTUBE_APPEND_TO_EXISTING_DESCRIPTION = true; // true: 附加到原有描述之後, false: 完全覆蓋原有描述

    const PROCESSED_VIDEOS_STORAGE_KEY = 'twitch_youtube_exporter_processed_videos_minidoracat_v3';
    let isAutoExporting = false;
    let autoExportQueue = [];
    let currentExportPromise = null;

    // --- UI 元素 ---
    const controlPanel = document.createElement('div');
    controlPanel.id = 'auto-exporter-control-panel';

    const dragHandle = document.createElement('div');
    dragHandle.id = 'auto-exporter-drag-handle';
    dragHandle.textContent = '匯出控制面板 (可拖動)';

    const startButton = document.createElement('button');
    startButton.id = 'start-auto-export-button';
    startButton.textContent = '開始自動匯出';
    const stopButton = document.createElement('button');
    stopButton.id = 'stop-auto-export-button';
    stopButton.textContent = '停止自動匯出';
    stopButton.disabled = true;
    const clearCacheButton = document.createElement('button');
    clearCacheButton.id = 'clear-cache-button';
    clearCacheButton.textContent = '清理已處理快取';
    const statusDisplay = document.createElement('div');
    statusDisplay.id = 'auto-exporter-status';
    statusDisplay.textContent = '狀態：待命中';

    controlPanel.appendChild(dragHandle);
    controlPanel.appendChild(startButton);
    controlPanel.appendChild(stopButton);
    controlPanel.appendChild(clearCacheButton);
    controlPanel.appendChild(statusDisplay);

    if (document.body) {
        document.body.appendChild(controlPanel);
    } else {
        window.addEventListener('DOMContentLoaded', () => {
            if (document.body) document.body.appendChild(controlPanel);
        });
    }

    // --- 樣式 ---
    GM.addStyle(`
        #auto-exporter-control-panel {
            position: fixed; bottom: 20px; right: 20px; background-color: #2c2c2e;
            padding: 0; 
            border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.4);
            z-index: 9999; display: flex; flex-direction: column;
            border: 1px solid #444;
        }
        #auto-exporter-drag-handle {
            padding: 8px 15px;
            background-color: #3a3a3d; 
            color: #f0f0f0;
            cursor: move; 
            text-align: center;
            font-size: 13px;
            border-top-left-radius: 7px; 
            border-top-right-radius: 7px;
            border-bottom: 1px solid #444; 
            user-select: none; 
        }
        #auto-exporter-control-panel button {
            background-color: #772ce8; color: white; border: none; padding: 10px 15px;
            border-radius: 5px; cursor: pointer; font-size: 14px; transition: background-color 0.2s ease;
            margin: 8px 15px 0px 15px; 
        }
        #auto-exporter-control-panel button#clear-cache-button {
            background-color: #e91e63;
        }
        #auto-exporter-control-panel button#clear-cache-button:hover { background-color: #c2185b; }
        #auto-exporter-control-panel button:hover { background-color: #5c1f99; }
        #auto-exporter-control-panel button:disabled { background-color: #555; cursor: not-allowed; }
        #auto-exporter-status {
            color: #e0e0e0; font-size: 12px; text-align: center;
            padding: 10px 15px 12px 15px; 
        }
        .video-status-label-minidoracat { 
            position: absolute !important; top: 8px !important; right: 8px !important; 
            padding: 2px 6px !important; font-size: 10px !important; font-weight: bold !important;
            border-radius: 3px !important; z-index: 1001 !important; color: white;
            text-shadow: 0 0 2px rgba(0,0,0,0.7);
        }
        .clear-single-cache-button-minidoracat { 
            position: absolute !important;
            top: 8px !important; 
            right: 65px !important; 
            padding: 1px 5px !important;
            font-size: 10px !important;
            font-weight: bold !important;
            line-height: 1.2 !important;
            border-radius: 3px !important; 
            z-index: 1002 !important; 
            background-color: #e74c3c; 
            color: white;
            border: none;
            cursor: pointer;
            box-shadow: 0 1px 2px rgba(0,0,0,0.2);
            display: none; 
        }
        .clear-single-cache-button-minidoracat:hover {
            background-color: #c0392b;
        }
        a[href*="/u/minidoracat/content/video-producer/edit/"] div[data-target="video-card"] {
            position: relative !important;
        }
    `);

    // --- 控制面板拖動邏輯 ---
    let isDragging = false;
    let initialMouseX, initialMouseY;
    let initialPanelLeft, initialPanelTop;

    dragHandle.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        isDragging = true;
        initialMouseX = e.clientX;
        initialMouseY = e.clientY;
        initialPanelLeft = controlPanel.offsetLeft;
        initialPanelTop = controlPanel.offsetTop;

        const rect = controlPanel.getBoundingClientRect();
        controlPanel.style.left = `${rect.left}px`;
        controlPanel.style.top = `${rect.top}px`;
        controlPanel.style.right = 'auto';
        controlPanel.style.bottom = 'auto';
        initialPanelLeft = controlPanel.offsetLeft;
        initialPanelTop = controlPanel.offsetTop;

        dragHandle.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        e.preventDefault();
    });

    function onMouseMove(e) {
        if (!isDragging) return;
        e.preventDefault();

        const dx = e.clientX - initialMouseX;
        const dy = e.clientY - initialMouseY;

        let newLeft = initialPanelLeft + dx;
        let newTop = initialPanelTop + dy;

        const panelRect = controlPanel.getBoundingClientRect();
        if (newLeft < 0) newLeft = 0;
        if (newTop < 0) newTop = 0;
        if (newLeft + controlPanel.offsetWidth > window.innerWidth) newLeft = window.innerWidth - controlPanel.offsetWidth;
        if (newTop + controlPanel.offsetHeight > window.innerHeight) newTop = window.innerHeight - controlPanel.offsetHeight;

        controlPanel.style.left = `${newLeft}px`;
        controlPanel.style.top = `${newTop}px`;
    }

    function onMouseUp() {
        if (!isDragging) return;
        isDragging = false;
        dragHandle.style.cursor = 'move';
        document.body.style.userSelect = '';

        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }

    // --- 輔助函數 ---
    function debounce(func, delay) {
        let timeout;
        return function (...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), delay);
        };
    }

    async function getProcessedVideosWithExpiryCheck() {
        const data = await GM.getValue(PROCESSED_VIDEOS_STORAGE_KEY, '{}');
        let processedData;
        try { processedData = JSON.parse(data); } catch (e) { console.error("讀取快取錯誤:", e); return {}; }
        if (CACHE_EXPIRY_HOURS <= 0) {
            const validProcessed = {};
            for (const videoId in processedData) { if (processedData[videoId] === true || typeof processedData[videoId] === 'number') { validProcessed[videoId] = processedData[videoId]; } }
            return validProcessed;
        }
        const now = Date.now(); const expiryMilliseconds = CACHE_EXPIRY_HOURS * 60 * 60 * 1000; const validProcessedVideos = {};
        for (const videoId in processedData) { const timestamp = processedData[videoId]; if (typeof timestamp === 'number' && (now - timestamp < expiryMilliseconds)) { validProcessedVideos[videoId] = timestamp; } else if (processedData[videoId] === true && CACHE_EXPIRY_HOURS <= 0) { validProcessedVideos[videoId] = true; } }
        return validProcessedVideos;
    }
    async function saveProcessedVideo(videoId) {
        let processedVideos = await getProcessedVideosWithExpiryCheck();
        processedVideos[videoId] = Date.now();
        await GM.setValue(PROCESSED_VIDEOS_STORAGE_KEY, JSON.stringify(processedVideos));
        console.log(`影片 ${videoId} 已標記處理 (時間戳: ${processedVideos[videoId]})。`);
    }
    async function clearProcessedVideoCache() {
        if (confirm("確定清除所有已處理影片的快取嗎？")) {
            await GM.setValue(PROCESSED_VIDEOS_STORAGE_KEY, '{}');
            console.log("已處理快取已清除。"); statusDisplay.textContent = '狀態：快取已清除。';
            await initialScanAndAttachListeners(true); alert("快取已清除！");
        }
    }
    clearCacheButton.addEventListener('click', clearProcessedVideoCache);
    function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
    function isElementVisible(el) { if (!el) return false; const style = window.getComputedStyle(el); return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0); }
    function waitForElement(selector, timeout = 10000, parent = document) { return new Promise((resolve, reject) => { const iT = 100; let eT = 0; const i = setInterval(() => { const el = parent.querySelector(selector); if (el && isElementVisible(el)) { clearInterval(i); resolve(el); } else if (eT >= timeout) { clearInterval(i); console.warn(`等待元素 "${selector}" 超時`); reject(new Error(`E ${selector} not found`)); } eT += iT; }, iT); }); }
    function dispatchEventOnElement(element, eventName) { if (element) { try { const event = new Event(eventName, { bubbles: true, cancelable: true }); element.dispatchEvent(event); } catch (e) { console.error(`觸發事件 ${eventName} 錯誤:`, e); } } }

    function setNativeValue(element, value) {
        const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
        const prototype = Object.getPrototypeOf(element);
        const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

        if (valueSetter && valueSetter !== prototypeValueSetter) {
            prototypeValueSetter.call(element, value);
        } else {
            element.value = value;
        }
    }

    // --- 核心邏輯 ---
    async function clearSingleVideoCache(videoId, videoCardElement) {
        let processedVideos = await getProcessedVideosWithExpiryCheck();
        if (processedVideos.hasOwnProperty(videoId)) {
            delete processedVideos[videoId];
            await GM.setValue(PROCESSED_VIDEOS_STORAGE_KEY, JSON.stringify(processedVideos));
            console.log(`影片 ${videoId} 的快取已清除。`);
            statusDisplay.textContent = `狀態：影片 ${videoId} 快取已清除。`;
            if (videoCardElement) {
                addStatusLabel(videoCardElement, videoId, false);
            }
        } else {
            console.log(`影片 ${videoId} 不在快取中，無需清除。`);
        }
    }

    function addStatusLabel(videoCardElement, videoId, isProcessed) {
        const innerCardDiv = videoCardElement.querySelector('div[data-target="video-card"]');
        if (!innerCardDiv) return;

        let statusLabel = innerCardDiv.querySelector('.video-status-label-minidoracat');
        if (!statusLabel) {
            statusLabel = document.createElement('div');
            statusLabel.classList.add('video-status-label-minidoracat');
            innerCardDiv.appendChild(statusLabel);
        }
        statusLabel.textContent = isProcessed ? '已處理' : '未處理';
        statusLabel.style.backgroundColor = isProcessed ? 'green' : 'orange';
        statusLabel.style.color = isProcessed ? 'white' : 'black';

        let clearButton = innerCardDiv.querySelector(`.clear-single-cache-button-minidoracat[data-videoid="${videoId}"]`);
        if (!clearButton) {
            clearButton = document.createElement('button');
            clearButton.classList.add('clear-single-cache-button-minidoracat');
            clearButton.dataset.videoid = videoId;
            clearButton.title = `清除影片 ${videoId} 的快取`;
            clearButton.textContent = '✕';
            innerCardDiv.appendChild(clearButton);

            clearButton.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (confirm(`確定要清除影片 ${videoId} 的快取記錄嗎？這將允許它被重新匯出。`)) {
                    await clearSingleVideoCache(videoId, videoCardElement);
                }
            });
        }

        if (isProcessed) {
            clearButton.style.display = 'inline-block';
        } else {
            clearButton.style.display = 'none';
        }
    }

    async function processSingleVideoForAutoExport(videoCardElement) {
        if (!isAutoExporting) { return Promise.reject("Auto export stopped"); }
        const videoIdElement = videoCardElement.querySelector('div[data-video-id]'); const videoId = videoIdElement ? videoIdElement.dataset.videoId : null; if (!videoId) { console.warn('自動匯出：找不到影片 ID。'); return; }
        statusDisplay.textContent = `狀態：處理影片 ${videoId}...`; console.log(`自動匯出：開始處理影片 ${videoId}`);

        const titleElement = videoCardElement.querySelector('h5.CoreText-sc-1txzju1-0.crZNHn'); const originalTitle = titleElement ? titleElement.textContent.trim() : '無標題影片';
        const dateElement = videoCardElement.querySelector('div[data-test-selector="video-card-publish-date-selector"]'); const rawDate = dateElement ? dateElement.textContent.trim() : '未知日期';
        const gameElement = videoCardElement.querySelector('p.CoreText-sc-1txzju1-0.hufCyP > a.ScCoreLink-sc-16kq0mq-0.hcWFnG.tw-link > span.CoreText-sc-1txzju1-0'); const gameName = gameElement ? gameElement.textContent.trim() : '未知遊戲';
        console.log(`自動匯出：影片資訊 - ID: ${videoId}, 標題: "${originalTitle}", 日期: "${rawDate}", 遊戲: "${gameName}"`);

        try {
            const videoCardClickTarget = videoCardElement.querySelector('div[data-a-target="video-card-container"]') || videoCardElement;
            if (!videoCardClickTarget) {
                console.warn(`自動匯出：找不到影片 ${videoId} 的點擊目標 (video-card-container)。`);
                return;
            }
            videoCardClickTarget.click();
            console.log(`自動匯出：已點擊影片 ${videoId} 卡片。`);
            await delay(2500);

            const editModalSelector = 'div.edit-video-properties-modal__content';
            const editModal = await waitForElement(editModalSelector, 8000);
            console.log(`自動匯出：「編輯影片屬性」視窗已找到 (影片 ${videoId})。`);

            const exportButtonInEditModal = await waitForElement('button[data-test-selector="export-selector"]', 3500, editModal);
            exportButtonInEditModal.click();
            console.log(`自動匯出：已點擊「編輯影片屬性」視窗中的「匯出」按鈕 (影片 ${videoId})。`);
            await delay(2200);

            const youtubeModal = await waitForElement('div.export-youtube-modal', 8000);
            console.log(`自動匯出：YouTube 匯出視窗已找到 (影片 ${videoId})。`);
            const titleInput = youtubeModal.querySelector('input#ye-title');
            const descriptionTextarea = youtubeModal.querySelector('textarea#ye-description');
            const tagsInput = youtubeModal.querySelector('input#ye-tags');
            const startExportButton = youtubeModal.querySelector('button[data-test-selector="save"]');

            if (!titleInput || !descriptionTextarea || !tagsInput || !startExportButton) {
                console.warn(`自動匯出：YouTube 視窗部分欄位未找到 (影片 ${videoId})。`);
                const closeButton = youtubeModal.querySelector('button[aria-label="關閉強制回應"]');
                if (closeButton) closeButton.click();
                const closeEditModalButton = document.querySelector(`${editModalSelector} button[data-test-selector="CANCEL_TEST_SELECTOR"], ${editModalSelector} button[aria-label*="關閉"]`);
                if (closeEditModalButton) closeEditModalButton.click();
                return;
            }

            // 格式化日期
            let formattedVideoDate = ''; // YYYY-MM-DD
            if (rawDate !== '未知日期') {
                const dateMatch = rawDate.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
                if (dateMatch) {
                    formattedVideoDate = `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`;
                }
            }
            const displayDate = formattedVideoDate || rawDate; // 如果格式化失敗，使用原始日期

            // 準備模板變數
            const templateVars = {
                originalTitle: originalTitle,
                videoDate: displayDate,
                videoRawDate: rawDate,
                gameName: gameName,
                gameNameNoSpace: gameName.replace(/\s+/g, '')
            };

            // 生成標題
            const finalTitle = YOUTUBE_TITLE_TEMPLATE
                .replace(/{originalTitle}/g, templateVars.originalTitle)
                .replace(/{videoDate}/g, templateVars.videoDate)
                .replace(/{videoRawDate}/g, templateVars.videoRawDate);

            // 生成描述
            let existingDescription = descriptionTextarea.value.trim();
            let newContentForDescription = YOUTUBE_DESCRIPTION_APPEND_TEMPLATE
                .replace(/{videoRawDate}/g, templateVars.videoRawDate)
                .replace(/{gameName}/g, templateVars.gameName)
                .replace(/{gameNameNoSpace}/g, templateVars.gameNameNoSpace);

            let finalDescription;
            if (YOUTUBE_APPEND_TO_EXISTING_DESCRIPTION) {
                finalDescription = YOUTUBE_DESCRIPTION_PREPEND_TEXT;
                if (existingDescription) {
                    finalDescription += existingDescription + "\n" + newContentForDescription;
                } else {
                    finalDescription += newContentForDescription;
                }
            } else {
                finalDescription = newContentForDescription;
            }


            // 生成標籤
            const finalTags = YOUTUBE_TAGS_TEMPLATE
                .replace(/{gameName}/g, templateVars.gameName)
                .replace(/{gameNameNoSpace}/g, templateVars.gameNameNoSpace);


            const fieldsToFill = [
                { el: titleInput, value: finalTitle, name: "標題" },
                { el: descriptionTextarea, value: finalDescription, name: "描述" },
                { el: tagsInput, value: finalTags, name: "標籤欄位" }
            ];

            for (const field of fieldsToFill) {
                if (field.el) {
                    field.el.focus();
                    await delay(100);
                    setNativeValue(field.el, field.value);
                    dispatchEventOnElement(field.el, 'input');
                    await delay(100);
                    dispatchEventOnElement(field.el, 'change');
                    await delay(100);
                    field.el.blur();
                    await delay(100);
                    console.log(`自動匯出：${field.name} 設定為: "${field.el.value}" (DOM value), 預期為: "${field.value}"`);
                }
            }
            console.log(`自動匯出：已嘗試填寫 YouTube 資訊 (影片 ${videoId})。`);
            await delay(100);

            const targetRadioButtonValue = YOUTUBE_VISIBILITY === "private" ? "true" : "false";
            const visibilityRadioButton = youtubeModal.querySelector(`input[type="radio"][name^="video-manager-youtube-export-privacy-"][value="${targetRadioButtonValue}"]`);

            if (visibilityRadioButton && !visibilityRadioButton.checked) {
                visibilityRadioButton.click();
                console.log(`自動匯出：已選擇「${YOUTUBE_VISIBILITY}」匯出 (影片 ${videoId})。`);
                await delay(500);
            } else if (!visibilityRadioButton) {
                console.warn(`自動匯出：找不到 ${YOUTUBE_VISIBILITY} Radio Button (影片 ${videoId})。嘗試尋找 Public/私人文字。`);
                const allRadioLabels = youtubeModal.querySelectorAll('label.tw-radio__label');
                let targetRadioInput = null;
                allRadioLabels.forEach(label => {
                    const labelText = label.textContent.trim().toLowerCase();
                    if ((YOUTUBE_VISIBILITY === "private" && labelText === "私人") ||
                        (YOUTUBE_VISIBILITY === "public" && labelText === "public")) {
                        const inputId = label.getAttribute('for');
                        if (inputId) {
                            targetRadioInput = youtubeModal.querySelector(`input#${inputId}`);
                        }
                    }
                });

                if (targetRadioInput && !targetRadioInput.checked) {
                    targetRadioInput.click();
                    console.log(`自動匯出：已透過 Label 文字選擇「${YOUTUBE_VISIBILITY}」匯出 (影片 ${videoId})。`);
                    await delay(500);
                } else if (!targetRadioInput) {
                     console.warn(`自動匯出：仍然找不到 ${YOUTUBE_VISIBILITY} Radio Button (影片 ${videoId})。`);
                } else if (targetRadioInput.checked) {
                    console.log(`自動匯出：透過 Label 文字找到的 ${YOUTUBE_VISIBILITY} Radio Button 已勾選 (影片 ${videoId})。`);
                }

            } else {
                console.log(`自動匯出：${YOUTUBE_VISIBILITY} Radio Button 已勾選 (影片 ${videoId})。`);
            }


            startExportButton.click();
            console.log(`自動匯出：已點擊「開始匯出」 (影片 ${videoId})。`);
            await saveProcessedVideo(videoId);
            addStatusLabel(videoCardElement, videoId, true);
            await delay(1200);

            const stillOpenYoutubeModal = document.querySelector('div.export-youtube-modal button[aria-label="關閉強制回應"]');
            if (stillOpenYoutubeModal && isElementVisible(stillOpenYoutubeModal)) {
                console.log(`自動匯出：嘗試關閉殘留的 YouTube 匯出視窗 (影片 ${videoId})。`);
                stillOpenYoutubeModal.click();
                await delay(200);
            }
            const stillOpenEditModal = document.querySelector(`${editModalSelector} button[data-test-selector="CANCEL_TEST_SELECTOR"], ${editModalSelector} button[aria-label*="關閉"]`);
            if (stillOpenEditModal && isElementVisible(stillOpenEditModal)) {
                console.log(`自動匯出：嘗試關閉殘留的編輯視窗 (影片 ${videoId})。`);
                stillOpenEditModal.click();
                await delay(200);
            }

        } catch (error) {
            console.error(`自動匯出：處理影片 ${videoId} 錯誤:`, error);
            statusDisplay.textContent = `狀態：處理影片 ${videoId} 失敗。`;
            const openYoutubeModalCloseButton = document.querySelector('div.export-youtube-modal button[aria-label="關閉強制回應"]');
            if (openYoutubeModalCloseButton && isElementVisible(openYoutubeModalCloseButton)) openYoutubeModalCloseButton.click();
            await delay(200);
            const openEditModalCloseButton = document.querySelector(`div.edit-video-properties-modal__content button[data-test-selector="CANCEL_TEST_SELECTOR"], div.edit-video-properties-modal__content button[aria-label*="關閉"]`);
            if (openEditModalCloseButton && isElementVisible(openEditModalCloseButton)) openEditModalCloseButton.click();
        }
    }

    async function startAutoExport() {
        if (isAutoExporting) return;
        isAutoExporting = true;
        startButton.disabled = true;
        stopButton.disabled = false;
        statusDisplay.textContent = '狀態：開始自動匯出多頁...';
        console.log("開始自動匯出多頁...");

        let currentPage = 1;
        let hasNextPage = true;

        do {
            if (!isAutoExporting) {
                console.log("自動匯出已在換頁前停止。");
                break;
            }

            statusDisplay.textContent = `狀態：掃描第 ${currentPage} 頁...`;
            console.log(`自動匯出：開始處理第 ${currentPage} 頁。`);

            await delay(1500);
            await initialScanAndAttachListeners(true);

            const processedVideos = await getProcessedVideosWithExpiryCheck();
            const allVideoCardElementsOnPage = document.querySelectorAll('a[href*="/u/minidoracat/content/video-producer/edit/"]');

            const videosToProcessOnThisPage = Array.from(allVideoCardElementsOnPage).filter(cardElement => {
                const videoId = cardElement.querySelector('div[data-video-id]')?.dataset.videoId;
                return videoId && !processedVideos[videoId];
            });

            if (videosToProcessOnThisPage.length === 0) {
                statusDisplay.textContent = `狀態：第 ${currentPage} 頁無未處理影片。`;
                console.log(`自動匯出：第 ${currentPage} 頁無未處理影片。`);
            } else {
                statusDisplay.textContent = `狀態：第 ${currentPage} 頁找到 ${videosToProcessOnThisPage.length} 個影片，開始處理。`;
                console.log(`自動匯出：第 ${currentPage} 頁佇列 ${videosToProcessOnThisPage.length} 個影片。`);

                for (let i = 0; i < videosToProcessOnThisPage.length; i++) {
                    if (!isAutoExporting) {
                        console.log("自動匯出已在處理影片時停止。");
                        break;
                    }
                    const videoCard = videosToProcessOnThisPage[i];
                    const videoId = videoCard.querySelector('div[data-video-id]')?.dataset.videoId || '未知ID';
                    console.log(`自動匯出：處理第 ${currentPage} 頁影片 ${i + 1} / ${videosToProcessOnThisPage.length} (ID: ${videoId})`);

                    try {
                        currentExportPromise = processSingleVideoForAutoExport(videoCard);
                        await currentExportPromise;
                        currentExportPromise = null;
                        if (isAutoExporting) await delay(4500 + Math.random() * 2000);
                    } catch (error) {
                        if (String(error).includes("Auto export stopped")) {
                            console.log("processSingleVideoForAutoExport 中斷");
                            break;
                        }
                        console.error(`自動匯出：處理影片 ${videoId} (第 ${currentPage} 頁) 頂層錯誤:`, error);
                    }
                }
                if (!isAutoExporting) break;
            }

            const nextPageButton = document.querySelector('button[aria-label="下一頁"]:not([disabled])');
            if (nextPageButton && isAutoExporting) {
                statusDisplay.textContent = `狀態：第 ${currentPage} 頁處理完畢，前往下一頁...`;
                console.log("自動匯出：點擊下一頁按鈕。");
                nextPageButton.click();
                currentPage++;
                hasNextPage = true;
                await delay(5000);
            } else {
                hasNextPage = false;
                if (isAutoExporting) {
                    console.log("自動匯出：已到達最後一頁或下一頁按鈕不可用。");
                } else {
                    console.log("自動匯出已停止，不再翻頁。");
                }
            }

        } while (isAutoExporting && hasNextPage);

        if (isAutoExporting) {
            statusDisplay.textContent = '狀態：所有頁面影片已處理完畢！';
            console.log("自動匯出：所有頁面影片已處理。");
        }
        stopAutoExport(false);
    }

    function stopAutoExport(manual = true) {
        isAutoExporting = false;
        startButton.disabled = false;
        stopButton.disabled = true;
        if (manual) {
            statusDisplay.textContent = '狀態：自動匯出已停止。';
            console.log("自動匯出已手動停止。");
        } else {
            if (statusDisplay.textContent !== '狀態：所有頁面影片已處理完畢！') {
                statusDisplay.textContent = '狀態：自動匯出已完成或停止。';
            }
        }
        if (currentExportPromise) console.log("嘗試中斷目前處理...");
        autoExportQueue = [];
    }
    startButton.addEventListener('click', startAutoExport);
    stopButton.addEventListener('click', () => stopAutoExport(true));

    async function initialScanAndAttachListeners(forceUpdate = false) {
        const processedVideos = await getProcessedVideosWithExpiryCheck();
        const allVideoCardElements = document.querySelectorAll('a[href*="/u/minidoracat/content/video-producer/edit/"]');
        if (forceUpdate) console.log("強制更新標籤..."); else console.log(`初始掃描：找到 ${allVideoCardElements.length} 卡片。`);
        allVideoCardElements.forEach(cardElement => {
            if (forceUpdate || cardElement.dataset.scriptProcessed !== 'true') {
                const videoId = cardElement.querySelector('div[data-video-id]')?.dataset.videoId;
                if (videoId) addStatusLabel(cardElement, videoId, !!processedVideos[videoId]);
                cardElement.dataset.scriptProcessed = 'true';
            }
        });
    }

    const debouncedScan = debounce(async () => {
        console.log("觀察到 DOM 變動 (Debounced)，重新掃描標籤...");
        await initialScanAndAttachListeners(true);
    }, DEBOUNCE_SCAN_DELAY);

    const observer = new MutationObserver(async (mutationsList) => {
        let significantChange = false;
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList') {
                if (mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.querySelector('a[href*="/u/minidoracat/content/video-producer/edit/"]')) {
                                significantChange = true;
                            }
                            if (node.matches && node.matches('a[href*="/u/minidoracat/content/video-producer/edit/"]')) {
                                significantChange = true;
                            }
                        }
                    });
                }
                if (mutation.removedNodes.length > 0) {
                    mutation.removedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.querySelector('a[href*="/u/minidoracat/content/video-producer/edit/"]')) {
                                significantChange = true;
                            }
                            if (node.matches && node.matches('a[href*="/u/minidoracat/content/video-producer/edit/"]')) {
                                significantChange = true;
                            }
                        }
                    });
                }
            }
        }
        if (significantChange && !isAutoExporting) {
            debouncedScan();
        }
    });

    function initializeObserverAndScan() {
        const mainContentArea = document.querySelector('main div[class*="video-producer-page"], main div[class*="producer-content-wrapper"]');
        let targetNode = mainContentArea || document.querySelector('main') || document.body;
        console.log('觀察器目標:', targetNode.id || targetNode.className || targetNode.tagName);
        observer.observe(targetNode, { childList: true, subtree: true });
        initialScanAndAttachListeners();
    }
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(initializeObserverAndScan, 4000);
    } else {
        window.addEventListener('load', () => setTimeout(initializeObserverAndScan, 4000));
    }
})();
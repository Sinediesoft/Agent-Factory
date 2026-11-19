# Agent Factory

Agent Factory MVP 的第一個可運行版本：七設備、雙臂、六件手機外殼模具工件的事件排程與 3D 回放。所有幾何、非加工時間與工件資料都是 `synthetic_demo`。完整產品規格見 [v1.74 企劃書](factory-agent-proposal.html)，交接基準見 [CODEX_HANDOFF.md](CODEX_HANDOFF.md)。原始 v1.8 企劃書保留於 [docs/archive/factory-agent-proposal-v1.8.html](docs/archive/factory-agent-proposal-v1.8.html)。

## 啟動

需求：Node.js 20.19+、npm。此專案在 Node.js 26.11.1 驗證。

```sh
npm install
npm run dev
```

開啟 `http://127.0.0.1:5173/app.html`。`http://127.0.0.1:5173/` 保留 v1.74 企劃書與舊 2D 原型。

```sh
npm test       # 新模擬核心與舊 2D 原型
npm run build  # 產生 dist/app.html 與 dist/index.html
```

`npm run preview` 可檢查靜態建置成果。`/api/interpret` 是開發伺服器上的本機 API；純靜態預覽沒有 LLM 後端。

此分支的 CNC-L01 已接入以 FANUC ROBODRILL α-D21MiB5 Plus 為外觀參考的 Onshape 模型，包含單扇滑門、斜紋視窗與右側操作面板。「CNC-L01 上下料試播」可回放首件工件從上料到完工取件的流程。[模型與重建方式](tools/onshape/README.md)

## 已實作

- 固定六道順序：`L01/R01 → GRIND → WIRE → R02 → EDM → L02 → FG`，六件逐件流轉；粗加工 4+8 分鐘，每件淨加工 47 分鐘。
- 兩臂按同一任務「最早開始取放動作 → 較少換爪 → R1」選擇，接單後用目前預約表重新排入路徑。加工與手臂工作可非同步重疊。
- 工具共有兩把 ROUGH、兩把 PROTECT，具唯一 ID 和固定槽位；研磨完成後下料使用 PROTECT。首次裝爪不卸舊爪。
- 六組支軌整條互斥、主環順向分段預約、區內環預約、轉盤與停靠位計時；移動前一次排入完整路徑，不在未定義的段界等待。
- RAW / WIP / FG 有限槽位。目的地滿載時保留源站工件；WIP 在下游忙碌時暫存，FG 滿載會阻擋完成。
- Blender 製作的七設備、雙臂與完整九環軌道已接入 Three.js 場景。3D 軌道包含雙鋼軌、枕木、六座轉盤、14 個停靠端點；轉盤、設備滑門、三色機台狀態燈、關節與兩種夾爪受事件回放控制。紅燈為異常、橘燈為運行中、綠燈為程式完成待收料；固定正常示範不會亮紅燈。上方切換「全景」、「機外監視」、「機內監視」；各工作區透過機外監視的工作區選單切換。模型顯示比例滑動條可在 70%–200% 間調整，預設 110% 並記住選擇，不改變排程座標與時間。甘特圖、事件追溯、播放、暫停、倍率與時間軸沿用。暫停後必須手動繼續。
- 監視系統提供 CNC、研磨、線割、放電、料倉及雙臂 / 換爪區切換，使用同一 3D 回放充當模擬監視畫面。「機內全景」隔離選定機台，移開外殼，放大主軸／加工頭與夾具；加工時依模擬時鐘顯示加工頭移動、接觸點效果與進度。「加工動畫演示」會跳到所選機台的示範加工，播完該工件的連續工序後暫停。「機外工作區」依設備位置從右上方 45° 自動框住整區，顯示該區機台的狀態燈；全景與機外監視都可點選機台燈號或標籤直達機內監視。料倉及換爪區使用機外視角。監視畫面大小可在 65%–100% 間調整並記住選擇，目前沒有接入實體攝影機。
- 模擬執行帳本 `src/execution-ledger.js` 分開接受、執行、未知、完成與失敗；重送同 ID 不重複建立，未知或未確認清空時保留占用。
- 可選的 OpenAI Responses API 需求摘要入口。只匹配版本化 `PHONE-MOLD-6` 配方；模型輸出經後端欄位檢查，不直接生成工藝或控制命令。

## LLM 設定

將 `.env.example` 複製成 `.env.local`，在本機填入 `OPENAI_API_KEY` 後重啟 `npm run dev`。沒有金鑰時，按「解析需求」會明確顯示服務不可用，固定示範工單仍可回放。金鑰不會打包進前端；`.env.local` 已由 `.gitignore` 排除。本次環境沒有 API key，因此沒有完成真實 API 呼叫驗證。

## 合成示範參數

集中設定於 [src/config.js](src/config.js)。主環六個接點、8 個半徑 2 m 的區內環、六組支軌、14 個停靠接入段；軌道參考高度 0.2 m、軌距 0.58 m、枕木間距約 0.9 m，速度 0.5 m/s，轉盤半徑 1.1 m，最小時間刻度 0.1 秒。路網 3D 幾何由 [src/track-layout.js](src/track-layout.js) 產生，尚未加入可編輯的 ARC90 / ARC180 元件。CNC 開門 / 關門各 3 秒、伸入 / 退出各 4 秒、夾爪夾緊 / 張開各 2 秒、治具夾緊 / 鬆開各 2 秒、對位 2 秒、放件 / 抽件各 3 秒。其他設備、庫存與換爪時間亦列在設定檔，沒有套用 CNC 動作鏈。

Blender 可編輯場景、GLB 與重建方法見 [docs/BLENDER_MODELS.md](docs/BLENDER_MODELS.md)。本次沒有可用的 Blender MCP，因此以 Blender `bpy` 產出；模型是示範概念，並非原廠 CAD。

預設六件結果：36 筆必要加工完成、6 筆 FG 放置確認，RAW / WIP / FG 從 `6/0/0` 到 `0/0/6`，淨加工工作量 282 機台分鐘，模擬完工時間約 199.44 分鐘。這是確定性貪婪排程的結果，不是全域最優解。

## 明確尚未完成

- 基本 3D 情境編輯、獨立機台 / 停靠位 / 軌道拖曳、復原 / 重做及改版重驗。
- 校正過的幾何、完整 3D 掃掠碰撞、轉轍機構與服務區四工具槽的實際可達性驗證。現有軌道模型是合成示範，資源互斥驗證不代表物理機構可建造。
- 執行時手動補料 / 移走成品、故障注入後的動態重排與完整異常復原 UI。執行帳本目前是獨立核心契約，尚未連接實機 Adapter。
- 真實 LLM 端到端驗證，現場 FANUC / 其他設備型號、G-code、OT 安全互鎖、MES/ERP 與實機接線。

## 檔案

| 路徑 | 用途 |
| --- | --- |
| `app.html`, `src/app.js`, `src/style.css` | 新 3D MVP 入口與畫面 |
| `src/config.js` | 合成設定與版本化配方 |
| `src/track-layout.js`, `tools/track-layout.json`, `tools/build_track.py` | 軌道路網來源與 Blender 建模 |
| `src/sim.js` | 事件排程、移動 / 動作 / 資源預約、驗證 |
| `src/playback.js` | 同一模擬時鐘的回放狀態 |
| `src/machine-status.js` | 機台三色狀態燈的顏色與文案對應 |
| `src/monitor.js` | 監視工作區、機內加工區與機外全景鏡頭座標 |
| `src/machining-animation.js` | 隨模擬 tick 重現的加工動作與連續工序範圍 |
| `src/execution-ledger.js` | 執行確認與占用保留契約 |
| `src/agent-server.js` | 本機可選 LLM API 與輸出檢查 |
| `tests/sim.test.js` | 新模擬核心測試 |
| `index.html`, `test-demo.cjs` | v1.74 企劃書與舊 2D 原型 |

技術選型參考 [Three.js 官方安裝說明](https://threejs.org/manual/pages/installation.html)、[Vite 官方指南](https://vite.dev/guide/) 與 [OpenAI API 官方文件](https://platform.openai.com/docs/api-reference/responses)。

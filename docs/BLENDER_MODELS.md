# Blender 3D 模型交付

這是 Agent Factory 的 **合成示範資產**。使用 Blender 4.5.16 LTS 的 Python API 建立；本機沒有可用的 Blender MCP 連線，因此此次透過 `bpy` 執行建模與 GLB 匯出。沒有使用原廠 CAD、實機量測或官方 3D 模型。

## 資產

| 檔案 | 內容 |
| --- | --- |
| [`agent-factory-scene.blend`](../agent-factory-scene.blend) | 可編輯的七設備、雙臂與完整九環軌道場景 |
| [`public/models/cnc.glb`](../public/models/cnc.glb) | 四台 CNC 共用的 FANUC 風格示範外觀 |
| [`public/models/grind.glb`](../public/models/grind.glb) | 平面磨床示範外觀 |
| [`public/models/wire.glb`](../public/models/wire.glb) | 線割設備示範外觀 |
| [`public/models/edm.glb`](../public/models/edm.glb) | 放電設備示範外觀 |
| [`public/models/robot.glb`](../public/models/robot.glb) | R1 / R2 共用的軌道載台與關節手臂 |
| [`public/models/track.glb`](../public/models/track.glb) | 主環、8 個區內環、6 組支軌、14 個停靠接入段與 6 座轉盤 |
| [`docs/visuals/agent-factory-blender-preview.png`](visuals/agent-factory-blender-preview.png) | Blender 全景預覽圖 |
| [`docs/visuals/agent-factory-cnc-detail.png`](visuals/agent-factory-cnc-detail.png) | 四台 CNC 的近景 |
| [`docs/visuals/agent-factory-robot-detail.png`](visuals/agent-factory-robot-detail.png) | 雙臂的近景 |
| [`docs/visuals/agent-factory-track-detail.png`](visuals/agent-factory-track-detail.png) | 軌道雙軌、枕木、轉盤與區內環近景 |
| [`tools/build_blender_models.py`](../tools/build_blender_models.py) | 可重建模型的 Blender Python 腳本 |
| [`tools/build_track.py`](../tools/build_track.py) | 依布局資料建構雙軌、枕木、轉盤與端點的腳本 |
| [`src/track-layout.js`](../src/track-layout.js) | 網頁與 Blender 共用的合成軌道布局來源 |
| [`tools/track-layout.json`](../tools/track-layout.json) | 從布局來源自動匯出的 Blender 輸入 |
| [`tools/render_blender_details.py`](../tools/render_blender_details.py) | 從 `.blend` 輸出近景預覽 |

網頁用 `GLTFLoader` 載入 GLB，並沿用原本的模擬事件。機台模型提供 `Door_L`、`Door_R`、`StatusRed`、`StatusYellow`、`StatusGreen` 節點；手臂模型提供 `Shoulder`、`Elbow`、`Wrist`、`ToolRough`、`ToolProtect` 節點。軌道模型提供 `Rotor_CNC` 等六個轉盤節點與 14 個 `Dock_*` 停靠端點；轉盤角度跟隨預約時段回放。模型載入失敗時保留簡化備援模型，畫面會顯示載入失敗訊息。

每台機台的三段燈柱由回放狀態控制：紅色表示異常，黃色表示加工運行中，綠色表示程式執行完畢、等待收料；閒置時燈光熄滅。`machine_faulted` 和 `machine_recovered` 事件可驅動紅燈，異常狀態會維持到解除事件。固定六件正常示範不產生異常事件；目前燈號只呈現狀態，不包含故障停機與重新排程。

網頁監視模式使用同一份回放場景。機內視角會隔離選定機台、暫時隱藏外殼與周邊物件，將主軸／加工頭、工件及夾具放大置中。加工事件期間，模型加工頭、接觸點粒子及進度依模擬 tick 更新；暫停與跳轉時間軸會重現對應畫面。「加工動畫演示」會跳到所選機台的加工區段，播完同一工件的連續工序後暫停。機外視角從右上方 45° 依工作區設備位置自動取全景。離開監視模式後恢復所有場景物件。這是合成動畫與視覺透視效果，並非實際攝影機影像。

軌道為 0.58 m 軌距的雙鋼軌，以約 0.9 m 間距配置枕木；主環、區內環、支軌與停靠段各有不同色帶。`sharedArcRadiusM = 2` 現在直接決定八個區內環半徑，軌道參考高度為 0.2 m。這些數值都是示範工程參數。

## 重建

已安裝 Blender 4.5 LTS 且可呼叫 `blender` 時：

```sh
blender --background --python tools/build_blender_models.py
```

本次環境使用 PyPI 的 `bpy==4.5.16`，執行腳本的 Python 為 3.11。`bpy` 須能在 Blender 的環境或支援的 Python 環境載入，並需有 Node.js 以匯出最新軌道布局。腳本會覆寫同名的六個 GLB、`.blend` 和預覽 PNG。

## 建模依據與界線

四台 CNC 參考 [FANUC ROBODRILL 官方系列介紹](https://www.fanuc.eu/eu-en/robodrill-compact-cnc-machining-centers) 的封閉式機台、黃色門框與控制面板方向；線割參考 [FANUC ROBOCUT 官方介紹](https://www.fanuc.eu/uk-en/robocut-wire-cut-edm-machines)；手臂參考 [FANUC M-10 系列](https://www.fanucamerica.com/products/series/m-10) 的黃色關節形式。這些是視覺參考，**沒有指定真實機型**。研磨與放電機採合成示範外觀；企劃書的 FANUC 控制器方向不等於這兩台設備已選定 FANUC 製造機型。

模型尺寸以現有公尺制示範布局為準，外部停靠位與機台中心分開。軌道網路的接點、環路閉合與停靠端點已由測試檢查；目前沒有求解實際車體包絡、轉轍機構、完整掃掠碰撞或實機可達性，仍屬視覺與流程示範。

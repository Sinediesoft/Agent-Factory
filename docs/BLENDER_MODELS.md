# Blender 3D 模型交付

這是 Agent Factory 的 **合成示範資產**。使用 Blender 4.5.16 LTS 的 Python API 建立；本機沒有可用的 Blender MCP 連線，因此此次透過 `bpy` 執行建模與 GLB 匯出。沒有使用原廠 CAD、實機量測或官方 3D 模型。

## 資產

| 檔案 | 內容 |
| --- | --- |
| [`agent-factory-scene.blend`](../agent-factory-scene.blend) | 可編輯的八設備、雙臂與完整九環軌道場景 |
| [`public/models/cnc.glb`](../public/models/cnc.glb) | CNC 的主軸、工作台、治具與備援外觀 |
| [`public/models/cnc-l01-shell.glb`](../public/models/cnc-l01-shell.glb) | 四台 CNC 共用的 Onshape 外殼、單滑門與三色燈柱 |
| [`public/models/grind.glb`](../public/models/grind.glb) | ComfyUI 研磨機外殼、左開滑門、磁力工作台、水平主軸砂輪與弧形護罩 |
| [`public/models/wire.glb`](../public/models/wire.glb) | ComfyUI 固定外殼、升降槽門、電極線與上下線導頭 |
| [`public/models/edm.glb`](../public/models/edm.glb) | ComfyUI 雙柱式外殼、升降槽門、滑枕與成形銅電極 |
| [`public/models/cmm.glb`](../public/models/cmm.glb) | ComfyUI 固定外殼、花崗岩量測台、安全滑門、可動測頭與三色燈柱 |
| [`public/models/robot.glb`](../public/models/robot.glb) | R1 / R2 共用的滑座、ComfyUI 上臂／前臂／腕部外殼、法蘭、粗加工與保護夾爪 |
| [`public/models/track.glb`](../public/models/track.glb) | 主環、8 個區內環、6 組支軌、15 個停靠接入段與 6 座轉盤 |
| [`docs/visuals/cmm-01-preview.png`](visuals/cmm-01-preview.png) | CMM-01 於場景中的近景 |
| [`docs/visuals/agent-factory-blender-preview.png`](visuals/agent-factory-blender-preview.png) | Blender 全景預覽圖 |
| [`docs/visuals/agent-factory-cnc-detail.png`](visuals/agent-factory-cnc-detail.png) | 四台 CNC 的近景 |
| [`docs/visuals/agent-factory-robot-detail.png`](visuals/agent-factory-robot-detail.png) | 雙臂的近景 |
| [`docs/visuals/agent-factory-track-detail.png`](visuals/agent-factory-track-detail.png) | 軌道雙軌、枕木、轉盤與區內環近景 |
| [`tools/build_blender_models.py`](../tools/build_blender_models.py) | 可重建模型的 Blender Python 腳本 |
| [`tools/build_track.py`](../tools/build_track.py) | 依布局資料建構雙軌、枕木、轉盤與端點的腳本 |
| [`src/track-layout.js`](../src/track-layout.js) | 網頁與 Blender 共用的合成軌道布局來源 |
| [`tools/track-layout.json`](../tools/track-layout.json) | 從布局來源自動匯出的 Blender 輸入 |
| [`tools/render_blender_details.py`](../tools/render_blender_details.py) | 從 `.blend` 輸出近景預覽 |

網頁用 `GLTFLoader` 載入 GLB，並沿用原本的模擬事件。CNC 外殼提供 `SlidingDoor`、`StackRed`、`StackOrange`、`StackGreen`。WIRE-01 與 EDM-01 都使用 `TankGate` 和資產的 `stroke` 行程驅動升降槽門。WIRE-01 移動線導頭，EDM-01 則沿垂直軸移動滑枕及銅電極。[WIRE-01 生成與驗證](../tools/comfyui/wire/README.md) · [EDM-01 生成與驗證](../tools/comfyui/edm/README.md)

GRIND-01 使用 `SlidingDoor` 與資產的 `stroke` 水平開門。水平主軸帶動砂輪旋轉，研磨頭在工件上方往復掃過五道。研磨機面板參考 FANUC CNC 研磨應用，機身尺寸依示範場景設計。[FANUC 研磨應用](https://www.fanuc.eu/eu-en/application/cnc-grinding) · [GRIND-01 生成與驗證](../tools/comfyui/grind/README.md)

CMM-01 使用經 ComfyUI 驗證淨空的 `cmm-depth-enclosure` 固定外殼、可滑動的 `SlidingDoor`，以及 `probe-carriage`、`probe-quill`、`probe-stylus`、`probe-tip` 四個可動節點。品檢前後測頭停在工件上方，量測時依模擬 tick 沿工件表面往復掃描。這是示範量測動作，尚未定義公差與判定。[CMM-01 生成與測試](../tools/comfyui/cmm/README.md)

手臂模型提供 `Shoulder`、`Elbow`、`Wrist`、`ToolRough`、`ToolProtect` 節點。軌道模型提供 `Rotor_CNC` 等六個轉盤節點與 15 個 `Dock_*` 停靠端點，轉盤角度跟隨預約時段回放。模型載入失敗時保留簡化備援模型，畫面會顯示載入失敗訊息。

每台機台的三段燈柱由回放狀態控制：綠色表示機台運行中，橘色表示工序完成、等待收料，紅色表示異常；閒置時燈光熄滅。`machine_faulted` 和 `machine_recovered` 事件可驅動紅燈，異常狀態會維持到解除事件。固定六件正常示範不產生異常事件；目前燈號只呈現狀態，不包含故障停機與重新排程。

網頁監視模式使用同一份回放場景。機內視角會隔離選定機台、暫時隱藏外殼與周邊物件，將加工頭或量測測頭、工件及夾具放大置中。工序期間，可動零件、接觸點效果及進度依模擬 tick 更新；暫停與跳轉時間軸會重現對應畫面。「工序動畫演示」會跳到所選機台的工序區段，播完同一工件的連續工序後暫停。機外視角從工作區正面上方 45° 依設備位置自動取全景。離開監視模式後恢復所有場景物件。這是合成動畫與視覺透視效果，並非實際攝影機影像。

軌道為 0.58 m 軌距的雙鋼軌，以約 0.9 m 間距配置枕木；主環、區內環、支軌與停靠段各有不同色帶。`sharedArcRadiusM = 2` 現在直接決定八個區內環半徑，軌道參考高度為 0.2 m。這些數值都是示範工程參數。

## 重建

已安裝 Blender 4.5 LTS 且可呼叫 `blender` 時：

```sh
blender --background --python tools/build_blender_models.py
```

本次環境使用 PyPI 的 `bpy==4.5.16`，執行腳本的 Python 為 3.11。`bpy` 須能在 Blender 的環境或支援的 Python 環境載入，並需有 Node.js 以匯出最新軌道布局。腳本會覆寫同名的六個 GLB、`.blend` 和預覽 PNG。

## 建模依據與界線

四台 CNC 參考 [FANUC ROBODRILL 官方系列介紹](https://www.fanuc.eu/eu-en/robodrill-compact-cnc-machining-centers) 的封閉式機台、黃色門框與控制面板方向；線割參考 [FANUC ROBOCUT 官方介紹](https://www.fanuc.eu/uk-en/robocut-wire-cut-edm-machines)；手臂參考 [FANUC M-10 系列](https://www.fanucamerica.com/products/series/m-10) 的黃色關節形式。這些是視覺參考，**沒有指定真實機型**。研磨與放電機採合成示範外觀；企劃書的 FANUC 控制器方向不等於這兩台設備已選定 FANUC 製造機型。

模型尺寸採現有公尺制示範布局，外部停靠位對準各機台正門。軌道接點、環路閉合與停靠端點均有測試。雙臂使用匯出後的幾何，每 0.1 秒檢查一次預設六件工件的沿軌移動、換爪、正門上下料與回程。連續掃掠碰撞及實機可達性需要另外驗證。[手臂建模與驗證範圍](../tools/comfyui/robot/README.md)

# EDM-01 成形放電機與正門上下料

EDM-01 採雙柱式機身、前方升降槽門與垂直銅電極。機身尺寸依場景的軌道、夾爪與工件配置。固定外殼由本機 ComfyUI 生成，槽門、滑枕、銅電極與治具由 Blender 組裝，讓回放能獨立驅動各個零件。[組裝程式](../../build_blender_models.py) · [可直接載入的 GLB](../../../public/models/edm.glb)

## 在本機重新生成

1. 準備 ComfyUI 0.3.59 與量化的 Depth Anything V2 Small。沿用 WIRE-01 的 CPU 環境、Python 套件與約 26 MiB 的模型權重。[環境與權重設定](../wire/README.md)
2. 把 [共用深度節點](../wire/wire_depth.py) 放進 ComfyUI 的 `custom_nodes/`，將 [EDM-01 的四張參考圖](reference/) 複製到 `input/`。如需修改機身輪廓，可先用 Blender 執行 [render_guides.py](render_guides.py) 重新產生四個視角。
3. 以 `--cpu --listen 127.0.0.1 --port 8197` 啟動 ComfyUI，從專案根目錄送出 [工作流程](edm-depth.api.json)。

   ```sh
   jq '{prompt: .}' tools/comfyui/edm/edm-depth.api.json | curl --fail-with-body -H 'Content-Type: application/json' --data-binary @- http://127.0.0.1:8197/prompt
   ```

4. 查詢 `/history/<prompt_id>`。將成功任務中 `SaveGLB` 輸出的模型複製為 [edm-depth.glb](edm-depth.glb)，再重新匯出場景。網頁回放直接讀取組裝後的 GLB。[Blender 重建方式](../../../docs/BLENDER_MODELS.md)

本次本機任務 `bde858f1-34fe-4747-89c7-9b59337712e0` 在 CPU 上完成，四視圖重建工作流程耗時 2.41 秒，輸出 12,000 個三角面。原始 GLB 的 SHA-256 為 `889efd737dd82b0b7478f75a0a63f907c4f9ecd65d2809b5d26ba543dfaf7361`。

## 試播與驗證

在 `/app.html` 選取 **EDM-01**，按「上下料試播」。隨附錄影中，首件 P01 抵達時，槽門下降開啟，R2 從正面將工件放到治具上。空爪退出、槽門升起關閉後，機台亮橘燈，銅電極下降放電。電極退回後亮綠燈，R2 再從正門取件離站。錄影以快轉呈現 10 分鐘的模擬加工，並保留燈柱與加工區特寫。[觀看 26 秒完整試播](../../../docs/visuals/edm-01-full-cycle.mp4)

`npm test` 載入匯出的模型，以 0.1 秒為間隔檢查首件正門上下料的機械干涉、放電時的電極間隙，以及六件工件的加工與下料順序。動畫使用火花與表面痕跡表達加工進度。此模型用於流程與動作驗證，放電間隙為展示值，未模擬實際蝕除深度或介電液。

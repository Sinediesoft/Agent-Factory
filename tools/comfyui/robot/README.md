# R1、R2 軌道機械手臂

兩台手臂共用一套 FANUC 風格的黃色上臂、前臂與腕部外殼。每台有獨立的關節、軌道滑座、粗加工夾爪與保護夾爪。外形參考 M-10iD/12，臂長、工具座與行程採本專案示範尺寸。[FANUC 機型參考](https://www.fanuc.eu/eu-en/product/robot/m-10id12) · [組裝後的模型](../../../public/models/robot.glb)

## 試播

開啟 `/app.html`，在場景上方選擇「R1 機械手臂」或「R2 機械手臂」，按「手臂試播」。每段跟隨同一台手臂、同一件工件。手臂先沿軌道到換爪架，卸爪、裝爪並確認，再從機台正門上料。手臂退出後機台關門並亮橘燈加工，完工亮綠燈，手臂再從正門取件。錄影每台各 20 秒，右側小圖標出兩台滑座的位置。[40 秒試播](../../../docs/visuals/r1-r2-full-cycle.mp4)

| 手臂 | 工件及機台 | 試播中的換爪與取件 |
| --- | --- | --- |
| R1 | P06 · GRIND-01 平面研磨 | 在 T1 換上粗加工夾爪，從在製品料架取件上料。研磨完成後，以保護夾爪取回 P06。 |
| R2 | P01 · WIRE-01 線割 | 在 T2 換上保護夾爪，從研磨機取件並送進線割機。線割完成後，以保護夾爪取回 P01。 |

## 本機生成與組裝

1. 在 ComfyUI 0.3.59 的 Python 環境安裝共用節點的相依套件，放入約 26 MiB 的 Depth Anything V2 Small 量化 ONNX 權重。將本專案的 `wire_depth.py` 複製到 ComfyUI 的 `custom_nodes/`，重新啟動後即可使用 `ArmLinkDepthShell`。[環境與權重設定](../wire/README.md) · [共用節點](../wire/wire_depth.py)
2. 將上臂、前臂、腕部各自的正、左、背、右四視圖放在 ComfyUI 的 `input/`，共 12 張。調整殼形時可用 Blender 執行繪圖程式，重畫這些正交視圖。[參考圖](reference/) · [繪圖程式](render_guides.py)
3. 以 `--cpu --listen 127.0.0.1 --port 8199` 啟動 ComfyUI。在專案根目錄送出工作流程。[API 工作流程](arm-links.api.json)

   ```sh
   jq '{prompt: .}' tools/comfyui/robot/arm-links.api.json | curl --fail-with-body -H 'Content-Type: application/json' --data-binary @- http://127.0.0.1:8199/prompt
   ```

4. 從 `/history/<prompt_id>` 確認三個 `SaveGLB` 都成功，將輸出依序命名為 `upper-depth.glb`、`fore-depth.glb`、`wrist-depth.glb`，放在本目錄。Blender 的 `make_robot()` 依場景尺寸對齊零件，分別裝到 `Shoulder`、`Elbow`、`Wrist`，再裝上滑座、轉軸、法蘭與夾爪。[上臂](upper-depth.glb) · [前臂](fore-depth.glb) · [腕部](wrist-depth.glb) · [Blender 重建方式](../../../docs/BLENDER_MODELS.md)

本次本機 CPU 生成任務 `f35d65d6-86ab-49d4-8e46-fbc00752f06b` 耗時 2.96 秒。三個原始外殼各有 2,200 個三角面，播放時直接載入組裝後的 GLB。

## 如何重驗穿模

```sh
npm test
node tools/verify-robot-motion.mjs
```

第一個指令以匯出的模型重播七台機台的 36 次正門上料與 36 次下料，每 0.1 秒檢查手臂、滑座、夾爪及工件是否碰到外殼、活動門或機內零件。第二個指令逐一檢查六件工件排程的 129,594 個時間點，包含等待、空車與回停車位。檢查對象包括雙臂之間、隔著關節的臂節、攜帶的工件、沿途機台、換爪架、四個工具槽、料架與料架上的工件。換爪交接另核對腕部法蘭是否對準工具座。[正門測試](../../../tests/cnc-front-transfer.test.js) · [全程檢查](../../verify-robot-motion.mjs)

本批次檢查通過。R1 完成 18 次上料、15 次下料，R2 完成 18 次上料、21 次下料。含首次裝爪，兩台分別裝爪 8 次與 10 次。兩個滑座中心最近相距 3.638 公尺。這些數值適用於目前的示範幾何、排程及 0.1 秒取樣間隔。實機安全間隙與連續掃掠體積需要另外量測和驗證。

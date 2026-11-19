# GRIND-01 平面研磨機

本模型以 FANUC 研磨用 CNC 控制器為外觀參考，機身依場景的軌道、夾爪與工件設計。固定外殼由本機 ComfyUI 重建。黃色單滑門、水平主軸、砂輪、磁力工作台與右上方三色燈柱在 Blender 中組裝。[FANUC 研磨應用](https://www.fanuc.eu/eu-en/application/cnc-grinding) · [場景用 GLB](../../../public/models/grind.glb)

## 本機重建

1. 使用 ComfyUI 0.3.59、CPU 與約 26 MiB 的 Depth Anything V2 Small 量化模型。將共用的 `wire_depth.py` 放進 ComfyUI 的 `custom_nodes/`，重新啟動後可使用 `GrindDepthShell`。[環境與權重設定](../wire/README.md) · [共用節點](../wire/wire_depth.py)
2. 將四張 GRIND 專用參考圖複製到 ComfyUI 的 `input/`。如需調整固定外殼，可用 Blender 重繪四視圖。[四張參考圖](reference/) · [繪圖程式](render_guides.py)
3. 在本機以 `--cpu --listen 127.0.0.1 --port 8198` 啟動 ComfyUI，從專案根目錄送出[工作流程](grind-depth.api.json)。

   ```sh
   jq '{prompt: .}' tools/comfyui/grind/grind-depth.api.json | curl --fail-with-body -H 'Content-Type: application/json' --data-binary @- http://127.0.0.1:8198/prompt
   ```

4. 從 `/history/<prompt_id>` 確認任務成功，將 `SaveGLB` 輸出複製為 `tools/comfyui/grind/grind-depth.glb`。`make_grind()` 會匯入這個外殼，組裝可動零件並匯出場景。[原始外殼](grind-depth.glb) · [Blender 重建方式](../../../docs/BLENDER_MODELS.md)

本次 CPU 任務 `170dda54-9f88-428a-a3a9-27a325383e48` 耗時 2.59 秒，輸出網格含 13,228 個三角面。原始 GLB 的 SHA-256 為 `e96a919114a3d7ae6a804ab65c2449e4a153e4eb3d3d81c38fd4eb4f39bb628b`。

## 試播與驗證

在 `/app.html` 選 **GRIND-01** 並按「上下料試播」。隨附錄影中，首件 P01 由 R2 從正門送上磁力工作台。空爪退出、滑門關閉後亮橘燈，砂輪下降，以五道重疊路徑研磨。砂輪抬升復位後亮綠燈，R2 改用保護夾爪，從正門取件離站。26 秒錄影以快轉呈現 4 分鐘的模擬加工，並保留手臂、燈柱與機內視角。[完整試播](../../../docs/visuals/grind-01-full-cycle.mp4)

`npm test` 使用場景匯出的 GLB，每 0.1 秒檢查首件正門上下料的機械干涉、加工時砂輪與工件的接觸位置，並驗證六件工件都在研磨完成後以保護夾爪取出。砂輪接觸與火花用於呈現加工順序，研磨去除量與表面粗糙度未納入模型。

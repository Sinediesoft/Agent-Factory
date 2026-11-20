# CMM-01 三次元品檢機台

這是合成示範用的橋式三次元量測機。固定外殼先由本機 ComfyUI 重建，再由 Blender 加上花崗岩量測台、安全滑門、可動測頭、控制面板與狀態燈。[場景用 GLB](../../../public/models/cmm.glb) · [場景近景](../../../docs/visuals/cmm-01-preview.png)

## ComfyUI 生成

1. 使用 ComfyUI `v0.3.59` 的 CPU 模式。依 [WIRE-01 的環境說明](../wire/README.md)安裝 `onnxruntime`、`trimesh`、`scipy`、`scikit-image` 和 `fast-simplification`，並放置 Depth Anything V2 Small 量化 ONNX 權重。權重 SHA-256：`fcf51f1b230362b28690bb9d1809bf0431f29cad20534e3f589bd7285547f20d`。
2. 以 `PYTHONPATH=/path/to/bpy python3.11 tools/comfyui/cmm/render_guides.py` 產生[四張參考圖](reference/)。把 [共用深度節點](../wire/wire_depth.py)複製到 ComfyUI `custom_nodes/`，把參考圖複製到 `input/`，重啟 ComfyUI。
3. 在專案根目錄送出 [CMM 工作流程](cmm-depth.api.json)，查詢 `/history/<prompt_id>`，將 `SaveGLB` 輸出存為 [cmm-depth.glb](cmm-depth.glb)。例如 ComfyUI 監聽在 `127.0.0.1:8199` 時：

   ```sh
   jq '{prompt: .}' tools/comfyui/cmm/cmm-depth.api.json | curl --fail-with-body -H 'Content-Type: application/json' --data-binary @- http://127.0.0.1:8199/prompt
   ```

本次任務 `3e8ebf57-700c-40b6-abf3-6080d8d5f4c7` 在 CPU 上成功完成。輸出外殼含 6,965 個頂點、13,926 個三角面，封閉且可載入 GLB；中央工件進出空間沒有外殼面片。原始 GLB 的 SHA-256：`c545f8c83c66ab1f714aeb99f6dccd25594398c8d2e7f64611ecfe816c989d69`。

## 組裝與測試

`tools/build_blender_models.py` 匯入 ComfyUI 外殼並匯出完整機台。`tests/cnc-front-transfer.test.js` 依模擬時間每 0.1 秒檢查六件工件正門上下料時的外殼、門、測頭與手臂干涉，並檢查量測頭在品檢期間沿工件上表面掃描、不穿入工件。`tests/sim.test.js` 驗證六件都在 `CMM-01` 完成品檢後才進入成品架。

量測動作與 3 分鐘品檢時間都是示範資料；目前沒有實際量測點位、量測誤差、允收公差或 OK/NG 分流。

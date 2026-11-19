# WIRE-01 外殼與線割試播

工作區以 FANUC ROBOCUT α-C400iC 為外觀參考，保留白色側櫃、黃色工作槽門、水平觀察窗與右側控制器。四張原創正交視圖依場景的滑座、夾爪與工件建立。尺寸、門行程及切縫皆為模擬值。[FANUC ROBOCUT](https://www.fanuc.co.jp/en/product/robocut/)

## 本機生成

ComfyUI 0.3.59 在 CPU 執行 Depth Anything V2 Small 的量化 ONNX 模型。節點對四張視圖做深度推論，結合輪廓、校正過的相機與進料開口限制，重建一個 12,000 面的固定外殼。推論使用的權重約 26 MiB。場景載入已組裝的 GLB，播放時可以關閉 ComfyUI。[模型來源](https://huggingface.co/onnx-community/depth-anything-v2-small)

1. 在 ComfyUI 的 Python 環境安裝 `onnxruntime`、`trimesh`、`scipy`、`scikit-image` 與 `fast-simplification`。將模型的 `onnx/model_quantized.onnx` 放入 `models/depth/model_quantized.onnx`。本次模型的 SHA-256 為 `fcf51f1b230362b28690bb9d1809bf0431f29cad20534e3f589bd7285547f20d`。
2. 將 [wire_depth.py](wire_depth.py) 放入 ComfyUI 的 `custom_nodes/`，把 [四張參考圖](reference/) 放入 `input/`。可用 Blender 執行 [render_guides.py](render_guides.py) 重繪參考圖。
3. 以 `--cpu --listen 127.0.0.1 --port 8195` 啟動 ComfyUI。在專案根目錄提交 [API 工作流程](wire-depth.api.json)。

   ```sh
   jq '{prompt: .}' tools/comfyui/wire/wire-depth.api.json | curl --fail-with-body -H 'Content-Type: application/json' --data-binary @- http://127.0.0.1:8195/prompt
   ```

4. 從 `/history/<prompt_id>` 確認成功，將該次 `SaveGLB` 輸出的檔案複製為 [wire-depth.glb](wire-depth.glb)。[Blender 建模程式](../../build_blender_models.py) 的 `make_wire()` 直接匯入這個網格，加上可動槽門、上／下線導頭、電極線、治具、線輪、控制面板及燈柱。依 [Blender 重建說明](../../../docs/BLENDER_MODELS.md) 匯出完整場景。

本次成功的 ComfyUI 任務為 `d1a2f1e9-bdf2-4700-bb35-2fed32490e04`，工作流程耗時 2.3 秒。原始 GLB 的 SHA-256 為 `734c32da92f59183581604a1ec871ab3a3a04729b742805c0333f69f24073157`。

## 場景驗證

在 `/app.html` 選擇 **WIRE-01** 並按「上下料試播」。隨附錄影中，首件 P01 由 R2 從正面送進工作槽。空爪退出，槽門升起關閉，機台亮橘燈並沿示範路徑線割。線導頭回到待機位置，燈柱轉綠，R1 再進站取件。切縫以工件表面的進度標記表示。[觀看完整試播](../../../docs/visuals/wire-01-full-cycle.mp4)

`npm test` 使用匯出的網格，每 0.1 秒檢查首件上下料時滑座、夾爪與工件對外殼、移動槽門及機內零件的干涉。線割測試另確認電極線進入工件、線導頭避開工件與支撐面，以及六件工件都完成線割並下料。

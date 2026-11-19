# CNC-L01 外殼

這個試驗只替換 CNC-L01 的固定外殼。滑門、主軸、治具、機械手臂和工件沿用場景內可動的零件。開啟 `/app.html`，選「CNC-L01 上下料試播」，畫面會從 R2 準備上料播到取回 P01。加工時可點機台燈號切入機內視角。[查看實際回放畫面](../../docs/visuals/cnc-l01-cad-cycle.jpg)

## Onshape 建模與場景資產

- [FeatureScript](cnc-l01-shell.fs) 提供外寬、深度、門洞寬度與壁厚四個參數。在 Onshape 文件內新增 Feature Studio，貼上原始碼並按 Commit，再於 Part Studio 加入「CNC-L01 enclosure」特徵。
- [STEP 實體](../../cad/cnc-l01-shell.step) 可直接匯入 Onshape 檢視預設尺寸。本機版本用 CadQuery 依 FeatureScript 的預設尺寸建模，經 STEP 重新讀入後產生 [場景 GLB](../../public/models/cnc-l01-shell.glb)。
- 外殼預設寬 3,840、深 3,220、高 2,740 mm，底面在地面上方 320 mm。正面門洞寬 2,500、高 1,580 mm。CAD 使用毫米、Z 軸向上、從負 Y 方向上料。場景使用公尺、Y 軸向上、從正 Z 方向上料。尺寸依合成示範機台設定。

## 從 STEP 更新場景

在安裝 CadQuery 2.8.0 的 Python 環境下執行。第一個指令重建本機預設實體與 GLB。第二個指令接受從 Onshape 匯出的單一固定外殼，保留既有 STEP 並更新 GLB。

```sh
python tools/onshape/build_shell.py
python tools/onshape/build_shell.py --step /path/to/onshape-enclosure.step
```

`npm test` 會檢查預設 GLB 的安裝座標、單位和門洞邊界。場景預設尺寸變更時需一起更新測試。機械手臂依排程事件播放，上下料的全行程干涉及關節可達性尚待驗證。

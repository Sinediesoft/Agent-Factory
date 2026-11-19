# CNC-L01 外殼

這個試驗只替換 CNC-L01 的固定外殼。滑門、主軸、治具、機械手臂和工件沿用場景內可動的零件。開啟 `/app.html`，選「CNC-L01 上下料試播」，畫面會從 R2 準備上料播到取回 P01。加工時可點機台燈號切入機內視角。[查看實際回放畫面](../../docs/visuals/cnc-l01-cad-cycle.jpg)

## Onshape 建模與場景資產

- 在公開的 [Onshape Part Studio](https://cad.onshape.com/documents/d2dc54c108fe51406cda3992/w/0f7392f108fa0290ce4bb896/e/9d1c7e48cb93d76b37177ac6) 中，「CNC-L01 enclosure 1」建立一個外殼實體。編輯此特徵可調整外寬、深度、門洞寬度與壁厚。[Onshape Feature Studio](https://cad.onshape.com/documents/d2dc54c108fe51406cda3992/w/0f7392f108fa0290ce4bb896/e/77a3ae67a704f00a4bcc9aab) 和[本機原始碼](cnc-l01-shell.fs) 保存同一份 FeatureScript。
- [STEP 實體](../../cad/cnc-l01-shell.step) 從上述零件匯出，格式為 AP242。建置程式將這份 STEP 轉成 [Three.js 使用的 GLB](../../public/models/cnc-l01-shell.glb)。
- 外殼預設寬 3,840、深 3,220、高 2,740 mm，底面在地面上方 320 mm。正面門洞寬 2,500、高 1,580 mm。CAD 使用毫米、Z 軸向上、從負 Y 方向上料。場景使用公尺、Y 軸向上、從正 Z 方向上料。尺寸依合成示範機台設定。

## 從 STEP 更新場景

在安裝 CadQuery 2.8.0 的 Python 環境下執行。第一個指令從專案內的 Onshape STEP 重建 GLB。第二個指令可用另一份 STEP 試算，更新同一個 GLB。若要正式更新場景，請將新的 Onshape 匯出檔存為 `cad/cnc-l01-shell.step` 再執行第一個指令。

```sh
python tools/onshape/build_shell.py
python tools/onshape/build_shell.py --step /path/to/onshape-enclosure.step
```

`npm test` 會檢查預設 GLB 的安裝座標、單位和門洞邊界。場景預設尺寸變更時需一起更新測試。機械手臂依排程事件播放，上下料的全行程干涉及關節可達性尚待驗證。

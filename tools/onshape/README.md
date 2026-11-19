# CNC-L01 外觀與上下料回放

CNC-L01 的外觀參照 FANUC ROBODRILL α-D21MiB5 Plus 標準型。黃色單滑門向左收入前鈑金，門片與右側護罩都有斜紋觀察窗。右前方有操作面板、鍵盤和急停鈕，機身下方為內收的白色裙板及深色腳座。模型尺寸依本專案 R2 的上料位置設定。[FANUC 官方參考照片](https://www.fanuc.co.jp/ja/product/robodrill/image/d21mib5_plus_large.jpg)

## Onshape 與場景資產

[公開 Part Studio](https://cad.onshape.com/documents/d2dc54c108fe51406cda3992/w/0f7392f108fa0290ce4bb896/e/9d1c7e48cb93d76b37177ac6) 的「CNC-L01 enclosure 1」產生 36 個實體。預設櫃體寬 2,920 mm、深 2,660 mm，正面面板右上角的三色燈柱高 497 mm，含燈柱總高 3,817 mm。正面開口寬 1,110 mm，門片向左滑動 1,004 mm。可在特徵內調整櫃寬、深度、開口及壁厚。[Feature Studio](https://cad.onshape.com/documents/d2dc54c108fe51406cda3992/w/0f7392f108fa0290ce4bb896/e/77a3ae67a704f00a4bcc9aab) · [本機 FeatureScript](cnc-l01-shell.fs)

[出自 Onshape 的 STEP](../../cad/cnc-l01-shell.step) 保留零件名稱與顏色。請從整個 Part Studio 匯出單一 AP242 檔案，保留 Z 軸向上。建置程式會將毫米轉成公尺，改以 Y 軸向上，並將滑門、玻璃、把手組成一個可動件。[場景 GLB](../../public/models/cnc-l01-shell.glb)

在安裝 CadQuery 2.8.0 的 Python 環境執行下列指令，可從專案的 STEP 重建場景資產。也可傳入 `--step /path/to/exterior.step` 以測試新的匯出檔。

```sh
python tools/onshape/build_shell.py
```

## 驗證

建置時以門片、玻璃和把手整段直線行程的外包盒，逐一檢查與固定外觀零件的干涉。`npm test` 會檢查模型尺寸、座標、透視窗和開關門時的上料通道。四台 CNC 的停靠支線在各自的門前轉直，手臂對準門口伸入，並在門外收臂。測試每 0.1 秒讀取一次上下料姿勢，用滑座、手臂、夾爪與工件的外包盒檢查模型中的外殼、滑門、治具與主軸。工件在治具上交接，夾爪退出後才關門。

燈柱由上往下是紅、橘、綠。異常亮紅燈，加工運行亮橘燈，程式執行完畢亮綠燈，直到手臂取走工件。待機時三燈全暗。

在 `/app.html` 選擇 CNC 編號後點「上下料試播」，可看該台首件工件進站、正門上料、關門加工、完工亮綠燈與正門下料。試播以 2 倍速顯示手臂動作，加工與等候取件會加速，並在下料完成時暫停。點機台狀態燈可切換機內視角。[播放三台新增機台的正門試播](../../docs/visuals/cnc-area-front-cycles.mp4) · [播放 CNC-L01 正門上下料影片](../../docs/visuals/cnc-l01-full-cycle.mp4) · [查看回放截圖](../../docs/visuals/cnc-l01-cad-cycle.jpg)

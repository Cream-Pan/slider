<div id="top"></div>

# 温熱環境主観評価 WebApp

温熱環境主観評価 WebApp は，屋外温熱環境実験において，参加者の主観的な温熱評価，温熱的な快・不快方向への変化イベント，スマートフォンの位置情報を同時に記録する Web アプリケーションである．

定期地点評価では，温冷感と温熱的快・不快の2項目を記録する．また，実験中に参加者が「快適な方向に変化した」または「不快な方向に変化した」と感じた場合は，専用ボタンを押した時刻をイベントとして記録する．

GPS は「実験を開始する」を押した時点から取得を開始し，実験の時間計測は最初の「実験開始・日向①開始時」評価を Submit した時点から開始する．最後の「日向②開始から10 min後・実験終了時」評価を Submit すると測定を終了し，主観評価 CSV と GPS CSV を1つのボタンから連続して保存する．

---

## 使用技術一覧

<p style="display: inline">
  <img src="https://img.shields.io/badge/-HTML5-E34F26.svg?logo=html5&style=for-the-badge&logoColor=white">
  <img src="https://img.shields.io/badge/-CSS3-1572B6.svg?logo=css3&style=for-the-badge&logoColor=white">
  <img src="https://img.shields.io/badge/-JavaScript-F7DF1E.svg?logo=javascript&style=for-the-badge&logoColor=black">
  <img src="https://img.shields.io/badge/-Geolocation%20API-4285F4.svg?style=for-the-badge&logoColor=white">
  <img src="https://img.shields.io/badge/-IndexedDB-336791.svg?style=for-the-badge&logoColor=white">
  <img src="https://img.shields.io/badge/-CSV-217346.svg?style=for-the-badge&logoColor=white">
  <img src="https://img.shields.io/badge/-Netlify-00C7B7.svg?logo=netlify&style=for-the-badge&logoColor=white">
  <img src="https://img.shields.io/badge/-GitHub-181717.svg?logo=github&style=for-the-badge">
</p>

---

## 目次

- [プロジェクトについて](#プロジェクトについて)
- [ファイル構成](#ファイル構成)
- [利用するWeb API](#利用するweb-api)
- [主観評価項目](#主観評価項目)
- [評価・イベント記録](#評価イベント記録)
- [定期地点評価](#定期地点評価)
- [GPS記録](#gps記録)
- [測定期間](#測定期間)
- [画面構成](#画面構成)
- [保存データ](#保存データ)
- [時刻形式](#時刻形式)
- [端末内保存](#端末内保存)
- [使用方法](#使用方法)
- [注意点](#注意点)

---

## プロジェクトについて

本アプリは，屋外温熱環境実験において，参加者の主観評価，温熱的な快・不快方向への変化イベント，位置情報を記録するための Web アプリケーションである．

実験開始前に参加者 ID を入力し，実験中は以下の2種類の記録を扱う．

- **方向変化イベント**
  - 参加者が快適な方向への変化を感じた場合に「快適な方向に変化した」ボタンを押す．
  - 参加者が不快な方向への変化を感じた場合に「不快な方向に変化した」ボタンを押す．
  - ボタンを押した時刻を即時に記録し，追加の回答画面は表示しない．
- **定期地点評価**
  - 実験者が指定した14回のタイミングで回答する．
  - 温冷感と温熱的快・不快の2項目を回答する．

GPS は「実験を開始する」を押した時点から連続取得する．一方，画面上の実験経過時間は，最初の定期地点評価である「実験開始・日向①開始時」を Submit した時点を 0 s とする．

最後の「日向②開始から10 min後・実験終了時」評価を Submit すると実験を終了し，CSV保存ボタンと新しい実験を開始するボタンを表示する．

<p align="right">(<a href="#top">トップへ戻る</a>)</p>

---

## ファイル構成

```text
.
├── index.html
├── style.css
├── app.js
├── config.json
├── manifest.json
├── service-worker.js
└── README.md
```

各ファイルの役割は以下である．

| ファイル | 内容 |
|---|---|
| `index.html` | 画面構成，定期地点評価モーダル，方向変化ボタン，操作ボタンを定義する． |
| `style.css` | 画面レイアウト，ボタン，評価UI，スマートフォン向け表示を定義する． |
| `app.js` | 主観評価，方向変化イベント，GPS記録，時刻管理，IndexedDB保存，CSV生成を処理する． |
| `config.json` | 14回の定期地点評価の順序，GPS取得条件，GPS精度閾値を管理する． |
| `manifest.json` | PWAとして使用する際のアプリ情報を定義する． |
| `service-worker.js` | アプリの主要ファイルをキャッシュし，オフライン利用を補助する． |
| `README.md` | 本アプリの仕様と使用方法を記載する． |

<p align="right">(<a href="#top">トップへ戻る</a>)</p>

---

## 利用するWeb API

本アプリでは外部ライブラリを使用せず，ブラウザ標準の Web API を利用する．

### Geolocation API

スマートフォンの位置情報を連続取得するために使用する．

```javascript
navigator.geolocation.watchPosition(...)
```

GPS取得条件は `config.json` で管理する．

### IndexedDB

定期地点評価，方向変化イベント，GPSデータ，実験セッション状態をブラウザ内へ逐次保存するために使用する．

CSVを保存する前にページが意図せず再読み込みされた場合でも，保存済みのデータを利用して未終了セッションを復元できる構成とする．

### Screen Wake Lock API

対応ブラウザでは，実験中の画面スリープを抑制するために使用する．

### Service Worker API

`index.html`，`style.css`，`app.js`，`config.json` などをキャッシュし，通信が不安定な場合でもアプリを利用しやすくする．

CSV生成には外部ライブラリを使用せず，JavaScript の `Blob` と `download` 属性を用いる．

<p align="right">(<a href="#top">トップへ戻る</a>)</p>

---

## 主観評価項目

定期地点評価では以下の2項目を記録する．参加者には数値を表示せず，各項目名を直接選択させる．CSVにも選択した項目名を文字列として保存する．

### 1．温冷感

以下の7項目から1つを選択する．

| 選択肢 |
|---|
| 寒い |
| 涼しい |
| やや涼しい |
| どちらでもない |
| やや暖かい |
| 暖かい |
| 暑い |

CSVには選択した項目名を `thermal_sensation` として保存する．

### 2．温熱的快・不快

以下の7項目から1つを選択する．

| 選択肢 |
|---|
| 非常に快い |
| 快い |
| やや快い |
| どちらでもない |
| やや不快 |
| 不快 |
| 非常に不快 |

CSVには選択した項目名を `thermal_comfort` として保存する．

最初の定期地点評価では両項目を未選択状態で表示し，2項目すべてを回答するまで「完了して保存」ボタンを有効化しない．2回目以降の定期地点評価では，直前の回答を初期選択として表示する．

回答方向による誘導を避けるため，評価項目の選択状態には中立的なグレー系の配色を使用する．「快適な方向に変化した」と「不快な方向に変化した」の2ボタンについても，同一の中立色で表示する．

<p align="right">(<a href="#top">トップへ戻る</a>)</p>

---

## 評価・イベント記録

実験中には，「方向変化イベント」と「定期地点評価」の2種類を記録する．

### 方向変化イベント

最初の定期地点評価を Submit して実験時間の計測を開始した後，以下の2ボタンを使用できる．

- **快適な方向に変化した**
- **不快な方向に変化した**

参加者がいずれかの変化を感じた時点で対応するボタンを押す．ボタンを押すと評価モーダルは表示せず，押下時刻を即時に IndexedDB へ保存する．

保存時の `trigger_type` は以下である．

```text
快適な方向に変化した   → comfortable_change
不快な方向に変化した   → uncomfortable_change
```

`segment_id` には，ボタンを押した時点の現在区間を保存する．また，方向変化イベントでは追加回答を伴わないため，`evaluation_started_at` と `evaluation_submitted_at` には同一の押下時刻を保存し，`response_duration_ms` は `0` とする．`thermal_sensation` と `thermal_comfort` は空欄とする．

方向変化ボタンは，最初の定期地点評価を Submit するまでは無効とし，最後の定期地点評価を Submit して実験が完了すると再び無効化する．

### 定期地点評価

実験者が指定した14回のタイミングで回答する．

保存時には以下を記録する．

```text
trigger_type = checkpoint
```

定期地点評価は `config.json` で定義した順序で進行する．評価モーダルを開いた時刻を `evaluation_started_at`，2項目を回答して「完了して保存」を押した時刻を `evaluation_submitted_at` として保存する．

定期地点評価は，回答を正常に保存した場合のみ次の項目へ進む．評価モーダルをキャンセルした場合は進行状態を変更しない．

<p align="right">(<a href="#top">トップへ戻る</a>)</p>

---

## 定期地点評価

定期地点評価は以下の14回である．

| 順序 | ボタン表示 | `segment_id` | 回答後の現在区間 |
|---:|---|---|---|
| 1 | 実験開始・日向①開始時 | `SUN1_START` | `SUN1` |
| 2 | 日向①開始から5 min後 | `SUN1_5MIN` | `SUN1` |
| 3 | 日向①開始から10 min後 | `SUN1_10MIN` | `SUN1_TO_SHADE1` |
| 4 | 日陰①開始時 | `SHADE1_START` | `SHADE1` |
| 5 | 日陰①開始から5 min後 | `SHADE1_5MIN` | `SHADE1` |
| 6 | 日陰①開始から10 min後 | `SHADE1_10MIN` | `SHADE1_TO_BREAK` |
| 7 | 室内休憩開始時 | `BREAK_START` | `BREAK` |
| 8 | 室内休憩開始から10 min後 | `BREAK_10MIN` | `BREAK_TO_SHADE2` |
| 9 | 日陰②開始時 | `SHADE2_START` | `SHADE2` |
| 10 | 日陰②開始から5 min後 | `SHADE2_5MIN` | `SHADE2` |
| 11 | 日陰②開始から10 min後 | `SHADE2_10MIN` | `SHADE2_TO_SUN2` |
| 12 | 日向②開始時 | `SUN2_START` | `SUN2` |
| 13 | 日向②開始から5 min後 | `SUN2_5MIN` | `SUN2` |
| 14 | 日向②開始から10 min後・実験終了時 | `SUN2_10MIN_END` | `COMPLETE` |

順序は `config.json` の `checkpointSequence` で管理する．現在の `app.js` では `checkpointSequence` が14件であることを確認してから実験設定を読み込む．

例：

```json
{
  "checkpointSequence": [
    {
      "label": "実験開始・日向①開始時",
      "segmentId": "SUN1_START",
      "nextSegment": "SUN1"
    },
    {
      "label": "日向①開始から5 min後",
      "segmentId": "SUN1_5MIN",
      "nextSegment": "SUN1"
    }
  ]
}
```

<p align="right">(<a href="#top">トップへ戻る</a>)</p>

---

## GPS記録

GPSは，「実験を開始する」ボタンを押してセッションを作成した時点から取得を開始する．

これにより，最初の「実験開始・日向①開始時」評価を開始する前から位置情報を確保し，最初の主観評価とGPSの時刻対応を安定させる．

位置情報は `navigator.geolocation.watchPosition()` を使用して取得する．GPSの取得頻度はブラウザおよび端末側で決定されるため，厳密な 1 Hz は保証しない．

`config.json` の既定値は以下である．

```json
{
  "gpsOptions": {
    "enableHighAccuracy": true,
    "maximumAge": 1000,
    "timeout": 15000
  },
  "gpsAccuracyThresholds": {
    "good": 20,
    "warning": 50
  }
}
```

GPS精度 `accuracy` に応じて，画面上に以下の状態を表示する．

| 条件 | 表示例 |
|---|---|
| 20 m以下 | 良好 |
| 20 m超，50 m以下 | 注意 |
| 50 m超 | 精度低下 |

GPS記録は最後の「日向②開始から10 min後・実験終了時」評価を Submit した時点で終了する．

<p align="right">(<a href="#top">トップへ戻る</a>)</p>

---

## 測定期間

本アプリでは，GPS記録開始時刻と実験時間計測開始時刻を分けて扱う．

```text
「実験を開始する」
        ↓
GPS記録開始
        ↓
「定期地点評価：実験開始・日向①開始時」を開く
        ↓
実験開始時評価をSubmit
        ↓
実験経過時間の計測開始
方向変化イベントの記録を有効化
        ↓
各条件・各定期地点評価・方向変化イベント
        ↓
「定期地点評価：日向②開始から10 min後・実験終了時」をSubmit
        ↓
実験経過時間・GPS記録終了
```

実験経過時間は，以下の期間として扱う．

```text
開始：SUN1_START評価の evaluation_submitted_at
終了：SUN2_10MIN_END評価の evaluation_submitted_at
```

一方，後処理でGPSやWeatherデータをマッピングする場合は，主観評価が存在する有効範囲として，以下を使用できる．

```text
最初のSUN1_START評価の evaluation_started_at
～
最後のSUN2_10MIN_END評価の evaluation_submitted_at
```

この範囲は主観評価CSVから決定できるため，CSVへ追加の開始・終了列は保存しない．

<p align="right">(<a href="#top">トップへ戻る</a>)</p>

---

## 画面構成

### 実験開始画面

以下を表示する．

- 参加者ID入力欄
- 実験開始ボタン

参加者IDには，実験条件などを含めることができる．

例：

```text
A_CW
A_CCW
```

参加者IDはCSV内部の列には保存せず，ファイル名へ使用する．

### 実験画面

画面上部には以下を表示する．

- 参加者ID
- 経過時間
- GPS状態
- 現在区間
- 主観評価・イベント記録件数
- GPS記録件数

評価領域には以下を配置する．

- 「快適な方向に変化した」ボタン
- 「不快な方向に変化した」ボタン
- 定期地点評価ボタン

「快適な方向に変化した」と「不快な方向に変化した」は横並びで配置する．最初の定期地点評価が完了するまでは両ボタンを使用できない．

### 定期地点評価モーダル

以下の2項目を1画面で回答する．

- 温冷感
- 温熱的快・不快

評価画面を開いた時刻を `evaluation_started_at`，回答を保存した時刻を `evaluation_submitted_at` として記録する．

方向変化イベントではモーダルを表示せず，ボタンを押した時刻のみを即時に記録する．

### 実験終了画面

最後の定期地点評価を保存すると，以下を表示する．

- 測定時間
- 主観評価・イベント記録件数
- GPS件数
- CSVを保存する（2ファイル）
- 新しい実験を開始する

<p align="right">(<a href="#top">トップへ戻る</a>)</p>

---

## 保存データ

最後の定期地点評価を保存した後，「CSVを保存する（2ファイル）」を押すと，以下の2ファイルを連続ダウンロードする．

```text
{sessionId}_subjective.csv
{sessionId}_gps.csv
```

`sessionId` は以下の形式で生成する．

```text
参加者ID_YYYYMMDDTHHMMSS
```

例：

```text
A_CW_20260907T130000_subjective.csv
A_CW_20260907T130000_gps.csv
```

### 主観評価CSV

定期地点評価と方向変化イベントを同じCSVへ保存する．

| 列名 | 内容 |
|---|---|
| `trigger_type` | `checkpoint`，`comfortable_change`，`uncomfortable_change` のいずれか |
| `segment_id` | 定期地点ID，または方向変化イベント発生時の現在区間 |
| `evaluation_started_at` | 定期地点評価を開いた時刻，または方向変化ボタンを押した時刻 |
| `evaluation_submitted_at` | 定期地点評価を保存した時刻，または方向変化ボタンを押した時刻 |
| `response_duration_ms` | 定期地点評価の回答時間 [ms]．方向変化イベントでは `0` |
| `thermal_sensation` | 温冷感の項目名．方向変化イベントでは空欄 |
| `thermal_comfort` | 温熱的快・不快の項目名．方向変化イベントでは空欄 |

保存例：

```csv
trigger_type,segment_id,evaluation_started_at,evaluation_submitted_at,response_duration_ms,thermal_sensation,thermal_comfort
checkpoint,SUN1_START,2026/09/07 13:00:10.120,2026/09/07 13:00:15.422,5302,やや暖かい,快い
uncomfortable_change,SUN1,2026/09/07 13:03:42.251,2026/09/07 13:03:42.251,0,,
comfortable_change,SUN1,2026/09/07 13:07:18.904,2026/09/07 13:07:18.904,0,,
checkpoint,SUN1_10MIN,2026/09/07 13:10:11.305,2026/09/07 13:10:15.710,4405,暖かい,やや不快
```

### GPS CSV

| 列名 | 内容 |
|---|---|
| `timestamp` | GPS取得時刻 |
| `latitude` | 緯度 [degree] |
| `longitude` | 経度 [degree] |
| `accuracy` | 水平位置精度 [m] |
| `heading` | 進行方向 [degree] |
| `speed` | 移動速度 [m/s] |

標高 `altitude` および標高精度 `altitude_accuracy` は保存しない．

CSVは UTF-8 BOM 付きで生成する．

<p align="right">(<a href="#top">トップへ戻る</a>)</p>

---

## 時刻形式

主観評価CSVおよびGPS CSVの時刻は，ローカル時刻をミリ秒まで含めて以下の形式で保存する．

```text
YYYY/MM/DD hh:mm:ss.mmm
```

例：

```text
2026/09/07 13:03:42.251
```

JavaScriptでは以下の関数を使用する．

```javascript
function formatLocalTimeWithMs(epochMs) {
  const d = new Date(epochMs);
  const pad = (n, w=2) => String(n).padStart(w, "0");
  return `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())} `
       + `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(),3)}`;
}
```

<p align="right">(<a href="#top">トップへ戻る</a>)</p>

---

## 端末内保存

定期地点評価，方向変化イベント，GPS，セッション状態は IndexedDB へ逐次保存する．

使用するストアは以下である．

| ストア | 内容 |
|---|---|
| `sessions` | 参加者ID，現在区間，定期地点評価の進行状態など |
| `subjective` | 定期地点評価および方向変化イベントのレコード |
| `gps` | GPSレコード |

未終了セッションのIDは `localStorage` に保持する．ページを再読み込みした場合，未終了セッションが存在すると再開確認を表示する．

CSVは実験終了時に IndexedDB 内のレコードから生成する．

<p align="right">(<a href="#top">トップへ戻る</a>)</p>

---

## 使用方法

### 1．WebAppを開く

Netlify などの HTTPS 環境へデプロイした WebApp をスマートフォンのブラウザで開く．

位置情報取得には HTTPS 環境が必要である．ローカルで確認する場合は `localhost` を使用する．

例：

```bash
python -m http.server 8000
```

ブラウザで以下にアクセスする．

```text
http://localhost:8000
```

### 2．参加者IDを入力する

参加者IDを入力する．

例：

```text
A_CW
```

入力後，「実験を開始する」を押す．この時点からGPS記録を開始する．

### 3．位置情報を許可する

ブラウザから位置情報の使用許可を求められた場合は許可する．

位置情報の取得に成功すると，GPS状態と精度を画面上に表示する．

### 4．実験開始時の定期地点評価を回答する

「定期地点評価：実験開始・日向①開始時」を押し，以下の2項目を回答する．

- 温冷感
- 温熱的快・不快

「完了して保存」を押すと，この Submit 時刻を基準に実験経過時間の計測を開始する．同時に，「快適な方向に変化した」と「不快な方向に変化した」の2ボタンを使用できるようにする．

### 5．実験中の方向変化を記録する

参加者が快適な方向への変化を感じた場合は「快適な方向に変化した」を押す．不快な方向への変化を感じた場合は「不快な方向に変化した」を押す．

ボタンを押した時刻はその場で保存されるため，追加のSubmit操作は不要である．

### 6．定期地点評価を記録する

実験者の指示に従い，14回の各タイミングで定期地点評価を回答する．

定期地点評価を保存するたびに，ボタン表示は `config.json` の `checkpointSequence` に従って自動的に次の項目へ進む．

### 7．実験を終了する

最後の「定期地点評価：日向②開始から10 min後・実験終了時」を回答して保存する．

この時点で，実験経過時間とGPS記録を終了する．

### 8．CSVを保存する

実験終了画面の「CSVを保存する（2ファイル）」を押す．

以下の2ファイルを連続ダウンロードする．

```text
*_subjective.csv
*_gps.csv
```

ブラウザから複数ファイルのダウンロード許可を求められた場合は許可する．

---

## 注意点

* Geolocation API を使用するため，HTTPS環境または `localhost` で開く必要がある．
* Netlify の `https://xxxxx.netlify.app/` 形式で公開した場合は HTTPS 条件を満たす．
* スマートフォン本体およびブラウザで位置情報の使用を許可する必要がある．
* 一度位置情報を拒否した場合，ブラウザのサイト設定から手動で許可へ変更する必要がある場合がある．
* LINE などのアプリ内ブラウザではなく，Chrome または Safari などの通常ブラウザで開くことを推奨する．
* GPS取得頻度はブラウザ・端末・受信環境に依存し，厳密な 1 Hz は保証しない．
* 建物内や建物付近では，GPSの取得間隔が空いたり，`accuracy` が低下したりする場合がある．
* 方向変化イベントはボタンを押した瞬間に保存するため，押下後に追加の確認画面は表示しない．
* 方向変化イベントでは `thermal_sensation` と `thermal_comfort` を空欄として保存する．
* 最初の定期地点評価では回答を未選択とし，2項目すべてを選択するまで保存できない．
* 2回目以降の定期地点評価では，直前の回答を初期選択として表示する．
* 回答方向による誘導を避けるため，評価項目および方向変化ボタンには中立的な配色を使用する．
* 参加者IDはCSV内部には保存せず，ファイル名へ含める．
* 「CSVを保存する（2ファイル）」では2つのCSVを連続ダウンロードするため，ブラウザによっては複数ファイルのダウンロード許可を求められる場合がある．
* CSVを保存する前でもデータは IndexedDB へ逐次保存するが，実験終了後は必ずCSVファイルを保存して確認する．
* `config.json` の `checkpointSequence` は14件とし，実験プロトコルと一致させる．
* `config.json` やアプリ本体を更新した場合はページを再読み込みする．Service Worker のキャッシュが残る場合は，キャッシュ名の更新またはサイトデータの再読み込みを行う．
* 主観評価および方向変化イベントとGPSを対応付ける場合は，主観評価CSVの時刻列とGPSの `timestamp` を時刻基準として使用する．
* GPSやWeatherを後処理でマッピングする場合は，最初の `SUN1_START` の `evaluation_started_at` から最後の `SUN2_10MIN_END` の `evaluation_submitted_at` までを対象期間として抽出する．

<p align="right">(<a href="#top">トップへ戻る</a>)</p>
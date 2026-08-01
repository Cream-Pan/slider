# 温熱環境主観評価WebApp

屋外歩行実験において，次のデータを記録するWebAppです．

- 温冷感：7段階
- 温熱的快・不快：7段階
- 温熱選好：3段階
- GPS位置情報

## ファイル

- `index.html`：画面構造
- `style.css`：画面デザイン
- `app.js`：主観評価，GPS，CSV出力，IndexedDB保存
- `config.json`：定期地点評価の順序とGPS設定
- `manifest.json`：PWA設定
- `service-worker.js`：オフライン動作用

## 測定期間

参加者ID入力後の「実験を開始する」ボタンでは，時間計測とGPS記録を開始しません．

測定期間は，次の区間です．

1．「定期地点評価：実験開始」の回答を送信した時点で開始する．
2．最後の定期地点評価の回答を送信した時点で終了する．

最後の定期地点評価を送信すると，時間計測とGPS記録を自動的に停止し，CSV保存画面へ移動します．

## 使用方法

1．HTTPS環境へ配置します．GitHub Pagesを推奨します．
2．スマートフォンでページを開きます．
3．参加者IDへ`A_CW`などを入力し，「実験を開始する」を押します．
4．「定期地点評価：実験開始」を回答して送信します．この送信時点から時間計測とGPS記録を開始します．
5．主観状態が変化した際は，「変動による評価」を使用します．
6．実験者の指示に従って，「定期地点評価」を順番に記録します．
7．最後の定期地点評価を送信すると，測定が自動終了します．
8．「CSVを保存する（2ファイル）」を1回押し，主観評価CSVとGPS CSVを保存します．
9．続けて実験する場合は，「新しい実験を開始する」を押します．

## 重要事項

- GPSは，通常の`file://`で開いた場合に利用できないことがあります．HTTPSまたは`localhost`で実行してください．
- GPS権限は，実験開始時評価の送信後に要求されます．
- 実験中は画面を表示したままにし，別アプリへの切替や画面ロックを避けてください．
- 取得データはIndexedDBへ逐次保存するため，ページ更新後も未終了実験を再開できます．
- 参加者IDはCSV列へ入らず，CSVファイル名へ反映されます．
- ブラウザによっては，2つ目のCSVを保存する際に複数ファイルのダウンロード許可を求められます．その場合は許可してください．

## 定期地点評価の変更

`config.json`の`checkpointSequence`を編集します．

```json
{
  "label": "P1終了",
  "segmentId": "P1_END",
  "nextSegment": "P2"
}
```

- `label`：画面に表示する名称
- `segmentId`：主観評価CSVへ保存する値
- `nextSegment`：保存後に変動評価へ付与する区間ID

配列の最後の項目が，測定終了を発生させる最後の定期地点評価になります．

## 時刻形式

主観評価ログとGPSログの時刻は，次の形式で保存します．

```text
YYYY/MM/DD HH:mm:ss.SSS
```

例：

```text
2026/08/02 10:30:15.320
```

## CSV

### 主観評価CSV

```text
trigger_type,segment_id,evaluation_started_at,evaluation_submitted_at,response_duration_ms,thermal_sensation,thermal_comfort,thermal_preference
```

### GPS CSV

```text
timestamp,latitude,longitude,accuracy,altitude,altitude_accuracy,heading,speed
```

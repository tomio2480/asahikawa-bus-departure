# 🏗 旭川バス発車案内 -- アーキテクチャと設計判断

旭川市内の 3 事業者のバス発車案内をブラウザ単体で提供する SPA の設計判断と実装上の勘所をまとめた文書．GTFS データパイプライン・バス停名寄せ・発車案内生成・通知・経路登録バリデーション・地図描画・テーマ切替・CI/CD までを章立てで網羅する．それぞれの「なぜこの形なのか」を記録する．PR ごとに積み重なる知見は `docs/REVIEW_LESSONS.md` に寄せ，本書は恒久的に残る設計判断に限定する．

---

## 📚 目次

- [📎 関連ドキュメント](#-関連ドキュメント)
- [🧱 技術スタック](#-技術スタック)
- [🔁 データフロー](#-データフロー)
- [🚌 GTFS データパイプライン](#-gtfs-データパイプライン)
- [🗓 マルチ期間データの取り扱い](#-マルチ期間データの取り扱い)
- [📍 バス停の名寄せと統合](#-バス停の名寄せと統合)
- [🔎 直通の到達可能性の判定](#-直通の到達可能性の判定)
- [🕒 発車案内の生成](#-発車案内の生成)
- [📝 経路登録のバリデーション設計](#-経路登録のバリデーション設計)
- [🔔 通知アーキテクチャ](#-通知アーキテクチャ)
- [💬 フィードバック UI（Toast）](#-フィードバック-uitoast)
- [🗺 地図表示](#-地図表示)
- [🎨 テーマ切り替え](#-テーマ切り替え)
- [🌟 経路ハイライトと固定](#-経路ハイライトと固定)
- [📦 定数の一元管理](#-定数の一元管理)
- [🗂 ディレクトリ構成と責務](#-ディレクトリ構成と責務)
- [⚙ CI/CD](#-cicd)
- [🚧 既知の制約](#-既知の制約)

---

## 📎 関連ドキュメント

本書（ARCHITECTURE）は設計判断の恒久記録として位置付ける．PR ごとのレビュー指摘から抽出した知見は `docs/REVIEW_LESSONS.md` へ蓄積する．そこで一定の汎用性を確認できた事項を本書へ蒸留する流れを取る．

表 1. 本リポジトリのドキュメントと役割分担

| ドキュメント | 位置付け | 更新タイミング |
|---|---|---|
| `README.md` | 利用者向けの機能説明と開発手順 | 機能追加・UI 変更時 |
| `docs/ARCHITECTURE.md` | 実装の設計判断と不変則 | 設計判断が追加・変更された時 |
| `docs/REVIEW_LESSONS.md` | PR ごとのレビュー指摘と対処パターン | PR レビュー対応のたびに追記 |
| `docs/notes/` | 個別の調査・障害対応で得た観察の記録 | 調査や障害対応を終えたとき |

---

## 🧱 技術スタック

表 2. 採用技術の一覧

| カテゴリ | 技術 |
|---|---|
| フロントエンド | React 19 + TypeScript + Vite 8 |
| スタイル | Tailwind CSS 4 + DaisyUI 5 |
| データベース | sql.js（ブラウザ内 SQLite）|
| 永続化 | IndexedDB（経路登録）/ localStorage（通知設定・テーマ）|
| 地図 | Leaflet + React-Leaflet |
| データ仕様 | GTFS（General Transit Feed Specification）|
| 経路形状生成 | pfaedle（Docker）+ OpenStreetMap |
| テスト | Vitest + Testing Library |
| リント・整形 | Biome |
| CI/CD | GitHub Actions + GitHub Pages |

sql.js はサーバー不要でブラウザ内に SQLite データベースを構築する．GTFS の JSON 変換データを fetch し，起動時にインメモリ DB へロードする．ブラウザ外へのリクエストは地図タイル取得を除き発生しない．

---

## 🔁 データフロー

```text
HODA (GTFS ZIP)
  |
  v
GitHub Actions (update-gtfs.yml)
  |-- ZIP をダウンロード・展開
  |-- pfaedle で shapes.txt を生成
  |-- convert-gtfs.ts で JSON に変換
  |-- public/data/ へ配置
  v
GitHub Pages (deploy.yml)
  |
  v
ブラウザ (useDatabase.ts)
  |-- JSON を fetch
  |-- sql.js で SQLite DB を構築
  |
  +-- useDepartures  --> DepartureBoard（発車案内一覧）
  +-- useNotification --> Web Notifications API
  +-- useRoutes      <-> IndexedDB（経路登録）
  +-- useTheme       <-> localStorage（テーマ）
```

図 1. HODA からブラウザまでのデータフローと主要フックの接続関係．GitHub Actions で GTFS を JSON 化して Pages に配置し，ブラウザで sql.js が構築する DB を各フックが参照する．

---

## 🚌 GTFS データパイプライン

### データ取得

HODA（北海道オープンデータプラットフォーム）から 3 事業者の GTFS を取得する．旭川電気軌道・道北バス・ふらのバスの 3 つを個別に処理する．ライセンスは CC BY 4.0 で，出典を UI に明記する．

### shapes.txt の生成

GTFS には経路の地理的形状（shapes）を含まない場合がある．pfaedle を用い，OpenStreetMap の道路ネットワークから推定 shapes を生成する．pfaedle は Docker イメージ `ghcr.io/ad-freiburg/pfaedle:latest` を使用する．

`-o` オプションは出力時に GTFS ファイルを上書きする．そのため運賃関連ファイル等をあらかじめ退避し，実行を終えてから復元する．退避対象は `fare_attributes.txt`・`fare_rules.txt`・`feed_info.txt` の 3 つである．さらに `translations.txt` と `attributions.txt` を加えた計 5 種を扱う．

### JSON 変換

`scripts/convert-gtfs.ts` が GTFS の各テーブルを JSON に変換する．事業者ごとに `{operator}.json` と `{operator}_prev.json` を生成する．ブラウザ側は fetch で受け取り，sql.js の DB に `INSERT` する．

---

## 🗓 マルチ期間データの取り扱い

### 背景

バス事業者のダイヤ改正は一斉に行われない．GTFS データを更新すると，新ダイヤの適用開始前に旧ダイヤが消える空白期間を生じる．ユーザー体験として，ダイヤ改正直前にもかかわらず運行中の便が見えなくなるのは避けたい．

### 設計

最新データと一期間前のデータを並行保持する．

- 最新：`{operator}.json` -- ID は `{operator}:{id}` 形式
- 前期：`{operator}_prev.json` -- ID は `{operator}:prev~{id}` 形式

`prev~` プレフィックスにより名前空間を分離し，同一テーブル内で共存させる．

### 期間の選択

前期間のデータは，現行ダイヤが始まるまでの穴を埋めるために保持する．適用が始まったあとは使わない．

`getActiveServiceIds` は事業者ごとに判定する．`calendar` の `start_date` が今日以前なら，その事業者の `prev~` 付き `service_id` を返さない．一方の事業者だけ次期データへ切り替わったとき，他方まで巻き添えにしないためである．

両期間の便を混ぜると不具合が 2 つ起きる．同じ便が二重に返り，`getDepartures` の取得上限を食う．表示件数はおよそ半分に減る．改定で消えた便も前期間から残り，走らないバスを案内してしまう．

`useDepartures.ts` の重複排除は残す．同じ便が兄弟バス停ごとに返る分を畳むためである．

### 運賃のフォールバック

現行データに運賃が見つからない場合， `prev~` 付き ID で前期データの運賃を検索する．

```ts
const addPrev = (id: string) => id.replace(/:/, ":prev~");
fare = getFare(db, addPrev(dep.fromStopId), addPrev(dep.toStopId), addPrev(dep.routeId));
```

### `_prev.json` の取得

SPA のルーティング構成により，存在しないパスへの fetch が HTML を返す場合がある．`Content-Type` に `json` が含まれるかチェックし，含まれなければ前期データなしとして扱う．

---

## 📍 バス停の名寄せと統合

### 課題

「旭川駅」と「旭川駅前」のように同一地点を指すバス停が別々に存在する．事業者が異なると同じ物理バス停に別の `stop_id` が振られる．ユーザーにとっては「乗れるバス停 1 つ」として扱いたい．

### 統合ルール

`src/lib/stop-search.ts` に実装．定数 `MERGE_THRESHOLD_METERS = 200` のみが数値としてコードに現れ，500m は同名統合の上限として SQL 側に埋め込まれる．

表 3. バス停クラスタリングの 2 段階ルール

| ルール | 条件 | 距離上限 |
|---|---|---|
| 同名統合 | Unicode NFKC 正規化後の `stop_name` が一致 | 500m |
| 包含統合 | 正規化後に一方の名前が他方を含む | 200m |

包含統合の例として「旭川駅」と「旭川駅前」のペアがあり，同一クラスタにまとまる．統合後の表示名は「短い名前/長い名前」の形式とする（例：「旭川駅/旭川駅前」）．

### 発車案内への反映

`getSiblingStopIds` が統合対象のバス停 ID をすべて返す．`getDepartures` は兄弟バス停 ID をすべて含めて検索する．これにより「旭川駅前」を選んでも「旭川駅」発の便が表示される．

### 空間インデックス

SQLite にはネイティブの空間インデックスがない．`getSiblingStopIds` では bounding box による SQL フィルタで候補を絞り込む．

```sql
SELECT ... FROM stops
WHERE stop_lat BETWEEN ? AND ? AND stop_lon BETWEEN ? AND ?
```

---

## 🔎 直通の到達可能性の判定

### 課題

経路登録の UX 上，「乗り換えなしで到達できるバス停」のペアだけが候補に出るべきである．ユーザーが乗車バス停を選んだあとに到達不能な降車バス停を候補として示されると混乱を招く．

### 実装

`src/lib/stop-reachability.ts` の `isReachable` が判定する．`EXISTS` 句を使う．同一 trip 上で `from.stop_sequence < to.stop_sequence` を満たすペアが 1 組でも存在すれば真を返す．

```sql
SELECT EXISTS (
  SELECT 1
  FROM stop_times st_from
  JOIN stop_times st_to
    ON st_from.trip_id = st_to.trip_id
    AND st_from.stop_sequence < st_to.stop_sequence
  WHERE st_from.stop_id IN (...)
    AND st_to.stop_id IN (...)
) AS reachable
```

`EXISTS` は最初のヒットで探索を止めるため，停留所選択・フォーム送信時のリアルタイム判定に適した計算量で済む．乗り換えは対象外で，同一 trip 内で乗車バス停の後に降車バス停が出現することを条件とする（Issue #90）．

### 候補フィルタとバリデーションの分離

`StopSearch` は `ReachabilityFilter` prop を受け，候補サジェストをクラスタ単位で絞り込む．一方で `RouteRegistration` の送信時バリデーションはフィルタを掛けない．`searchStops(db, query, 100)` のように limit 100 で広く名前一致を取る．これにより「名称は存在するが到達不可能」のケースを明確に区別する（REVIEW_LESSONS 14）．

### `StopSearch` は完全制御コンポーネント

`StopSearch` は入力文字列 `query` を内部 state として持たず，親が保持する文字列をそのまま `value` prop として受け取る．候補選択やキー入力で発生する文字列変化は `onQueryChange` コールバックで親に通知する．親（`RouteRegistration`）の `FormState` は `fromStopQuery` と `toStopQuery` を含む．`StopSearchResult` の選択状態（`fromStop` / `toStop`）と一対で管理する（Issue #99）．

半制御（内部 state ＋ `useEffect` による props→state 同期）の構成を採用しない．理由は以下のとおり．

- `selectedStop` prop の変更を内部 `useState` へ流し込む `useEffect` が要る．内部発の `onSelect(null)` による `selectedStop=null` 遷移がある．外部発の `handleEdit` / `resetForm` による遷移もある．両者を見分ける escape-hatch（`suppressNextSelectedSyncRef` 等）が積み重なる．
- 親の form state と子の query state が二重に存在する．そのため「選択済みのまま入力だけ書き換えて submit」の検知が状態遷移の順序に依存し，バグを誘発する．
- React 公式「You Might Not Need an Effect」が推奨する「状態を親に上げて完全制御にする」パターンに整合する．

---

## 🕒 発車案内の生成

### `useDepartures` フック

`src/hooks/useDepartures.ts` が中核ロジックを担う．1 分間隔で自動更新し，降車バス停ごとにグルーピングする．

**無限ループ防止：**
`db` と `routes` は `useRef` 経由で参照し，`useCallback` の依存配列に含めない．`routes` が毎レンダーで新規配列として生成される場合の対策．

**出発済み便の表示：**
`LOOKBACK_MINUTES = 10` 分前までの出発済み便も表示する．`isDeparted` フラグで視覚的に区別する．

**翌日便の取得：**
全便が出発済みの降車バス停がある場合，翌日のサービス ID で始発以降 3 便を取得する．`isNextDay` フラグで「始発以降の便」バッジを表示する．

**`isDeparted` のチェック：**
翌日便は `isDeparted` が `undefined` になる．そのため `=== false` ではなく `!d.isDeparted`（falsy チェック）を使う．Boolean 以外の空値を巻き込む場合は意図的な選択として明示する．

---

## 📝 経路登録のバリデーション設計

### エラー区別の必要性

登録フォームで失敗した際に，原因を具体的に伝えなければユーザーは修正の糸口をつかめない．`RouteRegistration.tsx` では送信時に以下の 4 通りを区別して返す．

表 4. 経路登録で区別するエラーの種類

| 区別 | 発生条件 | UI |
|---|---|---|
| 未選択 | いずれかのバス停が未入力 | 該当欄付近に「バス停を選択してください」 |
| 存在しない名称 | 入力文字列に一致する候補が 0 件 | 該当欄付近に候補なしを告知 |
| 候補から未選択 | 候補はあるがどれも選んでいない | 該当欄付近に「候補から選択してください」 |
| 乗り換えなしで到達不可能 | 両端が選択済みだが直通便なし | 上部に組み合わせ不可を告知 |

### 同一バス停禁止

乗車と降車に同じクラスタ（同一 `clusterStopIds`）を指定すると意味がないため，送信時に `SAME_STOP_ERROR_MESSAGE` を返す．文言は `src/components/RouteRegistration.tsx` の定数で一元管理する．テストも同じ定数を参照する（REVIEW_LESSONS 15）．

### バリデーション実装の原則

- 候補サジェスト（`searchStops` limit 20）と，存在確認目的の探索（limit 100）を明確に分ける．サジェスト用の limit で名称存在を判定すると上限超過が誤判定につながる．
- 送信時の相手側フィルタは `ReachabilityFilter` を掛けた広い検索を使い，「存在しない」と「到達不可能」を混同しない．
- エラーメッセージは句点「。」で終わる統一文体とし，`getByText` マッチとの齟齬を防ぐ（REVIEW_LESSONS 15）．

### 成功時のフィードバック

登録・更新が完了したらトースト（`variant: "success"`）を出す．エラー時はトーストではなくフォーム直下のアラートを使う（アクセシビリティの観点で即時読み上げが必要なため）．

---

## 🔔 通知アーキテクチャ

### 三層構造

通知関連は「確定値の永続化」「編集中の値の管理」「実際の通知発火」を 3 つのフックに分離する．

表 5. 通知系フックの責務分離

| フック | 責務 | 保存先 |
|---|---|---|
| `useNotificationSettings` | 通知タイミング（分）の確定値と永続化 | `localStorage` |
| `useNotifyBeforeMinutesInput` | 入力中の文字列と有効性判定・commit | メモリのみ |
| `useNotification` | 発車 N 分前のブラウザ通知送信 | 実行時（`Notification` API）|

### `props→state` 同期の排除

`useNotifyBeforeMinutesInput` は確定値（引数 `minutes`）と編集中の値（`inputValue`）を同一スコープで保持する．`useState` の初期化子は初回マウント時のみ評価される性質を利用し，編集中に外部から `minutes` が変わっても入力を上書きしない．

このアプローチは「ユーザー入力中に外部状態で編集内容を破壊する」React のアンチパターン（Issue #89）を構造的に排除する．呼び出し側では純粋な制御コンポーネントとして扱える．

### 永続化失敗への対応

`useNotificationSettings.setMinutes` は `localStorage.setItem` を先に試行する．成功した場合のみ state を更新する．`QuotaExceededError` 等の失敗時は throw して呼び出し側に通知し，画面表示と保存値の乖離を防ぐ．

### 通知タイミング算出

`useNotification` は `useDepartures` の 1 分更新に連動して判定する．徒歩時間（`walkMinutes`）を差し引いた自宅出発の目安時刻を基準に「N 分前」を計算する．

GTFS の 24 時超表記（例：24:05）と 0 時過ぎの現在時刻の差を補正する．`minutesUntilLeave > 1200` の場合は 1440 分を引く．これにより日付をまたぐ深夜便も正しく扱う．

通知済みの便は `tripId + departureTime` を key として `notifiedRef` に蓄積し重複送信を防ぐ．現在の `departures` に含まれなくなった key は都度削除する．

---

## 💬 フィードバック UI（Toast）

### 独自実装の理由

DaisyUI の `alert` は静的な表示向きで，複数トーストの積み上げ・自動消去・手動消去を統合的に扱う仕組みを持たない．また本アプリでは `ToastProvider` を通じた Context 経由で，任意フックから `showToast` を呼べる必要がある．このオーケストレーションは既存 CSS フレームワークの範囲外となる．そのため `src/hooks/useToast.tsx` と `src/components/Toast.tsx` の薄い独自実装とした．

### Provider / Container / Item の分離

表 6. Toast 関連要素の責務

| 要素 | 責務 |
|---|---|
| `ToastProvider` | 配列の state 管理と `showToast` / `dismissToast` の提供 |
| `ToastContainer` | 画面右下への配置と `ToastItem` の並列描画 |
| `ToastItem` | 自動消去タイマーの所有とアクセシブルな描画 |

### タイマーをアイテム側に置く理由

自動消去タイマーを Provider 側でスケジュールすると，手動消去時のクリーンアップやアンマウント時の残留タイマーを管理する難易度が上がる．各 `ToastItem` の `useEffect` で `setTimeout` を所有する．クリーンアップ関数で `clearTimeout` を呼ぶ．これによりコンポーネントライフサイクルとタイマー寿命を一致させる．

### `dismissToast` 参照の取得

`ToastItem` は props 経由ではなく `useToast()` から `dismissToast` を取得する．Provider 内で `useCallback` により参照が安定している．そのため `useEffect` の依存配列に含めてもタイマーが再スケジュールされず，予期せぬリセットを防げる．

### アクセシビリティ

`variant === "error"` は `role="alert"` / `aria-live="assertive"` で即時読み上げる．それ以外は `role="status"` / `aria-live="polite"` で穏やかに読み上げる．閉じるボタンには `aria-label="閉じる"` を付与する．

---

## 🗺 地図表示

### コンポーネント構成

`src/components/MapView.tsx` に実装．`react-leaflet` の宣言的 API を使いつつ，z-order の厳密制御のため Leaflet Pane を直接扱う部分がある．

- `MapContainer`：Leaflet の地図コンテナ
- `FitBounds`：マーカーとハイライト区間から表示範囲を自動調整
- `TileFilter`：テーマに応じたセピアフィルタを CSS で適用
- `ScrollZoomHandler`：Ctrl/Cmd + スクロールでのみズーム許可

### ポリラインの構成

各経路は 2 本のポリラインで構成する．

- ベース：shapes または trip 全体の座標．薄い灰色 `#D8DDE6`
- 乗車区間（ハイライト）：乗車バス停から降車バス停の区間．青色 `#B0C1E2`

ベースポリラインは shape/trip 単位で重複排除する．`baseMap`（`Map<string, PolylineData>`）で O(1) 検索を実現する．

### Pane による z-order 制御

Leaflet の Pane を使い 3 層で描画順序を制御する．

表 7. Pane の z-index 割当

| Pane 名 | z-index | 用途 |
|---|---|---|
| `highlight-inactive` | 450 | 非アクティブなハイライト区間 |
| `highlight-pinned` | 460 | 固定中のハイライト区間 |
| `highlight-hovered` | 470 | ホバー中のハイライト区間 |

React の配列順序変更では Leaflet の DOM 順序が変わらないため，Pane で z-index を静的に指定する方式を採用した．

### FitBounds の対象

ベースポリライン（乗車しない区間）は初期表示範囲に含めない．マーカー座標とハイライト区間の座標のみを対象にする．ホバー状態が残留すると FitBounds の結果が揺れるため，データ更新時はホバー状態をクリアする．

---

## 🎨 テーマ切り替え

### 実装

`src/hooks/useTheme.ts` が `data-theme` 属性を `<html>` に設定する．DaisyUI のテーマシステムに準拠する．選択肢は「デバイス設定（system）/ ライト / ダーク」の 3 種．`localStorage` に保存し， `system` 選択時は `matchMedia` を監視する．

### 地図タイルのフィルタ

CSS セレクタで `data-theme` に応じたフィルタを適用する．

```css
[data-theme="light"] .leaflet-tile-pane { filter: sepia(1) saturate(0.4) brightness(1.0); }
[data-theme="dark"] .leaflet-tile-pane { filter: sepia(1) saturate(0.4) brightness(0.55); }
```

当初は `MutationObserver` でテーマ変更を監視し，JavaScript から `filter` を書き換えていた．CSS セレクタ方式で同等の結果が得られるため簡素化した．

### `matchMedia` の安全ガード

テスト環境で `matchMedia` が未定義になる場合がある．`window.matchMedia` の型チェックで早期 return し，ライトモードにフォールバックする．

```ts
if (typeof window.matchMedia !== "function") return "light";
```

---

## 🌟 経路ハイライトと固定

### 状態管理

`App.tsx` で `hoveredRouteKey` と `pinnedRouteKey` を独立管理する．当初は `activeRouteKey = pinnedRouteKey ?? hoveredRouteKey` で統合していた．固定中に別の経路をホバーできない問題があったため分離した．

### ルートキーの形式

```text
{routeId}-{fromStopId}-{toStopId}
```

`routeId` を含めることで，同じ区間を走る異なる路線を区別する．

### 色の使い分け

表 8. 経路ハイライト色の 3 段階

| 状態 | ベースポリライン | ハイライトポリライン |
|---|---|---|
| 通常 | `#D8DDE6` | `#B0C1E2` |
| 固定中 | `#B0B8C8` | `#6D8CC6` |
| ホバー中 | `#B0B8C8` | `#375FA9` |

### アクセシビリティ配慮

一覧行はキーボードフォーカスで同じハイライトを起こせるよう `tabIndex` と `onKeyDown` を付与する．ホバーに相当する挙動をポインタ以外からも再現できるようにする．

この扱いは一覧行に限る．並び替え可能な列見出しでは逆の方針を採る．非対話要素である `th` はフォーカス可能にせず，操作を内側のボタンへ委ねる．Enter と Space の扱いはボタンの既定の挙動が担う．`aria-sort` は列の状態であるため `th` に残す．実装は `DepartureBoard.tsx` の `sortableHeader` を参照．

---

## 📦 定数の一元管理

UI 入力バリデーション・永続化時のクランプ・HTML 属性など，同じ値を複数箇所で参照する場合は `src/constants/` に集約する．

### `src/constants/notification.ts`

通知タイミングの範囲と既定値を 1 ファイルに集める．

```ts
export const NOTIFY_MIN_MINUTES = 1;
export const NOTIFY_MAX_MINUTES = 60;
export const NOTIFY_DEFAULT_MINUTES = 5;
```

参照箇所は 3 つある．`useNotificationSettings` は永続化のクランプと既定値に使う．`useNotifyBeforeMinutesInput` は入力バリデーションの範囲に使う．`RouteRegistration` は HTML の `min` / `max` 属性に使う．数値を 1 箇所に閉じ込めることで，範囲変更時の取りこぼしを防ぐ（REVIEW_LESSONS 11）．

---

## 🗂 ディレクトリ構成と責務

設計責務の観点で主要ディレクトリの役割を整理する．README のファイル一覧より抽象度を一段上げた区分とする．

表 9. ディレクトリ別の責務区分

| ディレクトリ | 責務 |
|---|---|
| `src/components/` | DOM 描画とイベント捕捉．表示ロジックに限定 |
| `src/hooks/` | 状態管理・副作用・フレームワーク依存ロジック |
| `src/lib/` | 純粋ロジック（SQL クエリ・距離計算・ストア操作）|
| `src/constants/` | 複数箇所で共有される定数 |
| `src/types/` | ドメイン型定義 |
| `scripts/` | GTFS 変換・形状生成・検証など CLI ツール |
| `test/` | 全テスト（コンポーネント・フック・lib を横断）|
| `public/data/` | 事業者ごとの GTFS JSON（Actions が更新）|
| `public/sql-wasm*.wasm` | sql.js の wasm（Vite の `configResolved` でコピー．Git 管理外）|

### hooks / lib の線引き

React 依存（`useState` / `useEffect` / Context 等）の有無を基準に分ける．DB クエリは `lib/` に寄せ，React のライフサイクルに乗せる側は `hooks/` に置く．テストもこの分類に沿う．lib は純関数テストとする．hooks は `@testing-library/react` の `renderHook` や component テスト経由で検証する．

---

## ⚙ CI/CD

### ワークフロー構成

表 10. GitHub Actions ワークフロー一覧

| ワークフロー | トリガ | 内容 |
|---|---|---|
| `ci.yml` | Pull Request | 整形・lint・テスト・ビルドの検査 |
| `md-lint.yml` | Pull Request（`*.md` を含む場合）| Markdown の lint |
| `claude-review.yml` | `@claude` メンション | レビューの副担当 |
| `update-gtfs.yml` | 毎週月曜 03:00 UTC / 手動 | GTFS 取得・pfaedle 生成・変換・コミット |
| `update-osm.yml` | 毎月 1 日 / 手動 | OSM データのキャッシュ更新 |
| `deploy.yml` | main push / 手動 | 検査と GitHub Pages へのデプロイ |

検査の担当は 2 つに分かれる．Pull Request は `ci.yml` が受け持つ．main への push は `deploy.yml` が受け持つ．同じトリガで両方を動かすと二重に実行されるため，担当は分けてある．

### カレンダー比較による不要実行の回避

`scripts/compare-calendar.sh` が前回キャッシュの `calendar.txt` と比較する．`start_date` が変わっていなければ pfaedle と変換をスキップする．

ただし比較の結果に関わらず再生成したい場合がある．公開中のデータが壊れた回の復旧が該当する．手動実行の `force` 入力を真にすると，比較の結果によらず再生成へ進む．

比較そのものは常に走らせ，結果を別の出力として残す．前期間データを作り直すかは，強制かどうかではなく期間が実際に変わったかで決めるためである．期間が変わっていない強制実行では，前期間ディレクトリを渡さない．渡すと `convert-gtfs.ts` は保持中の `*_prev.json` を不要とみなして消す．次期ダイヤが先に公開されている時期であれば，消えるのは現に走っている方である．

キャッシュの項目は書き換えられない．期間が同じ強制実行では `calendar.txt` のハッシュも変わらず，保存は黙って捨てられる．保存キーへ実行 ID を足し，復元は接頭辞で最新を拾う．こうしないと，復旧した内容が次のダイヤ改定で前期間として復元されない．

### OSM データの取得経路

pfaedle が使う `hokkaido-latest.osm.pbf` は約 190 MB あり，毎回の取得を避けるため Actions のキャッシュへ置く．ただし Actions のキャッシュは 7 日間アクセスがないと退避される．月次の `update-osm.yml` による保存だけでは，週次の `update-gtfs.yml` が必要とする時点で失われていることが多い．

そのため取得経路を二段構えにする．キャッシュがあればそれを使い，無ければ `scripts/run-pfaedle.sh` が Geofabrik から直接取得して md5 で検証する．取得した実体は次回のためキャッシュへ保存し直す．pfaedle の実行自体はキャッシュの有無で分岐させない．分岐させると shapes 生成の失敗が無言のスキップとして埋もれるためである．

この設計に至った経緯は [調査記録](notes/2026-09-01-osm-cache-eviction.md) に残した．

### 経路形状の生成規模の記録

失敗を赤いジョブとして表面化させても，pfaedle が成功したうえで中身が痩せている状態は捕まえられない．そこで `scripts/run-pfaedle.sh` が実行結果を `$GITHUB_STEP_SUMMARY` へ書き，実行ごとのジョブサマリに残す．

表 11. ジョブサマリへ出す項目

| 項目 | 目的 |
|---|---|
| 事業者ごとの `shapes.txt` 行数 | 生成規模を実行間で比較する |
| OSM データの取得元 | キャッシュ退避の頻度を把握する |
| pfaedle の所要時間 | 直接取得へ切り替わった際の影響を測る |
| 事業者ごとの結果 | 失敗した事業者と失敗の段階を区別する |

行数に閾値を設けて自動で落とすことはしない．GTFS の改定でバス停や便が減れば行数も正当に減るためである．異常かどうかの判断は人が行う．

`GITHUB_STEP_SUMMARY` が未設定のローカル実行では何も書かない．

### 経路形状を欠いた公開の遮断

pfaedle が動かなかった回でも，変換そのものは成功する．`scripts/convert-gtfs.ts` は `shapes.txt` が無ければ空として扱うためである．結果として経路形状を持たない JSON がコミットされ，地図から線が消える．2026-08-24 の更新で実際に起きた．

そこで変換結果を書き出す前に `assertShapesPresent` で検査する．`shapes` が空の事業者があれば，その JSON を書かずジョブを失敗させる．欠けたデータが公開へ進む経路を塞ぐ狙いである．

前期間の `*_prev.json` にも同じ検査を課す．`useDatabase` は存在すれば読み込むため，こちらが欠けても地図から経路が消える．前期間の変換で起きた失敗はログへ流すだけだったが，ジョブの失敗として扱うよう改めた．

同じ役目の `scripts/validate-shapes.ts` は `run-pfaedle.sh` の中でしか動かない．pfaedle のステップごとスキップされた回には効かなかった．検査は生成の内側だけでなく，変換と公開の境界にも要る．

### `GITHUB_TOKEN` の制限

`GITHUB_TOKEN` によるコミット push は他のワークフローをトリガしない．`update-gtfs.yml` のコミット後に `gh workflow run deploy.yml` を明示的に呼ぶ．

### Actions の固定化

信頼できる状態で実行するため， `uses:` 指定はコミット SHA で固定する．バージョン番号の移動を防ぎ，サプライチェーン攻撃の影響範囲を抑える．

---

## 🚧 既知の制約

### 循環路線の運賃

GTFS の `fare_rules` は出発ゾーンと到着ゾーンの組み合わせで運賃を定義する．循環路線で同じゾーンペアに異なる運賃がある場合，正しい運賃を特定できない．これは GTFS 仕様の制約であり現状は受容している．

### sql.js のメモリ使用

全データをブラウザ内の SQLite に保持するため，データ量が増えるとメモリ消費が課題になる可能性がある．現状の 3 事業者規模では実害は観測されていない．

### pfaedle の shapes 精度

OSM の道路ネットワークから経路を推定するため，実際のバス路線と異なる経路を生成する場合がある．地図表示はあくまで参考情報である旨を UI 側で暗黙的に伝える（実線一本で正確なルートは示さない配色）．

### 前期間データは作り直せない

`*_prev.json` の材料は Actions のキャッシュにある GTFS だけである．HODA は現行のフィードしか配信しないため，過ぎた期間のデータを取り直せない．前期間の JSON が壊れた場合，直す手立ては次のダイヤ改定を待つことになる．

2026-09-01 の復旧では，現行期間の 3 ファイルだけが戻り，`asahikawa_denkikido_prev.json` は経路形状を欠いたまま残った．経緯は [調査記録](notes/2026-09-01-osm-cache-eviction.md) を参照．

### タブが閉じている間の通知

通知は Web Notifications API を使用するため，タブが開いている間のみ動作する．Service Worker による Push Notification への拡張は現状スコープ外．

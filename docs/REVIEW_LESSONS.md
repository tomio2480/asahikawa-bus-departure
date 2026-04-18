# 📘 過去レビューから抽出したセルフレビュー観点

これまでの PR #92 / #95 / #96 / #97 で CodeRabbit・gemini-code-assist・ユーザーから受けた指摘を恒久化し，新規 PR を出す前のセルフレビューチェックリストとして機能させるための文書．実装エージェント・レビュー担当（自分自身含む）は，PR 作成前にここを最後に一読すること．

---

## 目次

- [運用ルール](#運用ルール)
- [頻出する指摘カテゴリ](#頻出する指摘カテゴリ)
- [セルフレビューチェックリスト](#セルフレビューチェックリスト)
- [今回の PR 固有の観点](#今回の-pr-固有の観点)
- [参照した過去 PR](#参照した過去-pr)

---

## 運用ルール

- 新しい指摘を受けて対応したら，本文書に項目を追加する．
- 「指摘内容・根本原因・対処パターン」の 3 点を書く．
- 過度に一般化せず，このリポジトリ固有の文脈（GTFS / sql.js / React / ToastProvider 等）に紐づけて記述する．

---

## 頻出する指摘カテゴリ

### 1. React の状態管理 -- `useEffect` による props→state 同期を避ける

- **指摘例** （PR #96 gemini-code-assist）： `useEffect` で `results` を `query` / `reachabilityFilter` と同期していたため，二重検索・不整合の原因になっていた．
- **対処パターン** ： `useMemo` による派生値化で依存関係を型レベルで可視化する．`setResults` 経由の伝播を廃止する．
- **適用範囲** ：「入力から派生する検索結果」「入力から派生する有効性フラグ」等，単方向で計算可能な値は全て `useMemo` に寄せる．
- **除外** ：ユーザーの明示的操作（選択・送信）で決まる UI 状態（ドロップダウンの開閉等）は `useState` のまま残す．

### 2. WAI-ARIA 属性と DOM 描画条件の一致

- **指摘例** （PR #96 CodeRabbit， `src/components/StopSearch.tsx` L59）： `aria-expanded` が `isOpen` だけを見ていたため，候補 0 件のとき listbox が描画されないのに `aria-expanded="true"` が残る．
- **対処パターン** ：「listbox の実在状態」を表す派生値（例： `isListboxOpen = isOpen && results.length > 0`）を作り， `aria-expanded` と描画条件の両方に同じ値を適用する．
- **チェック観点** ： `role="listbox"` / `role="dialog"` / `role="menu"` 等を条件付き描画する場合，対応する `aria-expanded` / `aria-haspopup` / `aria-controls` の値も同じ条件に従っているか．

### 3. クラスタリング・集約処理の契約違反

- **指摘例** （PR #96 CodeRabbit， `src/lib/stop-search.ts`）：到達可能性フィルタを SQL の `WHERE` 段階で適用していたため， `StopSearchResult.clusterStopIds` の「クラスタに含まれる全物理 stop_id」契約が壊れた．事業者バッジ欠落・名前統合崩れ・代表 ID ズレを誘発．
- **対処パターン** ：クラスタリング後に `isReachable` でクラスタ単位フィルタを適用する．クラスタ内の少なくとも 1 メンバーが条件を満たせばクラスタ全体を採用し， `clusterStopIds` は生成時の完全な集合を保持する．
- **チェック観点** ：集約後の型にプロパティを持たせる場合，そのプロパティが「集約前の全メンバーを保持する」契約か，「フィルタ済み集合のみを保持する」契約かを型コメントに明記する．

### 4. 空値扱いと型安全ガード -- `||` と `??` の区別

- **指摘例** （PR #96 gemini-code-assist， `src/components/RouteRegistration.tsx`）： gemini 提案が `||` を使っていたが，型 `string[] | null` に対しては空配列を falsy 扱いしてしまう．
- **対処パターン** ：空値判定は `??`（null / undefined のみ）を使う．空配列が「フィルタなし」を表すのか「絞り込みの結果該当なし」を表すのかは別ルールで定義する．
- **チェック観点** ：空配列・空文字列・ `0` が意味を持つ文脈で `!value` / `value || fallback` を書いていないか．

### 5. UI 文言とテスト assertion の整合

- **指摘例 A** （PR #97 ホットフィックス）： `5ed8997` で「発車」→「出発」に UI を変更したが，テストの正規表現 `/発車の/` が未追従で main の deploy が赤になった．
- **指摘例 B** （PR #96 CodeRabbit nitpick）： `/直通便|到達|経路がありません/` のキーワード選言は文言退化を検出できない．
- **対処パターン** ：
  - UI 文言変更時は， `grep -rn '<旧文言>' test src` で残存を 0 件に揃える．
  - テストの assertion は実装側の実文言に沿った冒頭フレーズで固定する（`getByText(/選択したバス停間に直通便がありません/)` 等）．キーワード選言は避ける．
- **チェック観点** ：文言を書き換えたら必ず grep で残存をスイープする．

### 6. 用語統一 -- ユーザー向け文言の揺れを残さない

- **指摘例** （PR #95 CodeRabbit）：現在値表示が「出発」なのに成功トーストだけ「発車」になっていた．
- **対処パターン** ：ユーザー向け文言は 1 コンポーネント内・1 画面内で揃える．外部から指示された用語（「乗り換えなし」等）が入ったら，近接する全文言にも反映する．

### 7. Enter 経路とボタン経路の対称性

- **指摘例** （PR #92 CodeRabbit）：設定ボタンは `submitting` / `togglingRouteId` で disabled 化していたが，Enter キー経路では同じ busy ガードが効かず，処理中でも確定できた．
- **対処パターン** ：Enter でも呼ばれる確定関数（ `commitNotifyInput` 等）の冒頭で， ボタン側の `disabled` 条件と同じガードを早期リターンで配置する．
- **チェック観点** ：form submit， Enter key handler， onClick handler の 3 経路がある場合，それぞれで busy ガード・バリデーションガードが対称に掛かっているか．

### 8. Memoized 値の再利用

- **指摘例** （PR #96 gemini-code-assist）： `getSiblingStopIds` を `useMemo` で既に計算済みなのに， `handleSubmit` 内で再度呼んでいて冗長な DB クエリが走っていた．
- **対処パターン** ： useMemo で算出した値は，同じ依存下で再計算せずに参照する．null フォールバックは `??` で型安全ガードを兼ねる．

### 9. sql.js の WASM メモリ管理

- **指摘例** （PR #96 CodeRabbit）：ネストされた `beforeEach` が外側で作成済みの `db` を `db = new SQL.Database()` で上書きし，古い `db` を解放せずリークしていた．
- **対処パターン** ：内側 `beforeEach` の先頭で `db.close()` を呼んでから再代入する．
- **チェック観点** ：テスト追加時に `new SQL.Database()` を書いたら，その直前に `db.close()` があるか．

### 10. テスト cleanup の明示

- **指摘例** （PR #92 CodeRabbit）： `renderHook` も React root を作るため `afterEach(cleanup)` が必要．プロジェクト慣習に合わせる．
- **対処パターン** ：新規テストファイルは既存のテストファイルの `afterEach` パターンをコピーする（ `cleanup()` + `db.close()`）．

### 11. 定数の集約

- **指摘例** （PR #92 gemini-code-assist）： `NOTIFY_MIN_MINUTES` / `NOTIFY_MAX_MINUTES` が複数箇所にハードコードされていた．
- **対処パターン** ：境界値・閾値は `src/constants/` に集約し，型付きで export する．HTML 属性（ `min` / `max`）からも同じ定数を参照する．

### 12. 通知許可要求の例外捕捉

- **指摘例** （PR #92）： `onRequestNotificationPermission` の呼び出しを try の外に置いていたため，permission rejection が未処理になっていた．
- **対処パターン** ：permission 要求は副作用なので try ブロック内に置き， catch で同じエラーメッセージ経路に合流させる．

### 13. 再レンダ範囲の局所化

- **指摘例** （PR #92 gemini-code-assist）：入力 state を `AppContent` 直下で持っていたため，1 キーストロークごとに `MapView` / `DepartureBoard` まで再レンダされた．
- **対処パターン** ：入力 state は「消費者コンポーネント」の内部に押し込む．永続化だけ親から `setter` prop で受ける．

---

## セルフレビューチェックリスト

**PR を Draft で出す前に，以下をすべて確認すること．**

### コード変更

- [ ] `useEffect` で props→state 同期していないか． `useMemo` で派生値化できないか．
- [ ] WAI-ARIA 属性（`aria-expanded` / `aria-controls` / `aria-selected` 等）の値が，対応する DOM 描画条件と一致しているか．
- [ ] 配列を扱うフィルタで `||` を使っていないか． `??` に置換できるか．
- [ ] UI 文言を変えたら， `grep -rn '<旧文言>' test src` で残存が 0 件か．
- [ ] 定数値（閾値・分数・回数等）を 2 箇所以上に直書きしていないか．
- [ ] `new SQL.Database()` の直前・直後で， `close()` の対応が取れているか．
- [ ] Enter key handler と onClick handler で，busy / validity ガードが対称か．
- [ ] `useMemo` で計算した値を別関数で再計算していないか．

### テスト

- [ ] assertion がキーワード選言（ `/foo|bar|baz/`）になっていないか．実装文言に沿った冒頭フレーズで固定しているか．
- [ ] 新規テストファイルは既存の `afterEach(cleanup)` パターンに揃っているか．
- [ ] ネストされた `beforeEach` が外側で作った `db` を上書きする場合，先頭で `db.close()` を呼んでいるか．
- [ ] Red ステップを必ず踏んだか（失敗出力を一度確認したか）．

### PR 作成

- [ ] Draft で作成しているか．
- [ ] `git push` のタイミングはユーザー指示を受けたあとか．
- [ ] PR 本文に Test plan が入っているか．

---

## 今回の PR 固有の観点

タスク：経路登録 UI の 4 点改善（成功トースト・エラー文言変更・注意書き追加・入力乖離時の再検証）．

### 個別の注意

- **文言統一** ：要望 2・3 は「乗り換えなしで到達できる便」という表現を共通キーワードにする．エラーメッセージと注意書きの間で用語がブレないよう，両方のテストで同じ正規表現フラグメントを共有する．
- **`StopSearch.onSelect` の型拡張** ：型を `(stop: StopSearchResult) => void` から `(stop: StopSearchResult | null) => void` に広げる．既存の全利用箇所（現状 `RouteRegistration` 2 箇所のみ）が null を受けて正しく動くことを確認する．
- **選択無効化の契約** ： `selectedStop` が与えられている状態で `query` が `selectedStop.stop_name` と一致しなくなったら， `onSelect(null)` を呼ぶ．これは `handleSearch` 内で行い， `useMemo` の results 派生には含めない（責務分離）．
- **re-entrancy 防止** ：選択直後に `setQuery(stop.stop_name)` → `handleSearch` ではなく `onSelect` 経由で query を同期しているため，選択直後に `onSelect(null)` が呼ばれるループは起きない．ただし `selectedStop` prop 変化の `useEffect` 経路（L69-71）と衝突しないよう，「 `selectedStop` 経由の setQuery では onSelect(null) を呼ばない」ことをコード上で保証する．
- **成功トーストの文言** ：経路登録は `${fromName} → ${toName} を登録しました` / `更新しました` ． 既存の通知トグルトースト（ `${routeLabel} の通知を ON にしました`）と様式を揃える．

### 実装前に確認したこと

- `StopSearch` の import 元は `grep -rn "from.*StopSearch"` で `RouteRegistration.tsx` のみ （他コンポーネントへの影響なし）．
- 現行テスト 1908-1946 のエラー文言 assertion は本 PR で新文言に更新する．

---

## 参照した過去 PR

| PR | タイトル | 主な指摘 |
|---|---|---|
| #92 | 通知タイミング入力のリフトアップ | Enter 経路の busy ガード，定数集約，再レンダ局所化 |
| #95 | `useNotifyBeforeMinutesInput` 配置変更 | `useState` 初期化子の undefined→defined トラップ，用語「発車」→「出発」揃え |
| #96 | 直通便で到達不能な組み合わせ除外 | クラスタ契約違反，`aria-expanded` 乖離，`useEffect` 同期排除，`??` vs `||`，assertion の固定文字列化 |
| #97 | main ホットフィックス（文言追従） | UI 文言変更時の test grep スイープ漏れ |

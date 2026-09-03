# 📘 過去レビューから抽出したセルフレビュー観点

これまでの PR #92 / #95 / #96 / #97 / #98 / Issue #99 で受けた指摘を恒久化する文書．指摘の出所は CodeRabbit・gemini-code-assist・ユーザーである．新規 PR を出す前のセルフレビューチェックリストとして機能させる．実装エージェント・レビュー担当（自分自身含む）は，PR 作成前にここを最後に一読すること．

本書は PR ごとに積まれる「移ろいやすい」知見を対象とする．設計判断の不変則は [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) に置き，本書で一定の汎用性が確認された事項をそちらへ蒸留する流れを取る．

---

## 目次

- [関連ドキュメント](#関連ドキュメント)
- [運用ルール](#運用ルール)
- [頻出する指摘カテゴリ](#頻出する指摘カテゴリ)
- [セルフレビューチェックリスト](#セルフレビューチェックリスト)
- [今回の PR 固有の観点](#今回の-pr-固有の観点)
- [参照した過去 PR](#参照した過去-pr)

---

## 関連ドキュメント

- [`docs/ARCHITECTURE.md`](ARCHITECTURE.md): 設計判断と実装上の恒久的な勘所．本書で蓄積された知見のうち，汎用性が高いものを蒸留する先．
- [`README.md`](../README.md): 利用者向けの機能説明と開発手順．UI・機能の変更時に更新する．

---

## 運用ルール

- 新しい指摘を受けて対応したら，本文書に項目を追加する．
- 「指摘内容・根本原因・対処パターン」の 3 点を書く．
- 過度に一般化せず，このリポジトリ固有の文脈（GTFS / sql.js / React / ToastProvider 等）に紐づけて記述する．

---

## 頻出する指摘カテゴリ

### 1. React の状態管理 -- `useEffect` による props→state 同期を避ける

- **指摘例**（PR #96 gemini-code-assist）：`useEffect` で `results` を同期していた．同期先は `query` と `reachabilityFilter` である．そのため二重検索と不整合の原因になっていた．
- **対処パターン**：`useMemo` による派生値化で依存関係を型レベルで可視化する．`setResults` 経由の伝播を廃止する．
- **適用範囲**：「入力から派生する検索結果」「入力から派生する有効性フラグ」等，単方向で計算可能な値は全て `useMemo` に寄せる．
- **除外**：ユーザーの明示的操作（選択・送信）で決まる UI 状態（ドロップダウンの開閉等）は `useState` のまま残す．

### 2. WAI-ARIA 属性と DOM 描画条件の一致

- **指摘例**（PR #96 CodeRabbit）：`aria-expanded` が `isOpen` だけを見ていた．`src/components/StopSearch.tsx` L59 での指摘である．候補 0 件のとき listbox が描画されない．それでも `aria-expanded="true"` が残る．
- **対処パターン**：「listbox の実在状態」を表す派生値を作る．例は `isListboxOpen = isOpen && results.length > 0` である．`aria-expanded` と描画条件の両方へ同じ値を適用する．
- **チェック観点**：条件付きで描画する `role="listbox"` / `role="dialog"` / `role="menu"` 等がある．対応する `aria-expanded` / `aria-haspopup` / `aria-controls` の値も同じ条件に従っているか．

### 3. クラスタリング・集約処理の契約違反

- **指摘例**（PR #96 CodeRabbit）：`src/lib/stop-search.ts` での指摘である．到達可能性フィルタを SQL の `WHERE` 段階へ適用していた．そのため `StopSearchResult.clusterStopIds` の「クラスタに含まれる全物理 stop_id」契約が壊れた．事業者バッジ欠落・名前統合崩れ・代表 ID ズレを誘発．
- **対処パターン**：クラスタリング後に `isReachable` でクラスタ単位フィルタを適用する．クラスタ内の少なくとも 1 メンバーが条件を満たせばクラスタ全体を採用し， `clusterStopIds` は生成時の完全な集合を保持する．
- **チェック観点**：集約後の型にプロパティを持たせる場合がある．そのプロパティが「集約前の全メンバーを保持する」契約か「フィルタ済み集合のみを保持する」契約かを，型コメントへ明記する．

### 4. 空値扱いと型安全ガード -- `||` と `??` の区別

- **指摘例**（PR #96 gemini-code-assist）：gemini 提案が `||` を使っていた．`src/components/RouteRegistration.tsx` での指摘である．型 `string[] | null` に対しては空配列を falsy 扱いしてしまう．
- **対処パターン**：空値判定は `??`（null / undefined のみ）を使う．空配列が「フィルタなし」を表すのか「絞り込みの結果該当なし」を表すのかは別ルールで定義する．
- **チェック観点**：空配列・空文字列・`0` が意味を持つ文脈で `!value` / `value || fallback` を書いていないか．

### 5. UI 文言とテスト assertion の整合

- **指摘例 A**（PR #97 ホットフィックス）：`5ed8997` で「発車」→「出発」に UI を変更した．テストの正規表現 `/発車の/` が未追従で，main の deploy が赤になった．
- **指摘例 B**（PR #96 CodeRabbit nitpick）：`/直通便|到達|経路がありません/` のキーワード選言は文言退化を検出できない．
- **対処パターン**：
  - UI 文言変更時は， `grep -rn '<旧文言>' test src` で残存を 0 件に揃える．
  - テストの assertion は実装側の実文言に沿った冒頭フレーズで固定する（例：`getByText(/乗り換えなしで到達できる便が見つかりませんでした/)`）．キーワード選言（`/A|B|C/`）は避ける．
  - 本文書の引用文言も文言変更時に追従させる．grep スイープで本 Markdown がノイズヒットしないよう，現行 UX の文言で例示する．
- **チェック観点**：文言を書き換えたら必ず grep で残存をスイープする．

### 6. 用語統一 -- ユーザー向け文言の揺れを残さない

- **指摘例**（PR #95 CodeRabbit）：現在値表示が「出発」なのに成功トーストだけ「発車」になっていた．
- **対処パターン**：ユーザー向け文言は 1 コンポーネント内・1 画面内で揃える．外部から指示された用語（「乗り換えなし」等）が入ったら，近接する全文言にも反映する．

### 7. Enter 経路とボタン経路の対称性

- **指摘例**（PR #92 CodeRabbit）：設定ボタンを disabled 化していた．条件は `submitting` と `togglingRouteId` である．しかし Enter キー経路では同じ busy ガードが効かず，処理中でも確定できた．
- **対処パターン**：Enter でも呼ばれる確定関数（`commitNotifyInput` 等）がある．その冒頭にボタン側の `disabled` 条件と同じガードを早期リターンで置く．
- **チェック観点**：form submit，Enter key handler，onClick handler の 3 経路がある．それぞれで busy ガード・バリデーションガードが対称に掛かっているか．

### 8. Memoized 値の再利用

- **指摘例**（PR #96 gemini-code-assist）：`getSiblingStopIds` は `useMemo` で計算済みだった．それでも `handleSubmit` 内で再度呼び，冗長な DB クエリが走っていた．
- **対処パターン**：useMemo で算出した値は，同じ依存下で再計算せずに参照する．null フォールバックは `??` で型安全ガードを兼ねる．

### 9. sql.js の WASM メモリ管理

- **指摘例**（PR #96 CodeRabbit）：ネストされた `beforeEach` が外側で作成済みの `db` を上書きしていた．`db = new SQL.Database()` を呼び，古い `db` を解放せずリークしていた．
- **対処パターン**：内側 `beforeEach` の先頭で `db.close()` を呼んでから再代入する．
- **チェック観点**：テスト追加時に `new SQL.Database()` を書いたら，その直前に `db.close()` があるか．

### 10. テスト cleanup の明示

- **指摘例**（PR #92 CodeRabbit）：`renderHook` も React root を作るため `afterEach(cleanup)` が必要．プロジェクト慣習に合わせる．
- **対処パターン**：新規テストファイルは既存のテストファイルの `afterEach` パターンをコピーする（`cleanup()` + `db.close()`）．

### 11. 定数の集約

- **指摘例**（PR #92 gemini-code-assist）：通知の分数の下限と上限を複数箇所へハードコードしていた．該当は `NOTIFY_MIN_MINUTES` と `NOTIFY_MAX_MINUTES` である．
- **対処パターン**：境界値・閾値は `src/constants/` に集約し，型付きで export する．HTML 属性（`min` / `max`）からも同じ定数を参照する．

### 12. 通知許可要求の例外捕捉

- **指摘例**（PR #92）：`onRequestNotificationPermission` の呼び出しを try の外に置いていた．そのため permission rejection が未処理になっていた．
- **対処パターン**：permission 要求は副作用なので try ブロック内に置き， catch で同じエラーメッセージ経路に合流させる．

### 13. 再レンダ範囲の局所化

- **指摘例**（PR #92 gemini-code-assist）：入力 state を `AppContent` 直下で持っていた．1 キーストロークごとに `MapView` / `DepartureBoard` まで再レンダされた．
- **対処パターン**：入力 state は「消費者コンポーネント」の内部に押し込む．永続化だけ親から `setter` prop で受ける．

### 14. `searchStops` limit はバリデーション用途とサジェスト用途で使い分ける

- **指摘例**（PR #98 gemini-code-assist）：検索の件数上限を既定値のまま使っていた．`describeUnselectedStopError` 内の `searchStops` 呼び出しが該当する．既定値は `DEFAULT_LIMIT=20` である．`src/components/RouteRegistration.tsx` L162 / L188 での指摘である．部分一致が 21 件以上出る汎用語（「前」「中央」等）がある．厳密一致が上位 20 件から落ちると，実在するバス停でも「存在しません」「一致するバス停が見つかりません」と誤判定する．
- **対処パターン**：バリデーション目的の呼び出しでは第 3 引数に `100`（`searchStops` 側のハードキャップ上限）を明示する．サジェスト UI（ドロップダウン表示）はデフォルト 20 のままでよい．
- **チェック観点**：
  - 「存在判定・厳密一致判定」を目的に `searchStops` を呼ぶ箇所で `limit` を明示しているか．
  - `undefined` プレースホルダで `filter` だけ渡している箇所はないか（第 3 引数はバリデーション目的なら `100` を明示）．
- **適用外**：単純なサジェストのみ目的の呼び出し（`StopSearch.tsx` 内の候補表示）はデフォルト `DEFAULT_LIMIT=20` でよい．ユーザーの目に触れる候補数と揃える．

### 15. エラーメッセージの句点・文体統一

<!-- 引用したコード片に「です。」を含むため no-mix-dearu-desumasu が誤検出する． -->
<!-- 地の文はである調で揃っている．引用を崩さないため，この箇条書きだけ外す． -->
<!-- textlint-disable ja-technical-writing/no-mix-dearu-desumasu -->

- **指摘例 A**（PR #98 CodeRabbit）：`describeUnselectedStopError` の空クエリ分岐だけ句点がない．`src/components/RouteRegistration.tsx` L145 での指摘である．該当は `${sideLabel}を選択してください` である．他分岐（`...してください。` / `...です。`）と不揃いだった．`\n` 連結時に可視化される．
- **指摘例 B**（PR #98 ユーザー指示）：`SAME_STOP_ERROR_MESSAGE` の末尾に「。」を追加．
- **対処パターン**：同一コンポーネント内のユーザー向け文字列は句点有無・体言止め・敬体を揃える．複数行を `\n` で連結する可能性があるメッセージは句点で閉じる．
- **チェック観点**：エラーメッセージ生成関数を追加・変更したら，該当関数内の全分岐と既存定数で文末形が一致しているか．

<!-- textlint-enable ja-technical-writing/no-mix-dearu-desumasu -->

### 16. `handleSearch` 中間状態で `onSelect(null)` は発火する契約

- **指摘例**（PR #98 CodeRabbit）：テスト名と本体が食い違っていた．`test/StopSearch.test.tsx` L231-248 での指摘である．テスト名は「入力値が一致する query のまま onSelect(null) は呼ばれない」である．本体は `render` のみで `userEvent.type` していなかった．CodeRabbit の diff 提案は `userEvent.type("旭川駅前")` を挿入する形である．しかし `handleSearch` には契約がある．`selectedStop.stop_name` と一致しない中間状態がある．例は打鍵途中の「旭」「旭川」である．その状態で意図的に `onSelect(null)` を発火する．そのため `expect(onSelect).not.toHaveBeenCalled()` を満たせない．
- **対処パターン**：「選択済み状態で `onSelect(null)` が誤発火しない」ことを検証するテストがある．`userEvent.type` で再入力する形は採らない．初期マウント時点（`selectedStop` prop 付き `render` 直後）で assertion する．
- **チェック観点**：
  - 選択済みフィールドで `userEvent.type` を使うテストは， `onSelect(null)` の中間発火を織り込んだ assertion になっているか．
  - `selectedStop` 経由の `useEffect` 同期と打鍵入力を同じテストで混ぜていないか．
- **背景**：`handleSearch` の中間 null 発火は `selectedStop` 無効化の仕様（入力が選択済みと乖離したら選択状態を破棄）を担う．この契約は変えない．

### 17. 半制御コンポーネントを避け，入力系は完全制御に寄せる

- **指摘例**（Issue #99）：`src/components/StopSearch.tsx` での指摘である．内部で `useState<query>` を持っていた．さらに `selectedStop` prop の変化を `useEffect` で同期するハイブリッド構造になっていた．「内部発の `onSelect(null)` による selectedStop=null は query 反映させたくない」という要求があった．これに応えるため `suppressNextSelectedSyncRef` という escape-hatch が積まれた．意味論が不透明になっていた．
- **対処パターン**：React 公式「You Might Not Need an Effect」に従う．props→state 同期の useEffect を消す．query は親が完全に保持する完全制御コンポーネントにし，子は `value={query}` をそのまま input に渡すだけにする．親側は `RouteRegistration.tsx` である．その form state は `fromStopQuery` と `toStopQuery` を持つ．`handleEdit` / `resetForm` 等の操作で，stop と query を同一トランザクションで更新する．
- **チェック観点**：
  - 子コンポーネント内に「親の prop を初期値として useState で受け，useEffect で prop 変化に追従」する構造があったら，それは半制御．親に state を上げて完全制御にできないか検討する．
  - suppress フラグ / skip ref が必要になった時点で，状態の二重管理がバグを呼んでいるサイン．手続き的な打ち消しより構造を平らにする．
- **テスト側の影響**：完全制御化すると子単体のテストに手当てが要る．`query` / `onQueryChange` を明示的に渡す．あるいは state を保持する薄い wrapper（例：`ControlledStopSearch`）経由で render する．`<Component />` を `<ControlledComponent />` に置換するだけで旧挙動を再現できるよう wrapper を汎用化する．

### 18. セルフレビューは並列エージェントで多視点から行う

- **指摘例**（PR #98 ユーザー指示）：Draft PR 作成前のセルフレビューで，単一視点だと検知漏れが発生しやすい．a11y / 型安全 / デッドコード / テスト品質等の観点ごとに視点が独立しているため，並列実行で網羅性を上げられる．
- **対処パターン**：Draft 作成前に以下の 4 視点相当でエージェントを並列起動する．
  - WAI-ARIA / keyboard 操作性（`aria-*` 属性と描画条件の一致，Enter / Escape 等）．
  - 型安全 / `||` vs `??` / 空値扱い．
  - デッドコード / 重複ロジック / マジックリテラル．
  - テストの assertion 強度（キーワード選言の不在，冒頭フレーズ固定の堅牢性，同時検証の網羅）．
- **チェック観点**：セルフレビューが 1 パスで済んでいる場合，視点の独立性が担保されているか疑う．レビュー結果を本文書のカテゴリに還元する．

### 19. フォーム全体の無効化ポリシーを派生値で束ねる

- **指摘例**（PR #102 gemini-code-assist / Issue #103）：次の指摘である．`src/components/RouteRegistration.tsx` が対象である．
  - 入力系 3 種を submit pending 中に disabled 化していなかった．入力系は `StopSearch` × 2・徒歩時間 `input`・通知 `checkbox` である．そのため `await` 解決後の `resetForm` でユーザーの新しい入力を吹き飛ばすレースが起きた．
  - さらに既存コードには非対称があった．キャンセル・一覧通知トグル・編集・削除ボタンは `submitting || togglingRouteId !== null` を直書きしている．一方で登録/更新ボタンのみ `submitting` 単独判定だった．そのため「トグル処理中でも登録ボタンだけ押せる」状態が生じていた．
- **対処パターン**：
  - `isFormLocked = submitting || togglingRouteId !== null` のような派生値を 1 箇所で定義する．対象は入力系・キャンセル・登録/更新・一覧のトグル/編集/削除・子コンポーネント（`NotifySettings` 等）である．これらの disabled 条件をすべて同値に揃える．子コンポーネント側も個別フラグではなく派生値を受け取る契約にする．個別フラグは `submitting` / `togglingRouteId` で，派生値は `isFormLocked` である．これにより重複ロジックと対称性の崩れをまとめて解消する．
  - 親の async 処理（例：permission 要求の `await`）がある．これは `setSubmitting(true)` より **後** に置き，try ブロック内へ含める．**前** に置いてはいけない．前に置くと「プロンプト表示中は `isFormLocked=false`」の空白期間ができる．入力レースが残り，さらに async の reject が下の try/catch 外に漏れる．`setSubmitting(true)` を先に呼ぶ．次に `try { await permission; await save; }` を置く．最後に `finally { setSubmitting(false); }` を置く．
  - `StopSearch` のような composite widget を `disabled` 化するときがある．listbox を閉じる責務は **二段構え** で担保する．「派生値」と「`useEffect` による内部 state リセット」の 2 つである．
    - 派生値を次のように定義する．`const isListboxOpen = !disabled && isOpen && results.length > 0` である．`disabled=false→true` のレンダリング段階から listbox を非表示にする．`useEffect` は render 後に走るため，1 フレーム描画が残る問題を防ぐ．
    - 次の `useEffect` を置く．`useEffect(() => { if (disabled) setIsOpen(false); }, [disabled])` である．`disabled=true→false` の逆遷移時に，内部 `isOpen` が保持されたまま `results` が残る．listbox が自動再表示される問題を防ぐ．再表示にはユーザーの明示操作（focus/入力）を要求する契約である．
    - 片方だけだと異なる遷移方向のバグが残る．gemini-code-assist が 1 フレーム問題を指摘した．coderabbitai が逆遷移の再表示問題を別々に指摘した．
- **補足**：`useEffect` を書くときは「派生値で表現できないか」を最初に検討する．React 公式「You Might Not Need an Effect」を参照する．ただし本件の逆遷移リセットのように，描画条件だけでは「内部 state の保持」に起因する問題が残るケースもある．その場合は派生値で描画を保証したうえで，`useEffect` で内部 state を一方向にリセットして補う．両者が担う責務（1 フレーム問題 vs 逆遷移時の再表示）を JSDoc に明記して混同を防ぐ．Issue #99 で排除した「props→state 同期」（双方向・常時追従）とは依然として別物である．
- **チェック観点**：
  - 同じ真偽条件式（`a || b !== null` 等）が 3 箇所以上に重複していないか．派生値に束ねられないか．
  - フォーム送信・トグル処理などの async 操作中に，他の入力系が触れる状態になっていないか．
  - フォーム送信ハンドラで， `setSubmitting(true)` より前に `await`（permission 要求等）していないか．プロンプト表示中の入力レースと reject の捕捉漏れの温床．
  - disabled になった composite widget が「見える」けれど「操作できない」中途半端な状態を作っていないか．
  - disabled 化の実装が両方向を閉じているか．`disabled=false→true` 遷移時の描画フレームが 1 つ．`disabled=true→false` 逆遷移時の内部 state 保持がもう 1 つ．

### 20. workflow のトリガ範囲と検査範囲の一致

- **指摘例**（PR #131 セルフレビュー）：`deploy.yml` のトリガは `push: main` だけだった．そのため Pull Request では Biome に限らず，`npm test` と `tsc -b` も走らない．マージされるまで JavaScript 側の検査は働かない．チェック欄は緑に見える．実際に走っていたのは Markdown lint のみである．
- **対処パターン**：workflow を新設・変更したら， `on:` のイベントと，そのジョブが担う検査項目（整形・lint・テスト・ビルド）を突き合わせる．Pull Request の時点で欠ける検査があれば， `pull_request` 用の workflow を新設する．同じ検査を `push` と `pull_request` の双方で走らせると二重に実行されるため，担当を分ける．
- **補足**：経緯は [PR に検査が掛かっていなかった構造](notes/2026-09-01-pr-check-gap.md) を参照．
- **チェック観点**：
  - `.github/workflows/*.yml` を触ったら，Draft PR の Checks 欄に出るジョブ名と `on:` の記述が一致しているか．
  - 「マージ後にしか検査されない」項目が残っていないか．
  - 同じ検査が複数の workflow で重複して走っていないか．

---

## セルフレビューチェックリスト

**PR を Draft で出す前に，以下をすべて確認すること．**

### コード変更

- [ ] `useEffect` で props→state 同期していないか． `useMemo` で派生値化できないか．
- [ ] 子コンポーネント内で「prop を初期値とする `useState` + prop 変化を拾う `useEffect`」の半制御構造になっていないか．親に state を上げて完全制御にできないか．
- [ ] 状態同期の打ち消しのために `suppress*Ref` / `skip*Ref` 等の escape-hatch を追加していないか．構造を平らにできないか．
- [ ] WAI-ARIA 属性の値が，対応する DOM 描画条件と一致しているか．対象は `aria-expanded` / `aria-controls` / `aria-selected` 等．
- [ ] 配列を扱うフィルタで `||` を使っていないか． `??` に置換できるか．
- [ ] UI 文言を変えたら， `grep -rn '<旧文言>' test src` で残存が 0 件か．
- [ ] 定数値（閾値・分数・回数等）を 2 箇所以上に直書きしていないか．
- [ ] `new SQL.Database()` の直前・直後で， `close()` の対応が取れているか．
- [ ] Enter key handler と onClick handler で，busy / validity ガードが対称か．
- [ ] フォーム全体の disabled 条件（submit 中 / 別の async 処理中）が派生値で束ねられているか．入力系・ボタン・子コンポーネントすべてで同値を参照しているか．
- [ ] `useMemo` で計算した値を別関数で再計算していないか．
- [ ] 存在判定・厳密一致判定（バリデーション目的）で `searchStops` を呼ぶ箇所がある．そこで `limit=100` を明示しているか．`undefined` プレースホルダを残していないか．
- [ ] ユーザー向けエラーメッセージ（生成関数・定数・直接記述）の全箇所で，句点有無・体言止め・敬体が揃っているか．

### テスト

- [ ] assertion がキーワード選言（`/foo|bar|baz/`）になっていないか．実装文言に沿った冒頭フレーズで固定しているか．
- [ ] 新規テストファイルは既存の `afterEach(cleanup)` パターンに揃っているか．
- [ ] ネストされた `beforeEach` が外側で作った `db` を上書きする場合，先頭で `db.close()` を呼んでいるか．
- [ ] Red ステップを必ず踏んだか（失敗出力を一度確認したか）．
- [ ] 選択済みフィールドに対する「`onSelect(null)` 不発火」の検証がある．`userEvent.type` ではなく初期マウント時点で assertion しているか．
- [ ] テスト名（`it` 文字列）と本体の操作・assertion が一致しているか．

### PR 作成

- [ ] Draft で作成しているか．
- [ ] `git push` のタイミングはユーザー指示を受けたあとか．
- [ ] PR 本文に Test plan が入っているか．
- [ ] Draft 作成前に，独立視点（a11y / 型安全 / デッドコード / テスト品質）で並列セルフレビューを回したか．
- [ ] workflow を触ったら，意図したイベントで検査が走ることを確認したか．
- [ ] reviewdog は CI を落とさない．緑でも lint summary の件数を読んだか．

---

## 今回の PR 固有の観点

本セクションは新規 PR の Draft 作成時に，その PR 固有のスコープ・制約・変更の意図を明文化するスクラッチ領域として再記入する．マージ済み PR の内容は，恒久化すべき観点のみ上記カテゴリに昇格させ，本セクションはクリアする運用とする．

### 記入テンプレート

- **タスク**：1 行で目的を記述（参照 Issue / 要望番号を含める）．
- **スコープ**：変更対象コンポーネント・モジュール名．対象外を明示する．
- **個別の注意**：型変更・契約変更・副作用・用語統一など，汎用カテゴリに昇格する前の固有論点．
- **実装前に確認したこと**：import 元の洗い出し，テスト assertion の updates 対象範囲など．

---

## 参照した過去 PR

| PR | タイトル | 主な指摘 |
|---|---|---|
| #92 | 通知タイミング入力のリフトアップ | Enter 経路の busy ガード，定数集約，再レンダ局所化 |
| #95 | `useNotifyBeforeMinutesInput` 配置変更 | `useState` 初期化子の undefined→defined トラップ，用語「発車」→「出発」揃え |
| #96 | 直通便で到達不能な組み合わせ除外 | クラスタ契約違反，`aria-expanded` 乖離，`useEffect` 同期排除，`??` vs `\|\|`，assertion の固定文字列化 |
| #97 | main ホットフィックス（文言追従）| UI 文言変更時の test grep スイープ漏れ |
| #98 | 経路登録 UX 改善（エラー・トースト・到達可能性の告知）| `searchStops` limit のバリデーション用途誤用，エラー文末の句点揺れ，テスト名と本体の乖離，`handleSearch` 中間状態の `onSelect(null)` 契約 |
| Issue #99 | `StopSearch` を完全制御コンポーネント化 | props→state 同期 `useEffect` の排除，`suppressNextSelectedSyncRef` escape-hatch の撤去，半制御 → 完全制御のテスト migration（`ControlledStopSearch` wrapper）|
| Issue #103 | 経路登録フォーム送信中の入力系無効化 | 派生値 `isFormLocked` によるフォーム全体 disabled の一本化，登録/更新ボタンの対称化，`StopSearch` の `disabled` prop 追加（disabled 化で listbox を閉じる）|
| #131 | Pull Request の検査を整え Biome の整形ドリフトを塞ぐ | workflow のトリガ範囲と検査範囲の乖離，検査の二重実行，移行用の抽象を畳み忘れ |

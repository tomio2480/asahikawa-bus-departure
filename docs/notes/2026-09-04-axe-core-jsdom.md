# 🧪 axe-core を jsdom で走らせて分かったこと

`axe-core` を Vitest のコンポーネントテストへ載せた際（Issue #164，PR #167）の記録．
`jsdom` には CSS と配置が無く，ブラウザとは違う見え方をする規則がある．
その扱いと，レビューで受けた指摘を実測で検証した手順をまとめる．

---

## 📚 目次

- [背景](#-背景)
- [判断](#-判断)
- [jsdom で規則がどう見えるか](#-jsdom-で規則がどう見えるか)
- [レビュー指摘を実測で検証する](#-レビュー指摘を実測で検証する)
- [代替案と棄却理由](#-代替案と棄却理由)
- [作業の進め方で得たこと](#-作業の進め方で得たこと)
- [参照](#-参照)

---

## 🧭 背景

Issue #134 で `ACCESSIBILITY.md` を新設し，準拠目標を WCAG 2.2 レベル AA と定めた．自動検出は Biome の `lint/a11y` だけであり，上位の手段として `axe-core` を Vitest 経由で載せる方針を書いた．本ノートはその実装で得た知見を扱う．

---

## ⚖ 判断

- `axe-core` を直接呼ぶ．`vitest-axe` は 0.1.0 で更新が止まり，Context7 にも登録が無い．`axe.run` の戻り値を 1 件 1 行の文字列へ畳む 20 行で足りた．
- 部品単体のテストでは `color-contrast` と `region` を外す．ページ単位（`App`）の検査だけ `region` を戻す．切り替えは `pageLevel: true` のオプションで行う．
- 違反は `toEqual([])` で固定する．文字列配列にしたのは，失敗時にそのまま規則名と対象が読めるようにするためである．

表 1. 部品単体のテストで外した規則と理由

| 規則 | 理由 | 補い方 |
|---|---|---|
| `color-contrast` | `jsdom` には配置と描画済みの CSS が無く判定できない | ブラウザの DevTools で確かめる（`ACCESSIBILITY.md`） |
| `region` | 部品単体の描画にはランドマークが無く，全部品で偽陽性になる | `App` のテストで `pageLevel: true` として検査する |

---

## 🔬 jsdom で規則がどう見えるか

実測で確かめた見え方を記す．いずれも `axe-core` 4.13.0 と `jsdom` 30 の組み合わせである．

- `display: none` の要素が可視として扱われる．Tailwind の `hidden` クラスは CSS が無いと効かない．`RouteTransfer` のファイル入力は，ブラウザでは対象外だが `jsdom` では `label` 違反になった．対処は `aria-label` を付けることとした．CSS の有無によらず正しく，実 DOM 上も損はない．
- `region` は `document.body` を文脈にしたときだけ発火する．`render` の `container`（`body` 直下の `div`）を渡した場合は発火しなかった．`RouteRegistration` のテストで `document.body` を渡したことで見つかった．
- `aria-live` を持つ要素は `region` 違反にならない．`axe-core` の `isRegion` は，`aria-live`（`polite` / `assertive`）を持つ要素をランドマークと同等に扱う．暗黙のライブリージョン役割（`alert` / `status` など）も同じ扱いである．トーストが `main` / `footer` の外にあっても通る．

---

## 🧾 レビュー指摘を実測で検証する

Codex の指摘はこうである．`ToastContainer` が `main` と `Footer` の後の兄弟にあり，トースト表示中の内容はランドマークに包まれない．`region` を無条件に外すと，この構造問題を見落とす．結論は，前提が `axe-core` の実装と食い違う，である．

検証の手順は 2 段階で行った．

1. `node_modules/axe-core/axe.js` の `isRegion` を読む．`aria-live` とライブリージョン役割をランドマークと同等に扱う分岐がある．
2. 使い捨てのテストで実測する．`header` / `main` / `footer` の外へ，`role="alert"` と `aria-live` を持つトーストを置く．`runOnly: ["region"]` で違反 0 件を確認する．同じ DOM でランドマーク外の素の `div` は違反 1 件になり，規則自体は働いている．

前提は退けたが，提案（ページ文脈では `region` を有効にできるようにする）は採り入れた．`pageLevel` オプションと `App` のページ単位テストがそれである．このテストが `RouteTransfer` の `label` 違反を拾った．指摘の前提が誤っていても，提案の形を試すと別の実在する問題に行き当たる．

前日の PR #163 でも同種のことがあった．`MapView.tsx` に ARIA 属性が無いことから「地図は配慮を持たない」と断じた．しかし Leaflet 1.9.4 は既定でコンテナをフォーカス可能にする．矢印と `+` / `-` による操作も備える．ズームボタンには `role` と `aria-label` が付く．コンポーネントの記述だけを見て，描画後の DOM を見ていなかった．

---

## 🗂 代替案と棄却理由

表 2. 検討した代替案と棄却理由

| 代替案 | 棄却理由 |
|---|---|
| `vitest-axe` を使う | 0.1.0 で更新が止まっている．ラッパーの価値が薄い |
| `region` を常に有効にする | 部品単体では全部品で偽陽性になる．`jest-axe` も既定で外している |
| `App.test.tsx` で `RouteTransfer` をモックする | 偽陽性を隠すだけで，実 DOM の名前の欠落は残る |
| テストへ CSS を注入して `display: none` を再現する | Tailwind のビルドをテストへ持ち込むことになり，重い |
| `aria-hidden` で隠す | CSS が効かない環境でフォーカス可能なまま支援技術から隠れる．`aria-label` の方が安全 |

---

## 🛠 作業の進め方で得たこと

- Windows の `npm install` はロックファイルから Linux 向けの `libc` / `inBundle` の記述を削る．78 行の無関係な差分が混ざった．`origin/main` へ戻し，追加パッケージのエントリだけを手で足し，`npm ci` で書き換えが起きないことを確かめた．処方は `docs/notes/2026-09-03-node-version-declaration.md` にある．
- `lint-md.sh` の終了コードを `| tail` へ流すと，指摘があってもコミットが通る．パイプの外で `$?` を取る．
- fake timers の配下で `axe.run` を呼ぶと，タイマー設定に依存する．当該テストだけ `vi.useRealTimers()` へ戻した．
- Codex は一時的に「An unknown error occurred」を 2 回返した．10 分置いて同じ依頼を投げると正常に応答した．即時の再試行は結果を変えない．

---

## 🔗 参照

- Issue #134・#164・#165，PR #163・#167
- `ACCESSIBILITY.md`（準拠目標と自動検出の方針）
- `test/a11y.ts`（`findA11yViolations`）
- axe-core `doc/API.md`（`axe.run` と `rules` オプション）
- `docs/notes/2026-09-03-node-version-declaration.md`（ロックファイルの手編集）

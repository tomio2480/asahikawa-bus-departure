# 📦 npm 追跡の開始直後に major 4 本が同時に届いた

[Issue #133][i133] で npm を Dependabot の追跡へ載せた直後，PR が 5 本届いた．内訳は minor/patch の束が 1 本と major が 4 本である．残すのは 3 点である．受領の順序，major の可否を決めた基準，そして CI の緑だけで済ませなかった理由である．

## 📚 目次

- [📥 届いたもの](#-届いたもの)
- [🔁 順序とコンフリクトの畳み方](#-順序とコンフリクトの畳み方)
- [🔬 major を通した判断](#-major-を通した判断)
- [🧪 CI の緑を根拠にしない](#-ci-の緑を根拠にしない)
- [⏸ 保留にしたもの](#-保留にしたもの)
- [💡 一般化できる教訓](#-一般化できる教訓)
- [🔗 参照](#-参照)

---

## 📥 届いたもの

追跡の設定は minor と patch を 1 本へ束ね，major だけ個別 PR として残す形である．初回はその設定どおりに分かれた．

表 1. 初回に届いた PR の内訳

| PR | 内容 | 種別 |
|---|---|---|
| #145 | 15 件の束（vite 8.0.7→8.2.2，react 19.2.8 ほか） | minor/patch |
| #146 | `@types/node` 25→26 | major |
| #147 | `@testing-library/jest-dom` 6→7 | major |
| #148 | `jsdom` 25→30 | major |
| #149 | `typescript` 5.9.3→7.0.2 | major |

追跡の枠は 5 本である．初回で枠が埋まった．処理しないかぎり次週以降の更新が起票されない．セキュリティ更新も同じ枠を使うため，滞留は放置できない．

---

## 🔁 順序とコンフリクトの畳み方

束の 1 本を先に通した．すると残る 4 本は `package-lock.json` で一斉にコンフリクトした．

ここで 1 本ずつリベースを頼むと，待ち時間が直列に積み上がる．4 本へ一括でリベースを依頼し，`CLEAN` となった順からマージした．

興味深いのは 2 本目以降である．#146 を通した後も #147・#148 はコンフリクトしなかった．束の 1 本が広い範囲を書き換えるのに対し，major 1 本の差分は狭い．最初の 1 本だけが衝突を生むと分かった．

---

## 🔬 major を通した判断

major は破壊的変更の精査を経てから通す．今回は 3 本を受け入れ，1 本を保留にした．

表 2. major 3 本の破壊的変更と，本リポジトリでの当たり方

| 更新 | 破壊的変更 | 当たり方 |
|---|---|---|
| `@types/node` 26 | Node 26 系の型定義へ | 利用は `node:fs`・`node:os`・`node:path` のみ |
| `jest-dom` 7 | `@testing-library/dom` が必須 peer へ | 推移的に解決済み．宣言は別途 [Issue #152][i152] で明示 |
| `jsdom` 30 | `element.click()` が `PointerEvent` を発火．CSSOM を全面刷新．Node の下限が上昇 | テストは `fireEvent`・`userEvent` 経由で `HTMLElement.click()` に触れない．`toHaveStyle`・`getComputedStyle` の使用は 0 件 |

大事なのは「破壊的変更の一覧」ではない．その変更が自分のコードのどこへ当たるかで決める．jsdom の CSSOM 刷新は大きな変更だが，スタイルを検査していなければ当たらない．一覧を読むだけでは可否は決まらない．

Node の下限だけは当たった．これは別の問題として [Issue #151][i151] へ切り出した．

---

## 🧪 CI の緑を根拠にしない

5 本とも CI は緑だった．それでもローカルで実測した．

- テスト 494 件が Windows・Node v22.20.0 で pass する．
- 開発サーバーが `/sql-wasm.wasm` を `200 / application/wasm` で返す．先頭 4 バイトは `00 61 73 6d` である．

2 つ目は [Issue #132][i132] の回帰確認である．vite のマイナーが 2 つ上がったため，`public/` の走査時期が変わっていないかを実物で確かめた．CHANGELOG に該当の記載は無かったが，記載が無いことは挙動が同じであることの証明にならない．

---

## ⏸ 保留にしたもの

`typescript` 7.0.2 は保留とした．TypeScript 7 は Go による再実装版であり，バージョン番号の 1 つ飛びが示す以上に中身が変わる．

CI は通る．ただし通ることは「型エラーの検出範囲が同じ」ことを意味しない．検出が緩くなっていれば，緑は品質の証明にならない．精査を [Issue #150][i150] へ切り出し，PR は開いたまま残した．

---

## 💡 一般化できる教訓

- 追跡の枠が埋まると，次の更新が起票されない．滞留そのものが不具合の入口となる．
- 束の 1 本を先に通し，残りへ一括でリベースを頼む．衝突するのは最初の 1 本だけである．
- major の可否は，破壊的変更の一覧ではなく自分のコードへの当たり方で決める．
- 処理系そのものが変わる更新は，他の更新と同じ流れへ載せない．切り分けの手数が増える．

---

## 🔗 参照

- [Issue #133][i133] / [PR #144][p144]: npm を Dependabot の追跡へ載せた
- [PR #145][p145] / [PR #146][p146] / [PR #147][p147] / [PR #148][p148]: 今回マージした 4 本
- [PR #149][p149] / [Issue #150][i150]: TypeScript 7 の保留
- [Issue #151][i151] / [Issue #152][i152]: 精査の副産物として起票した 2 件
- [2026-09-03-node-version-declaration.md](2026-09-03-node-version-declaration.md): 上記 2 件の対応

[i132]: https://github.com/tomio2480/asahikawa-bus-departure/issues/132
[i133]: https://github.com/tomio2480/asahikawa-bus-departure/issues/133
[i150]: https://github.com/tomio2480/asahikawa-bus-departure/issues/150
[i151]: https://github.com/tomio2480/asahikawa-bus-departure/issues/151
[i152]: https://github.com/tomio2480/asahikawa-bus-departure/issues/152
[p144]: https://github.com/tomio2480/asahikawa-bus-departure/pull/144
[p145]: https://github.com/tomio2480/asahikawa-bus-departure/pull/145
[p146]: https://github.com/tomio2480/asahikawa-bus-departure/pull/146
[p147]: https://github.com/tomio2480/asahikawa-bus-departure/pull/147
[p148]: https://github.com/tomio2480/asahikawa-bus-departure/pull/148
[p149]: https://github.com/tomio2480/asahikawa-bus-departure/pull/149

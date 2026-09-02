# 📦 npm の依存を Dependabot の追跡へ載せた

`.github/dependabot.yml` は `github-actions` だけを対象にしていた．`package.json` の 25 件は更新の通知を受けていない．本書には `npm` を足すにあたっての判断を残す．扱うのは PR の本数を抑える方法と，`@biomejs/biome` の major への構えである．

## 📚 目次

- [🕳 追跡から漏れていた範囲](#-追跡から漏れていた範囲)
- [🧩 束ね方の選択](#-束ね方の選択)
- [🚧 Biome の major を外した理由](#-biome-の-major-を外した理由)
- [🧭 採らなかった案](#-採らなかった案)
- [👀 これから確かめること](#-これから確かめること)
- [🔗 参照](#-参照)

---

## 🕳 追跡から漏れていた範囲

元の設定は `github-actions` の 1 件だけである．本番依存 6 件と開発依存 19 件は，どれも更新の通知を受けていなかった．

気づいた場所は [PR #131][p131] である．`@biomejs/biome` を `1.9.4` へ完全固定した．固定した以上，更新を提案する経路が要る．その経路が無いまま残っていた．

セキュリティの更新は Dependabot alerts が別に拾う．ここで扱うのは version updates である．

---

## 🧩 束ね方の選択

25 件へ一斉に PR が立つと，受領が追いつかない．束ね方の候補を表 1 に示す．

表 1. 束ね方の候補と受領の手間

| 候補 | 週あたりの本数 | 破壊的変更の見分け |
|---|---|---|
| 束ねない | 最大 25 | 個別に分かる |
| 用途別に束ねる | 3〜5 | major が混ざる |
| minor と patch を束ねる | 1 ＋ major の件数 | major が独立する |

採ったのは 3 番目である．平時は 1 本で済み，注意して読むべき major だけが独立して立つ．

`groups` は `patterns` を省略すると全依存を対象にする．`dependabot-core` の `DependencyGroup#matches_pattern?` が，未指定のとき `true` を返すためである．`update-types` を `minor` と `patch` に絞れば，major はグループから外れて個別の PR になる．

`open-pull-requests-limit` は `5` とした．既存の `github-actions` と揃えている．

---

## 🚧 Biome の major を外した理由

`2.x` は設定スキーマとルールが変わる．`biome migrate` による移行が要る．そのまま PR を受けると，`ci.yml` の `biome check .` が一斉に落ちる．準備のない移行作業が突然降ってくる形になる．

そこで `ignore` へ `version-update:semver-major` を置いた．`minor` と `patch` の提案は従来どおり届く．`2.x` への移行は，別に Issue を立てて計画的に進める．

なお `package.json` で完全固定していても，Dependabot は更新の PR を出す．固定は範囲の宣言であり，追跡の停止ではない．

---

## 🧭 採らなかった案

`commit-message` の `prefix` は指定しない．既定で `chore(deps):` と `chore(deps-dev):` が付く．リポジトリの Conventional Commits と既に揃っている．実績は [PR #107][p107] から [PR #110][p110] までにある．

`interval` を `daily` にはしない．個人開発の受領の速さに合わない．

`dependency-type` で本番と開発を分ける案も採らない．本数が倍になるだけで，読むときの判断は変わらない．

---

## 👀 これから確かめること

判断の妥当性は，最初の週次実行で分かる．見る点は 3 つである．

- 束ねた PR が 1 本に収まるか
- major が個別に立つか
- major を持つ依存が多く，`open-pull-requests-limit` の `5` に当たらないか

上限に当たった場合は，値を上げるか `ignore` を足すかを判断する．

### 確かめた結果

初回の実行で 5 本が届き，上限にちょうど当たった．束は 1 本に収まり，major 4 本は個別に立った．設計どおりである．

上限の値は変えていない．4 本を処理して枠を空ける方を選んだ．経緯は [2026-09-03-dependabot-npm-first-batch.md](2026-09-03-dependabot-npm-first-batch.md) を参照．

---

## 🔗 参照

- [Issue #133][i133]
- [PR #131][p131]
- [`dependabot-core` の `DependencyGroup`][dg]

[i133]: https://github.com/tomio2480/asahikawa-bus-departure/issues/133
[p107]: https://github.com/tomio2480/asahikawa-bus-departure/pull/107
[p110]: https://github.com/tomio2480/asahikawa-bus-departure/pull/110
[p131]: https://github.com/tomio2480/asahikawa-bus-departure/pull/131
[dg]: https://github.com/dependabot/dependabot-core/blob/main/common/lib/dependabot/dependency_group.rb

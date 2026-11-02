# 🔢 Node 24 への移行とランナーのキャッシュ

2026 年 10 月の Node.js セキュリティリリースを機に，開発と CI を 24 系へ上げた．
その過程で，`.nvmrc` のメジャー版指定が最新のパッチへ解決されない場面を観測した．
残すのは 2 点である．`engines` の下限の決め方と，ランナーのキャッシュによる版のずれである．

## 📚 目次

- [🚨 発端](#-発端)
- [📐 engines の下限は jsdom の要求に合わせる](#-engines-の下限は-jsdom-の要求に合わせる)
- [🗄 メジャー版指定はキャッシュの版へ解決される](#-メジャー版指定はキャッシュの版へ解決される)
- [💡 一般化できる教訓](#-一般化できる教訓)
- [🔗 参照](#-参照)

---

## 🚨 発端

2026 年 10 月 21 日，Node.js が 22・24・26 系の修正版を出した．
手元の開発環境は，現行の Active LTS である v24.22.1 へ上げた．
`engines.node` が `^22.22.2` のままでは，`npm ci` が `EBADENGINE` を警告する．
そこで `.nvmrc` と `engines` を 24 系へ移した．

## 📐 engines の下限は jsdom の要求に合わせる

最初は下限を修正版の `^24.22.1` とした．CI は通ったが，ログに警告が出た．

```text
npm warn EBADENGINE   package: 'asahikawa-bus-departure@0.0.0',
npm warn EBADENGINE   required: { node: '^24.22.1' },
```

CI の Node は 24.21.0 であり，下限を満たしていなかった．
22 系の下限 22.22.2 は，もともと jsdom 30 の要求範囲から取った値である．
24 系でも同じ根拠に戻し，jsdom が求める `^24.15.0` を下限とした．

`engines` は `npm ci` を止めない．警告を出すだけである．
修正版を強制する手段にはならないため，下限は動作要件だけを表す．

## 🗄 メジャー版指定はキャッシュの版へ解決される

`actions/setup-node` は `.nvmrc` の `24` を，ランナーにキャッシュ済みの版で満たす．
今回のログでは次のとおり解決された．

```text
Resolved .nvmrc as 24
Found in cache @ /opt/hostedtoolcache/node/24.21.0/x64
```

修正版の 24.22.1 は公開済みだったが，ランナーのイメージへはまだ入っていなかった．
`check-latest` を付けない限り，配布元の最新は確認しない．
イメージの更新後は，同じ指定のまま新しい版へ切り替わる．

前回のノートは「22 系の最新へ解決される」と書いた．正確には「キャッシュにある 22 系」である．

## 💡 一般化できる教訓

- メジャー版の指定は，その時点の最新パッチを保証しない．
  セキュリティリリースの直後は，数日ほど古いパッチで CI が動く．
- 修正版で動かす必要があれば，`setup-node` に `check-latest: true` を付ける．
  代わりに，毎回配布元へ問い合わせる分の時間がかかる．
- `engines` の下限は動作要件を表す値に限る．
  修正版の版番号を入れると，キャッシュの古い版で警告が出続ける．

## 🔗 参照

- [Node.js October 2026 Security Releases](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)
- [actions/setup-node の check-latest](https://github.com/actions/setup-node#check-latest-version)
- [🔒 Node の版宣言を 1 か所へ寄せた](2026-09-03-node-version-declaration.md)
- PR #195: 開発と CI の Node.js を 24 系へ上げる

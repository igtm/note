# Pencil Note

Solid + Vite で作った、自分用の自由キャンバス型ノートアプリです。

## Development

```bash
pnpm install
pnpm dev
```

LAN 内の一時共有キャンバスを使う場合:

```bash
pnpm share
```

表示された `LAN URL` を同じネットワーク内の端末で開き、アプリ内の `Local net share` タブへ切り替えます。

## Features

- ノート、テキストフレーム、四角、丸、ダイヤ形をキャンバスに配置
- Selection モードでクリック選択、空いている場所のドラッグで範囲選択
- 複数選択した要素をまとめてドラッグ移動
- 単一選択時は右下の丸いハンドルでリサイズ
- Pan モード、またはトラックパッド/ホイールでキャンバス移動
- `Ctrl`/`Cmd` + ホイール、または右下のボタンで拡大縮小
- ダブルクリックでテキスト編集
- 上部メニューは中央の小さいアイコン帯で表示
- 箇条書きは `- ` とインデントでネストでき、`Tab` / `Shift + Tab` で段下げ/段上げ
- テキストが要素の高さを超えたら自動で縦に伸び、内部スクロールしない
- `localStorage` に自動保存され、ブラウザを閉じても前回の内容を復元
- `Local net share` タブでは同一 LAN の閲覧者同士だけで同期し、`localStorage` には保存しない
- 表示時はネスト箇条書きだけを独自レンダー

## Shortcuts

- `V`: 選択
- `H`: パン
- `T`: テキストフレーム
- `N`: ノート
- `R`: 四角
- `O`: 丸
- `D`: ダイヤ形
- `Tab` / `Shift + Tab`: 編集中のリストをインデント/アウトデント
- `Delete` / `Backspace`: 選択中の要素を削除
- `Ctrl`/`Cmd` + `D`: 複製
- `+` / `-`: 拡大縮小
- `0`: 表示位置をリセット
- `Esc`: 編集/選択解除

## GitHub Pages

`main` に push すると `.github/workflows/deploy-pages.yml` が `pnpm build` を実行し、`dist` を GitHub Pages にデプロイします。

初回だけ、GitHub リポジトリの Settings > Pages で Source を `GitHub Actions` にしておく必要があります。

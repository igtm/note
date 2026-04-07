# Pencil Note

Solid + Vite で作った、自分用の自由キャンバス型ノートアプリです。

## Development

```bash
pnpm install
pnpm dev
```

## Features

- ノート、テキストフレーム、四角、丸、ダイヤ形をキャンバスに配置
- Selection モードでクリック選択、空いている場所のドラッグで範囲選択
- 複数選択した要素をまとめてドラッグ移動
- 単一選択時は右下の丸いハンドルでリサイズ
- Pan モード、またはトラックパッド/ホイールでキャンバス移動
- `Ctrl`/`Cmd` + ホイール、または右下のボタンで拡大縮小
- ダブルクリックでテキスト編集
- `localStorage` に自動保存され、ブラウザを閉じても前回の内容を復元
- `- `、`1. `、`# `、`- [ ]`、`**bold**`、`*italic*`、`` `code` ``、`> quote` の簡易フォーマット

## Shortcuts

- `V`: 選択
- `H`: パン
- `T`: テキストフレーム
- `N`: ノート
- `R`: 四角
- `O`: 丸
- `D`: ダイヤ形
- `Delete` / `Backspace`: 選択中の要素を削除
- `Ctrl`/`Cmd` + `D`: 複製
- `+` / `-`: 拡大縮小
- `0`: 表示位置をリセット
- `Esc`: 編集/選択解除

## GitHub Pages

`main` に push すると `.github/workflows/deploy-pages.yml` が `pnpm build` を実行し、`dist` を GitHub Pages にデプロイします。

初回だけ、GitHub リポジトリの Settings > Pages で Source を `GitHub Actions` にしておく必要があります。

# Pencil Note

Solid + Vite で作った、自分用の自由キャンバス型ノートアプリです。

## Development

```bash
pnpm install
pnpm dev
```

## Agent Skills

このリポジトリには `note-web` skill が含まれています。追加するには:

```bash
npx skills add https://github.com/igtm/note
```

この skill は `.note` 形式、キャンバス item の構造、テキストやチャートを AI から組み立てる方法を説明します。

## Features

- ノート、テキストフレーム、四角、丸、ダイヤ形、自由描画ストロークをキャンバスに配置
- `Pencil` モードで自由に描ける
- `Eraser` モードでドラッグした箇所のストロークを削り、図形やテキスト要素も消せる
- テキストフレームはカード背景なしで、テキストだけを置く透明な入力エリア
- Selection モードでクリック選択、空いている場所のドラッグで範囲選択
- 複数選択した要素をまとめてドラッグ移動
- 単一選択時は右下の丸いハンドルでリサイズ (`path` を除く)
- Pan モード、またはトラックパッド/ホイールでキャンバス移動
- `Ctrl`/`Cmd` + ホイール、または右下のボタンで拡大縮小
- ダブルクリックでテキスト編集
- 上部メニューは中央の小さいアイコン帯で表示
- TipTap ベースの同一 DOM で編集/非編集を切り替えるので、フォーカスを外しても文字サイズや行間が変わらない
- 図形の初期スタイルは黒い枠線 + 透明背景
- 左側の設定カードから `stroke` / `background` / `stroke width` / `stroke style` / `font family` / `font size` / `text align` を離散的に切り替えられる
- 箇条書きは `- `、番号付き、`- [ ]` タスクを扱え、`Tab` / `Shift + Tab` でネスト変更できる
- テキストが要素の高さを超えたら自動で縦に伸びる
- `localStorage` に自動保存され、ブラウザを閉じても前回の内容を復元
- 旧 `text: string` 保存形式は自動で TipTap JSON に移行する

## Shortcuts

- `V`: 選択
- `H`: パン
- `P`: 鉛筆
- `E`: 消しゴム
- `T`: テキストフレーム
- `N`: ノート
- `R`: 四角
- `O`: 丸
- `D`: ダイヤ形
- `Tab` / `Shift + Tab`: 編集中のリストをインデント/アウトデント
- `Ctrl`/`Cmd` + `Z`: 元に戻す
- `Ctrl`/`Cmd` + `Shift` + `Z`、または `Ctrl`/`Cmd` + `Y`: やり直す
- `Delete` / `Backspace`: 選択中の要素を削除
- `Ctrl`/`Cmd` + `D`: 複製
- `+` / `-`: 拡大縮小
- `0`: 表示位置をリセット
- `Esc`: 編集/選択解除

## GitHub Pages

`main` に push すると `.github/workflows/deploy-pages.yml` が `pnpm build` を実行し、`dist` を GitHub Pages にデプロイします。

初回だけ、GitHub リポジトリの Settings > Pages で Source を `GitHub Actions` にしておく必要があります。

---
name: note-web
description: Use when generating, editing, or explaining `.note` files for the Pencil Note web app, including creating canvas text, diagrams, charts, and other scene content that should open in the app.
---

# Note Web

Pencil Note の `.note` ファイルを直接生成・編集するときに使う。

`.note` は JSON で、実体は `SavedNotebook` です。

## Format

トップレベル:

```json
{
  "items": [],
  "view": { "x": 180, "y": 120, "zoom": 1 }
}
```

- `items`: キャンバス要素の配列
- `view`: 初期表示位置

要素共通フィールド:

```json
{
  "id": "unique-string",
  "type": "text | note | rect | ellipse | diamond | path | image",
  "x": 0,
  "y": 0,
  "w": 320,
  "h": 120,
  "color": "transparent",
  "stroke": "#1f1f1f",
  "strokeWidth": "thin | medium | bold",
  "strokeStyle": "solid | dashed | dotted",
  "fontFamily": "hand | sans | mono",
  "fontSize": "sm | md | lg",
  "textAlign": "left | center | right"
}
```

追加フィールド:

- `text`, `note`, `rect`, `ellipse`, `diamond`: `content`
- `path`: `points`
- `image`: `src`, optional `mimeType`, `name`

## Text

テキスト系要素の `content` は TipTap JSON:

```json
{
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": [{ "type": "text", "text": "Hello" }]
    }
  ]
}
```

複数段落、箇条書き、番号付き、タスクリストも入れられる。単純な見出しや本文なら `paragraph` だけで十分。

実務上の指針:

- タイトルやラベルは `text`
- 付箋風のカードは `note`
- 図形の中に文字を置きたいときは `rect` / `ellipse` / `diamond` に `content`

## Paths

`path.points` は要素ローカル座標です。`x`,`y`,`w`,`h` はパス全体の外枠で、各 point はその枠の中に置く。

```json
{
  "id": "line-1",
  "type": "path",
  "x": 100,
  "y": 80,
  "w": 220,
  "h": 140,
  "points": [
    { "x": 12, "y": 120 },
    { "x": 80, "y": 70 },
    { "x": 150, "y": 90 },
    { "x": 208, "y": 24 }
  ],
  "color": "transparent",
  "stroke": "#4e6c88",
  "strokeWidth": "medium",
  "strokeStyle": "solid",
  "fontFamily": "hand",
  "fontSize": "md",
  "textAlign": "left"
}
```

手書き風の自由線以外では、`path` より `rect` / `ellipse` / `text` を優先した方が作りやすい。

## Charts

グラフは専用 chart type ではなく、通常要素の組み合わせで作る。

基本パターン:

1. タイトル: `text`
2. 軸ラベル: `text`
3. 棒: `rect`
4. 折れ線: `path`
5. データ点: `ellipse`
6. 値ラベル: `text`

棒グラフの作り方:

- まずグラフ全体の左上原点を決める
- X 軸/Y 軸は `path` か細い `rect`
- 各 bar は `rect` を並べる
- bar の下にカテゴリ名、上に数値を `text` で置く

折れ線グラフの作り方:

- 線本体は 1 本の `path`
- 各点は小さい `ellipse`
- 軸・凡例・タイトルは `text` と `path`

迷ったときの方針:

- まっすぐな線や箱は `rect`
- ラベルは `text`
- 手書き感のある線だけ `path`
- 余白は広めに取る

## Images

`image.src` は data URL を入れる。外部 URL 前提ではない。

## Practical Workflow

新規生成:

1. `view` は `{ "x": 180, "y": 120, "zoom": 1 }` から始める
2. `items` を上から視覚順ではなく、編集しやすい単位で並べる
3. `id` は一意なら何でもよい
4. 完成した JSON を `.note` として保存してアプリから `Open`

既存編集:

1. 既存 `.note` を JSON として読む
2. 触らない item はそのまま残す
3. 追加 item だけ新しい `id` を振る
4. 破損を避けるため、最終形は `SavedNotebook` 構造を守る

## Minimal Example

```json
{
  "items": [
    {
      "id": "title",
      "type": "text",
      "x": 60,
      "y": 40,
      "w": 360,
      "h": 80,
      "content": {
        "type": "doc",
        "content": [
          {
            "type": "paragraph",
            "content": [{ "type": "text", "text": "Monthly Revenue" }]
          }
        ]
      },
      "color": "transparent",
      "stroke": "transparent",
      "strokeWidth": "thin",
      "strokeStyle": "solid",
      "fontFamily": "sans",
      "fontSize": "lg",
      "textAlign": "left"
    },
    {
      "id": "bar-a",
      "type": "rect",
      "x": 90,
      "y": 220,
      "w": 72,
      "h": 140,
      "content": { "type": "doc", "content": [{ "type": "paragraph" }] },
      "color": "#ffe3df",
      "stroke": "#594734",
      "strokeWidth": "thin",
      "strokeStyle": "solid",
      "fontFamily": "hand",
      "fontSize": "md",
      "textAlign": "center"
    }
  ],
  "view": { "x": 180, "y": 120, "zoom": 1 }
}
```

この skill を使うときは、「どんな画面を作りたいか」を items に落とし込む。テキストは `content`、図表は `rect` / `ellipse` / `path` / `text` の組み合わせで表現する。

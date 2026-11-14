# PROCESSHOT 告知動画

- `out/processhot_reel_32s.mp4` … リール用（9:16・1080×1920・30fps・32秒・無音）
- `out/processhot_stories_15s.mp4` … ストーリーズ用短縮版（15秒・無音）
- `out/processhot_cover.png` … カバー画像（1080×1920、中央にタイトル）
- `photos/` … 架空のコーヒー写真（AI生成。実在の店・商品ではない）
- `cap/` … 本番サイト https://processhot.com を iPhone エミュレーションで実際に操作して取得した各画面と、サイトが出力した完成画像（`final.jpg`）
- `work/` … 動画の元（`video.html` をフレーム単位で描画 → ffmpeg）

発酵動画プロジェクトの規定（④クリエイター）に合わせ、音声なしで納品（BGMは投稿時にアプリ内音源から選ぶ）、日本語テロップ＋小さい英語、@hakko.3d の透かしを全尺に入れている。

フォントはサイトと同じ Inter Tight（サイト配信の woff2）と Noto Sans JP（サイトのフォント指定に含まれる）のみ。色もサイトの4色（墨・紙・灰・朱）のみ。

## 作り直す

```
# fonts/NotoSansJP.ttf に Noto Sans JP（可変フォント）を置く
cd work
node capture.js          # サイトを操作して cap/ を作り直す
node mkdata.js
node render.js reel  ../out/processhot_reel_32s.mp4
node render.js story ../out/processhot_stories_15s.mp4
```

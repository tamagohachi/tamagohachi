# コーヒー記録MVP

飲んだコーヒーの写真に、精製プロセスを重ねたシェア画像をつくる静的サイト。

- `site/` … 公開されるファイル一式（ビルド不要）
- `docs/design-v1.md` … 設計書
- `wrangler.jsonc` … Cloudflare Workers（静的アセット）で `site/` を公開する設定

## 公開

Cloudflare の Git 連携で、本番ブランチへの push ごとに自動デプロイされる。
デプロイコマンドは `npx wrangler deploy`、ビルドコマンドはなし。

## 手元で確認

    cd site && python3 -m http.server 8000

# リリースチェックリスト

## マージ前

- 重要な変更に対応するIssueがマイルストーンに登録されている
- Pull Requestにリスク、ロールバック方法、検証内容が記載されている
- CI、CodeQL、Dependency Review、Vercel Previewが成功している
- 独立したデータベースブランチへマイグレーションを適用済みである
- 実在する個人情報を使わずにブラウザフローが通過する

## Production候補

- Production環境に`DATABASE_URL`、`DIRECT_URL`、`SESSION_PEPPER`、`CRON_SECRET`、`PUBLIC_APP_URL`が設定されている
- ProductionのSecretがPreview・Localと異なり、リポジトリへ保存されていない
- アプリケーションが新しいスキーマを使う前に`prisma migrate deploy`が成功する
- ヘルスチェック、デモ発行、役割切り替え、日程変更、通知配信、監査画面のProduction Smoke Testが通過する
- ブラウザでSecurity HeaderとSecure Cookie属性を確認している

## 公開

- 保護された`main`ブランチへPull Request経由でマージする
- レビュー済みの正確なコミットへ`v1.0.0`タグを付ける
- CHANGELOGからRelease Noteを作成し、公開デモへのリンクを掲載する
- 最初のMaintenance Intervalが終わるまでデプロイとFunctionsログを監視する
- タグ付きProductionデプロイの正常性を確認してからマイルストーンを閉じる

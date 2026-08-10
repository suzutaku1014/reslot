# ReSlot

予約の日程変更を題材に、業務アプリで必要になる権限分離、整合性、非同期処理、監査を一つのフローで実装したオープンソースのリファレンスアプリです。

利用者が候補日時を申請し、担当者が承認または却下します。管理者は通知の配信状態と追記専用の監査履歴を確認できます。

公開デモは架空データだけを使う、登録不要の環境です。作成されたデモ用ワークスペースは1時間で失効します。実在する氏名、メールアドレス、決済情報、認証情報は収集しません。

## デモ

[公開デモを開く](https://reslot-eight.vercel.app)

1. 「デモをはじめる」を選択
2. 利用者として予約の候補日時を申請
3. 担当者へ切り替えて候補を承認または却下
4. 管理者へ切り替えて通知キューと監査履歴を確認

入力には架空の内容だけを使用してください。

## 実装の見どころ

- 利用者・担当者・管理者の役割とデータ範囲をサーバー側で検証
- 日程変更、候補確定、監査記録、通知キュー追加をトランザクションで処理
- Idempotency Keyとバージョン比較による二重送信・古い画面からの更新対策
- PostgreSQLの排他制約による予約時間の重複防止
- Transactional Outboxによる、業務更新と通知処理の分離
- 通知失敗の記録、再試行、Dead Letter状態の可視化
- 有効期限付きデモセッション、操作回数制限、自動削除
- 実PostgreSQLを使った競合テストとブラウザE2E

## 役割

| 役割 | 操作 |
| --- | --- |
| 利用者 | 予約の確認、1〜3件の候補日時を指定した日程変更申請 |
| 担当者 | 自分に割り当てられた申請の確認、候補の承認または却下 |
| 管理者 | 申請数、通知キュー、再試行、監査イベントの確認 |

## 技術構成

| 領域 | 採用技術 |
| --- | --- |
| Web | Next.js 16 / React 19 / TypeScript |
| API | Hono / Zod OpenAPI |
| Database | PostgreSQL / Prisma 7 / Neon |
| Test | Vitest / Testing Library / Playwright |
| CI・運用 | GitHub Actions / CodeQL / Vercel / Vercel Cron |

ブラウザからデータベースへ直接接続しないモジュラーモノリス構成です。Next.jsとHonoを同じデプロイ単位に置き、ドメインサービスとAPI契約を共有しています。v1では外部の認証・メッセージ配信サービスを必要としません。

## ローカル起動

必要な環境はNode.js 22以上、pnpm 11、PostgreSQL 17です。

`.env.example`に記載された変数名をローカル環境へ設定し、`DATABASE_URL`、`DATABASE_URL_UNPOOLED`、`DIRECT_URL`は破棄可能なローカルデータベースへ接続してください。秘密情報をリポジトリへコミットしないでください。

```bash
pnpm install
pnpm db:deploy
pnpm dev
```

`http://localhost:3000`を開くとデモを実行できます。

## 検証

```bash
pnpm lint
pnpm type-check
pnpm test
pnpm test:integration
pnpm build
pnpm test:e2e
```

CIでは使い捨てのPostgreSQL 17を起動し、マイグレーション、静的検査、単体テスト、統合テスト、ビルド、ブラウザE2Eを実行します。

## 設計資料

- [プロダクト概要](docs/product-brief.md)
- [アーキテクチャ](docs/architecture.md)
- [脅威モデル](docs/threat-model.md)
- [テスト戦略](docs/testing.md)
- [運用手順](docs/operations.md)
- [リリースチェックリスト](docs/release-checklist.md)
- [AI支援開発について](AI_USAGE.md)
- [セキュリティポリシー](SECURITY.md)
- [コントリビューションガイド](CONTRIBUTING.md)

リリース作業は[v1.0.0マイルストーン](https://github.com/suzutaku1014/reslot/milestone/1)で追跡しています。

## ライセンス

[MIT License](LICENSE)

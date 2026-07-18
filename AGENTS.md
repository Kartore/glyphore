# AGENTS.md — glyphore 開発エージェント向け規約

## 必読

作業前に必ず読むこと:

1. [docs/plan.md](docs/plan.md) — 設計計画の正。**「実データ検証結果」と「ハマりどころ」は特に重要**
2. 発注された Phase の作業指示書 (docs/phase*-*.md)
3. `spike/` — Phase 0 の実証コード。**参照専用 (変更禁止)**

姉妹プロジェクト [spritore](https://github.com/Kartore/spritore) と同じ流儀で開発する。

## このプロジェクトの絶対律: バイト決定論 + fontnik 互換

- 同一入力 → 同一出力バイトを全プラットフォーム (native / wasm / Node) で保証する
- `glyphore-core` に **fs / 時刻 / 乱数 / 環境変数 / wasm-bindgen / clap を持ち込まない**
- **HashMap / HashSet の列挙順に依存しない**。BTreeMap / BTreeSet か明示ソート
- SDF パラメータ (24px / buffer 3 / radius 8 / cutoff 0.25) とメトリクス計算は
  node-fontnik (sdf-glyph-foundry) 互換が正。**理屈より実 PBF との diff を信じる**
- `left` / `top` は PBF 上 **svarint (zigzag)**。負値のテストを必ず持つ
- 依存 crate は作業指示書に列挙されたもの以外追加しない (必要なら理由を添えて報告)

## コーディング規約

- rustfmt (rustfmt.toml、ハードタブ)。`cargo fmt --check` が通ること
- `cargo clippy --workspace -- -D warnings` が通ること
- 公開 API には doc コメント (英語)。実装内コメントは日本語で良い
- コミットメッセージは `feat:` / `fix:` / `test:` / `docs:` プレフィックス

## 触ってはいけないもの

- `spike/` (参照専用)、`rust-toolchain.toml`、`Cargo.toml` の `[profile.release]`
- `npm/glyphore/` は該当 Phase の作業指示書の範囲でのみ変更する
- `.codex/` などエージェント環境の副産物をコミットしない

## 検証コマンド

```
cargo fmt --check
cargo clippy --workspace -- -D warnings
cargo test --workspace
```

# Env-Vibration

`A_Environmental_Vibration`（C# Windows Forms）の分析ロジックを、GitHub Pages で動作する Web アプリへ移植したプロジェクトです。

## 実装範囲
- 1列数値ファイル（CSV/TXT）の読み込み
- 水平 / 鉛直（住宅・事務所）切替
- 定常 / 非定常解析切替
- Akima補間による `100Hz -> 200Hz` 再サンプリング
- FFT / 1/3オクターブ / 振動レベル時刻歴の計算
- 評価図（基準線含む）表示
- ドラッグ範囲選択による部分解析
- 結果CSV出力（1/3オクターブ + FFT + 振動レベル時刻歴）

## 技術スタック
- React + TypeScript + Vite
- Plotly.js（basic bundle）
- Vitest

## 開発コマンド
```bash
npm install
npm run dev
npm run test:run
npm run build
```

## Windows ローカルビルド注意点
- 作業パスに日本語や括弧を含む場合、`vite build` が `EXIT:-1073740791` で異常終了する環境があります（GitHub Actions / ASCIIパスでは再現しないことを確認）。
- その場合は、ASCIIのみの一時ディレクトリへコピーして `npm run build` を実行してください。

## ディレクトリ構成
```text
src/
  core/
    analysis.ts        # C#移植のコア計算
    iso2631.ts         # ISO 2631-1 振動レベル計算
    fft.ts             # FFT/逆FFT
    akima.ts           # Akima補間
    guidelines.ts      # 評価基準線
    csv.ts             # 入出力フォーマット
  App.tsx              # UI
```

## GitHub Pages 配備
- `.github/workflows/deploy.yml` で Pages にデプロイ
- `vite.config.ts` は `VITE_BASE_PATH` または `GITHUB_REPOSITORY` から `base` を自動決定

## 互換性メモ
- `ttt.csv`（鉛直・定常）は高一致を確認済み（テストで検証）
- `yyy.csv`（鉛直・非定常）は旧実装との差が大きく、現行テストでは「有限値維持 + 緩い近似」チェックにしています

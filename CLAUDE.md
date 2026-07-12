# metronome-app

React + TypeScript + Vite 製のメトロノーム Web アプリ。GitHub Pages で公開中。
ユーザーは **iPhone 16 の Safari** を主な実行環境としてテストする。会話・コミットメッセージは日本語。

- 公開URL: https://yshasegawa.github.io/metronome-app/
- リポジトリ: https://github.com/yshasegawa/metronome-app

## コード構成

| ファイル | 役割 |
|---|---|
| [src/hooks/useMetronome.ts](src/hooks/useMetronome.ts) | 全ロジック（音のスケジューリング・BPM・タイマー・自動BPM・永続化）。**変更のほとんどはここ** |
| [src/App.tsx](src/App.tsx) | メインUI（BPM表示・スライダー・±ボタン・再生/停止） |
| [src/components/](src/components/) | BeatDisplay（拍の丸）、TimerPanel（練習タイマー）、AutoBpmPanel（BPM自動増加） |

Tailwind CSS v4 使用。モバイル（sm未満）はコンパクト、`sm:` 以上で通常サイズのレスポンシブ。
BPM表示からタイマーまで iPhone の1画面（375×812）に収まることを維持すること。

## 定型ワークフロー

### 変更 → 検証 → デプロイ（このプロジェクトの基本サイクル）

```bash
npm run build   # tsc -b && vite build（型チェック込み）
npm run lint    # eslint
```

1. コード変更後、`npm run build` と `npm run lint` を実行
2. プレビューサーバー（launch.json の `metronome`、port 5173）で動作確認
   - 音そのものは聞けないため、拍インジケーター（`.bg-violet-400, .bg-slate-300` が点灯）と
     コンソールエラーの有無で判定する
3. ユーザーが「反映して」と言ったら: コミット → `git push origin main` →
   GitHub Actions（deploy.yml）が自動デプロイ
4. デプロイ確認:
   ```bash
   gh run watch $(gh run list --limit 1 --json databaseId --jq '.[0].databaseId') --exit-status
   curl -s https://yshasegawa.github.io/metronome-app/ | grep -o 'assets/index-[^"]*\.js'
   ```
   curl で得たバンドルのハッシュがローカルビルド（dist/assets/）と一致すれば反映完了。
   ユーザーへは反映済みのハッシュ名を添えて報告し、**iPhone側はタブの再読み込みが必要**な旨を伝える

### 検証時の既知の落とし穴（バグと誤認しないこと）

- **HMR中の "Rules of Hooks" エラー**: 実行中のページに hook を追加/削除する編集をすると、
  ホットリロードで hook 順序変更エラーがコンソールに出る。**コードのバグではない**。
  プレビューのコンソールログはバッファに残り続けるため、判断に迷ったらサーバーを
  再起動してクリーンな状態で再確認する
- **プレビューのスクリーンショットが白っぽく写る**ことがある（キャプチャ側の色化け）。
  背景色などは computed style（inspect）で確認する
- eval でボタンを連続クリックするテストは、React の再レンダー前に古い state を
  参照することがある。クリック間に `setTimeout` を挟むこと

## iOS オーディオ対策（最重要・回帰させないこと）

useMetronome.ts の音声まわりは iPhone Safari の複数の既知問題への対策の積み重ねで
できている。以下の設計は**理由を理解せずに「単純化」してはいけない**:

1. **スケジューラのティックは Web Worker で刻む**（`TICK_WORKER_CODE`）
   — メインスレッドの setInterval はバックグラウンドで間引かれ、音が途切れるため
2. **音は MediaStream → `<audio>` 要素経由で出力**（`setupAudioGraph`）
   — iOS は Web Audio の直接出力をバックグラウンドで停止するが、メディア要素の再生は
   継続する。これがバックグラウンド再生の要。`ctx.destination` への直接接続に戻すと
   ホーム画面移動で音が止まる回帰になる
3. **再生のたびに AudioContext を作り直す**（play() 内）
   — スリープ後のコンテキストは state が 'running' を装ったまま音が出ない
   「ゾンビ状態」になることがあり、状態からは判別できない。「毎回作り直しは無駄」に
   見えるが意図的
4. **resume() と el.play() はタイムアウト付きで待つ**（`resumeWithTimeout`、400ms race）
   — iOS ではどちらも永遠に解決しないことがある。素の await に戻すと再生ボタンが
   無反応になる回帰
5. **スケジューラの仕切り直しガード**（scheduler 冒頭の `nextBeatTime < currentTime - 0.05`）
   — JS凍結（ロック・割り込み）から復帰した際、過去の拍をまとめてスケジュールして
   「タタタタ」連打になるのを防ぐ。削除禁止
6. **`navigator.audioSession.type = 'playback'`** — サイレントスイッチON・
   バックグラウンドでも再生継続する宣言（Safari 16.4+）
7. **MediaSession 対応** — ロック画面の再生/停止ボタン。ハンドラは `playFnRef`/`stopFnRef`
   経由（stale closure 回避）
8. **Wake Lock** — 再生中は画面を消灯させない。visibilitychange で再取得

先読み定数: `SCHEDULE_AHEAD = 0.2`（フォアグラウンド）/ `SCHEDULE_AHEAD_HIDDEN = 1.0`。
短くすると処理の引っかかりで音がズレる。

## 仕様上の決まりごと

- **BPM は 0 または 40〜240 のみ**。中間値（1〜39）は `snapBpm` で丸める
  （20未満→0、20以上→40）。BPM 0 は「テンポなし・タイマーのみ動作」の特別値
  - 0 で +2 を押すと 40 に復帰。40 で −4 を押しても 0 には落ちない（0は専用ボタンのみ）
- **BPM 増減はかならず `adjustBpm`（関数型アップデート）を使う**。
  `setBpm(bpm + n)` は連打時に古い値を掴むバグになる（実際に起きた）
- **設定の永続化**: localStorage キー `metronome-settings`。BPM・音符の種類・
  タイマー設定（enabled/loop/durationMinutes）・自動BPM設定を保存。
  残り時間などの一時状態は保存しない。読み込み時にも `snapBpm` を通す
- コミットメッセージは日本語で `feat:`/`fix:` プレフィックス

## ユーザーとのやりとり

- 実機（iPhone）でしか再現しない不具合が多い。デスクトップで再現不能な報告は
  仮説→対策→デプロイ→ユーザーに実機確認を依頼、のループで進める。
  確認手順（「タブを再読み込みしてから」等）を具体的に伝えること
- 症状の切り分けに役立つ質問（どの操作の後に起きるか、UIは反応しているか）を添える

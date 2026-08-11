# Cast Diagnosis Audit

`npm run audit:cast-diagnosis -- --from=YYYY-MM-DD --to=YYYY-MM-DD` で、HTTP認証を経由せず既存のDiagnosis Serviceを読み取り専用で実行します。

Baselineは比較Providerのみを`LEGACY_RESULT_TOP_ONLY`へ切り替え、Currentは本番既定の`AXIS_SPECIFIC`を使用します。ファクト、閾値、Primary優先順位、Confidence条件は共通です。

JSONとMarkdownは`artifacts/audits/cast-diagnosis/`へ出力され、Git管理対象外です。終了コードは、正常0、Safety違反1、引数・DB・環境エラー2です。Primary差分15名以上、軸不一致、Facts不一致、Validation違反、診断数不一致がある場合はFAILとなります。

監査は`create/update/upsert/delete/migration`を行わず、実DBの既存確定データを参照するだけです。診断Engine、比較軸、閾値を変更した場合は、Step 3-Bへ進む前に必ず再実行してください。

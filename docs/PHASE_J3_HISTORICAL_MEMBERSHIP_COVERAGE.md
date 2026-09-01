# J3 Historical Membership Coverage

Historical datasetに対するMembership判定のcoverageをRead-onlyで監査する。`MEMBER` / `NOT_MEMBER` / `UNKNOWN`の三値を維持し、joinedAt・leftAtの推測やFact日付からのbackfillは行わない。

実行：`npm run memberships:j3-historical-coverage`。Town、CTI、HeavenのFact日付範囲、Membership interval coverage、UNKNOWN理由、media別readiness、全evaluation detailをJSONで出力する。Exact backfill候補は明示的なeventがない限り0とし、Historical Membership正式切替は本フェーズでは行わない。

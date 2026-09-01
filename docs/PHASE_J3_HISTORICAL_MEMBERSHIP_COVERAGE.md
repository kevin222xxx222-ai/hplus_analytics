# J3 Historical Membership Coverage

Historical datasetに対するMembership判定のcoverageをRead-onlyで監査する。`MEMBER` / `NOT_MEMBER` / `UNKNOWN`の三値を維持し、joinedAt・leftAtの推測やFact日付からのbackfillは行わない。

実行：`npm run memberships:j3-historical-coverage`。Town、CTI、HeavenのFact日付範囲、Membership interval coverage、UNKNOWN理由、media別readiness、全evaluation detailをJSONで出力する。Exact backfill候補は明示的なeventがない限り0とし、Historical Membership正式切替は本フェーズでは行わない。

## J3 Final Close / Production Verified

J3: **HISTORICAL MEMBERSHIP COVERAGE AUDIT COMPLETE / PRODUCTION VERIFIED**。

Production最終結果：Membershipは244件、current 238件。`joinedAt`既知5件、`leftAt`既知6件、完全bound interval 0件。CLIの`membershipsWithAnyKnownBoundary=11`は、Current Membershipと排他的な「historical row数」ではなく、開始日または終了日のいずれかが既知のMembership数を表す。

Historical evaluationはTown 12,315件（UNKNOWN 11,323、NOT_READY）、CTI 9,609件（UNKNOWN 7,551、NOT_READY）、Heaven 70,696件（UNKNOWN 57,567、NOT_READY）。UNKNOWN合計は76,441件で理由集計と一致した。Exact backfill候補は0件、determinism差分は0件。

Historical Membership formal switchは **NOT_READY** とし、Town/CTI/Heavenとも現行のHistorical Fact scope・Legacy fallbackを継続する。joinedAt/leftAt推測、DB backfill、Production env変更は行わない。

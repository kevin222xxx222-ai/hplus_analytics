# J4 Legacy Field Shrink & Dependency Cleanup

J0〜J3完了後のLegacy参照をRead-only Inventoryで分類する。`primaryStoreId`は表示/default/互換のみ、`Cast.status`は人物global lifecycle、`startedOn`/`endedOn`はHistorical Legacy fallback・Fact互換として維持する。Current Store在籍判定はMembershipを正本とし、Historical/AnalyticsのLegacy fallbackは現時点で変更しない。

実行：`npm run memberships:j4-legacy-inventory`。P0はCurrent behaviorでMembership正本に反するStore判定が見つかった場合のみ、P1は将来事故リスク、P2は表示・互換・文書負債として扱う。今回は削除・Schema変更・Production変更を行わず、cleanup順序だけを提示する。

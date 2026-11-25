# BF-107 / retention of detailed saved history

Status: local engineering decision, bounded v1 compatibility, 2026-11-25.

Context: the v1 display reader caps workouts at 60. saveProfile and explicit backup recovery currently serialize that capped projection. A valid older raw row can disappear even though its paid ID remains. Existing settled journal rows are not a substitute for legacy dates or recorded receipt fields.

Decision: keep the current v1 key and object shape; keep the last-60 UI view. For a write that would truncate an uncapped or crossing-cap source, retain all prior and supplied valid workout originals by ID, preserve the recent order, and verify that the normalized view (including balances, totals and IDs) exactly equals the intended view. Retain exact previous raw as fallback; restore uncapped fallback exactly. Contradictory/malformed originals fail closed. No new reward, timestamp, journal row, schema, delete, pruning, network or cross-fighter merge. File replacement must preserve available detailed originals in both slots, verify settled evidence against the uncapped receipt view, and keep existing strict size/identity/journal gates.

Alternatives: separate IndexedDB archive (requires new transaction/export/import/restore protocol, defer); append synthetic journal results (reject: cannot invent legacy facts); silently retain only IDs (reject: date loss). Price: raw v1 snapshots grow; quota/size limits can prevent further writes, never justify silent truncation. Existing 16 MB export bound and browser quota are limitations, not a capacity promise. Compact archive and storage-pressure UX remain separate work; no physical durability guarantee.

QA: red before patch; cap crossing, uncapped identity adoption and recovery, no-op, conflicting IDs/facts, quota, compatible full-history import and rejection of truncated/altered original. Full unit, typecheck, build, bundle and isolated browser verification; read-back exact source. Rollback only owned files using exact hashes. Delta: preserve detailed originals; evidence: code and tests; confidence local only; reopen if size/compatibility/regression gate fails.

Amendment: if rotation would erase a detailed fallback (60 or more rows) that is not retained in either new slot, preserve the exact original in the existing exportable profile quarantine first. If that fails, do not rotate or save. Explicit fresh start retains a distinct detailed fallback as well. No automatic merge. This protection is not recovery of dates already absent from every available source.

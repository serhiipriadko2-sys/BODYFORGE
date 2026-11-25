# BF-213 - Field study metric preparation

Status: PREPARATION PASS / FIELD STUDY BLOCKED. No participant observations, real exercise sessions, actual observer labels or device field measurements collected.
Implemented standalone offline evaluator in qa/field-study-metrics.mjs. Explicit pseudonymized JSON input, schema and size checks, participant-disjoint development/holdout, paired baseline/candidate, observer/consent attestations, ambiguous exclusions and strata by exercise/device/surface/split. One-to-one optimal event matching; count/error metrics, plank interval duration/overlap, false finishes, tracking and latency, descriptive paired participant-cluster bootstrap. Undefined denominators stay null. No automatic acceptance decision.
Verification: 16 Node tests passed; independent brute-force assignment oracle agrees on all 2240 small input combinations. Syntax, production import scan, Vitest scope, git diff and staged diff checks, and canon verification passed. Vitest config includes only src/**/*.test.ts; QA Node tests are standalone.
Run: node --test qa/field-study-metrics.test.mjs
Analysis: node qa/field-study-metrics.mjs <explicit pseudonymized JSON path>
No real data files or participant identities created. Consent/observer fields are attestations, not proof; aggregate output still requires privacy review before sharing, especially small strata.
Roadmap section 4.3: independent real-world pilot (provisional 12-20 adults if feasible and ethically approved); participant/device stratification; two independent trained observers with adjudication; preregister tolerances, outcomes and gate thresholds before holdout; determine confirmatory sample size after pilot. Synthetic tests cannot determine accuracy, sample adequacy, safety or readiness.
No production code import, real profile writes, APK or publication. Continue separately authorized engineering branches without marking field/release gates complete.

## Evidence
- qa/field-study-metrics.mjs: 13835 bytes; SHA-256 b915023abdfd97102a18abff436fd23cb2e1c4f6dacb3d2358d80a42f817f293
- qa/field-study-metrics.test.mjs: 8036 bytes; SHA-256 c96ba677561ea5bcc0d7e15d74e301b3b9c1584468a416700bcb503520b52f71
- docs/audits/BF_213_FIELD_METRICS_PREP_20261125/initial-gates.json: 273 bytes; SHA-256 33faa0fd3013dbe0529f0c0fce7514c88b29c065d3e945137c236d1f720cc7d8
- docs/audits/BF_213_FIELD_METRICS_PREP_20261125/initial-unit.log: 1414 bytes; SHA-256 31b0b8a167d2a0018e4aa1379f76450db37f4b600ea81521f7d5d0f86b164a60
- docs/audits/BF_213_FIELD_METRICS_PREP_20261125/field-study-metrics.initial.mjs: 6870 bytes; SHA-256 fae3e62d39bd09ac98b1430f75900a488ec3c9688a7f21f14ead0667a787336b
- docs/audits/BF_213_FIELD_METRICS_PREP_20261125/gates.json: 572 bytes; SHA-256 27bcbbc0d744303c51af11f8e046af413749b7b8eae20ec558e7c4d69a7b82a5
- docs/audits/BF_213_FIELD_METRICS_PREP_20261125/unit.log: 1507 bytes; SHA-256 7935f03a0bada3994e6c7643e51c0d1cad0894e6f5a69b4189638875e43ac53c
- docs/audits/BF_213_FIELD_METRICS_PREP_20261125/canon.log: 191 bytes; SHA-256 bd4804de303f67e95fa25e0fa54c637d0ae574c4ff18b54cfa79d64738587506
- docs/audits/BF_213_FIELD_METRICS_PREP_20261125/git_diff.log: 4707 bytes; SHA-256 a3faced9018e2b9c29dd584e051a184cca7432c829c2590da3445c045b403bf3
- docs/audits/BF_213_FIELD_METRICS_PREP_20261125/git_cached.log: 0 bytes; SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855

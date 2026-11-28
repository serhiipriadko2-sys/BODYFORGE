# BODYFORGE V25 chest fan field study

Status: DIAGNOSTIC_NOT_INTEGRATED. V24 receipt 2654a88f154f2df981af456c67669dfffe1537ef787a2edb958502e8cff25f79 and all 230 entries read back unchanged. No V25 source integration or public release.

Anatomy-inspired broad fan with separate clavicular/sternocostal shape proxy, not a calibrated human muscle simulation. References: https://www.ncbi.nlm.nih.gov/sites/books/NBK525991/ ; https://pmc.ncbi.nlm.nih.gov/articles/PMC10668934/ ; https://pubmed.ncbi.nlm.nih.gov/19291757/ . Four candidates: only fan35 passed initial isolated-step and local geometry gates. Peak anterior volume displacement 43.4197536206107 -> 34.56106787253626 mm, above-half-peak surface proxy 99.21730857758205 -> 110.27504129604192 cm2, relief RMS ratio 0.9965379976274471. Other three rejected for higher edge-angle p95; strongest also fails orientation.

Transfer setup initially stopped on an overbroad output-name anchor; two attempted corrections had a quoting/anchor error. Exact output expression fixed, original V24 field preserved. 128/132 channel payloads identical, four chest channels changed (torso and shirt); zero skin/shorts change. First visual test expected change on rear view, inappropriate for chest-only shape. Corrected separate front/rear criteria; 13 actual hardware frames, exact zero state and zero rear frame difference.

Visual review: slightly flatter, broader pectorals, but substantial stylization and lower ridge remain. No full body/garment pose envelope or purchase regression for V25. Retain candidate as experiment only. V24 is checked baseline.

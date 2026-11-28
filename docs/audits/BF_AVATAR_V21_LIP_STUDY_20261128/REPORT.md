# BODYFORGE V21 lip tissue material study

Status: DIAGNOSTIC_NOT_INTEGRATED. Hardware test PASS; visual acceptance NOT MET. All 325 V20 receipt entries read back unchanged.

Hypothesis: differentiate dry vermilion and wet inner mucosa through local diffuse pigment, roughness and reduced artificial angular wrap, not a painted outgoing-light mask. Eleven measured seam knots; 128-sample local texture. Tissue optical coefficients are artistic, not measured reflectance. References: https://www.ncbi.nlm.nih.gov/books/NBK507900/ ; https://ijdvl.com/vermilion-an-underemphasised-anatomical-area-in-dermatology/ ; https://developer.nvidia.com/gpugems/gpugems3/part-iii-rendering/chapter-14-advanced-techniques-realistic-real-time-skin .

Initial disposable shader compile failed due to a bfDy name collision with V15. All candidate local names namespaced; recompiled successfully, 17 matched frames, 4 checks, original geometry/normals exact, 9 calls / 111431 triangles. Visual contact sheet compared pigment only, three combined strengths, side angle and contrasting skin tones. Bright inner lip ridge remains; stronger tissue correction increases dark/bright contrast. Do not promote.

Next distinct hypothesis: analyze the topology and tangent continuity of the actual neutral lip ridge; consider bounded geometric closure/smoothing only after proving paid morph and blink independence and measuring collisions, normals and silhouette. No source integration, public deployment, commit, APK or owner save writes. V20 remains the locally verified baseline; AAA and Android acceptance outstanding.

# Licensed athlete groom inputs

This directory contains exactly the five unmodified OBJ/PNG source inputs used
by `scripts/groom-athlete.py`. They are assets, not camera captures or a user's
likeness. `manifest.json` records their byte counts, SHA-256 hashes, upstream
archive member paths and license. The runtime uses the derived GLB and maps in
`public/assets/`; it does not download or serve these authoring inputs.
The local `.gitattributes` disables newline conversion for OBJ/PNG so Windows
checkouts preserve the pinned upstream bytes.

Author: **makehuman_system**. License: **CC0 1.0 Universal**.

- [Official asset listing](https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html)
- [Original CC0 archive](https://files2.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip)
- [CC0 legal text](https://creativecommons.org/publicdomain/zero/1.0/legalcode)

The accompanying upstream `short02.mhmat` and `short04.mhmat` record an explicit
CC0 release in September 2020. Their notice identifies the holders at that time
as Data Collection AB, Joel Palmius and Jonas Hauquier (2020), with Data Collection
AB as MakeHuman's primary legal contact. The official listing independently
identifies the assets as CC0. Those material files are provenance evidence;
the five files listed in the manifest are the complete external groom inputs.

The bytes were retrieved from the upstream ZIP with member-size and CRC32
checks, then pinned by SHA-256. To restore a missing file, extract its exact
`archivePath` from that archive and run the read-only verification below.
Do not substitute a similarly named asset or change the expected hashes.

From the repository root, with ordinary Python 3.11+ and no Blender installation:

```powershell
python -B scripts/groom-athlete.py --verify-inputs
python -B scripts/test_groom_inputs.py
```

Verification checks the manifest, all five files and the existing pinned
`art/bodyforge-athlete-realistic.blend` before importing Blender or writing any
output. Missing files, modified bytes or manifest drift fail with named errors.
An alternate source directory can be checked with `--source-dir PATH`; it must
contain the same five byte-exact inputs and manifest.

Only when intentionally rebuilding the derived assets, use Blender 5.2 with
its bundled NumPy:

```powershell
blender --background --factory-startup --python-exit-code 1 --python scripts/groom-athlete.py
```

This authoring command rewrites the derived `bodyforge-athlete-detail.glb`,
`athlete-hair.png`, `athlete-hair-normal.png` and editable
`art/bodyforge-athlete-detail.blend`. The pinned realistic source remains
unchanged. It prints a JSON receipt to stdout and does not require a private
`.iskra` directory. It does not rebuild the efficient GLB; packing and all
subsequent application/visual QA remain separate steps.

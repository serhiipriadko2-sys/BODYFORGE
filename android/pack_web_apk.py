"""Pack only built web assets + compiled dex; verify exact bytes after signing."""
from pathlib import Path, PurePosixPath
import hashlib, json, shutil, stat, sys, zipfile

def sha(data):
    return hashlib.sha256(data).hexdigest()

def safe(name):
    path = PurePosixPath(name)
    return bool(name) and not path.is_absolute() and "\\" not in name and ":" not in name and ".." not in path.parts and "." not in path.parts and "\x00" not in name

def index_zip(archive):
    names = {}
    for item in archive.infolist():
        if not safe(item.filename) or item.filename.casefold() in names:
            raise ValueError("unsafe or duplicate APK path: " + item.filename)
        names[item.filename.casefold()] = item
        if stat.S_ISLNK(item.external_attr >> 16):
            raise ValueError("symlink in APK")
        if item.file_size > 150_000_000:
            raise ValueError("oversized APK entry")
    if sum(i.file_size for i in archive.infolist()) > 400_000_000:
        raise ValueError("oversized APK")
    if archive.testzip():
        raise ValueError("APK CRC failure")
    return names

def inventory(dist):
    allowed = {".html", ".js", ".css", ".json", ".webmanifest", ".svg", ".png", ".jpg",
               ".jpeg", ".webp", ".glb", ".woff", ".woff2", ".wasm", ".txt", ".md", ".ico"}
    entries = {}
    for p in sorted(dist.rglob("*")):
        st = p.lstat()
        if p.is_symlink() or getattr(st, "st_file_attributes", 0) & 1024:
            raise ValueError("link or reparse point in dist")
        if not p.is_file():
            continue
        rel = p.relative_to(dist).as_posix()
        if not safe(rel) or any(part.startswith(".") for part in PurePosixPath(rel).parts):
            raise ValueError("unsafe web path")
        if p.suffix.lower() not in allowed or p.stat().st_size == 0:
            raise ValueError("unexpected or empty asset: " + rel)
        name = "assets/web/" + rel
        if name.casefold() in entries:
            raise ValueError("duplicate web path")
        data = p.read_bytes()
        entries[name.casefold()] = (name, data)
    if "assets/web/index.html" not in entries or not any(n.endswith(".js") for n in entries):
        raise ValueError("missing built web entry")
    return entries

def pack(dist, base, dex, out, manifest):
    assets = inventory(dist)
    shutil.copyfile(base, out)
    with zipfile.ZipFile(out, "a", zipfile.ZIP_DEFLATED) as z:
        original = index_zip(z)
        if "classes.dex" in original or any(n.startswith("assets/web/") for n in original):
            raise ValueError("base already contains payload")
        dex_data = dex.read_bytes()
        if not dex_data.startswith(b"dex\n"):
            raise ValueError("invalid dex")
        z.writestr("classes.dex", dex_data)
        for name, data in assets.values():
            z.writestr(name, data)
    expected = {name: {"bytes": len(data), "sha256": sha(data)} for name, data in assets.values()}
    expected["classes.dex"] = {"bytes": len(dex_data), "sha256": sha(dex_data)}
    with zipfile.ZipFile(out) as z:
        index_zip(z)
        expected.update({i.filename: {"bytes": i.file_size, "sha256": sha(z.read(i))}
                         for i in z.infolist() if i.filename not in expected})
    manifest.write_text(json.dumps(expected, indent=2), encoding="utf-8")
    print(f"PACKED_WEB_ASSETS={len(assets)}")

def verify(apk, manifest):
    expected = json.loads(manifest.read_text(encoding="utf-8"))
    with zipfile.ZipFile(apk) as z:
        names = index_zip(z)
        for name, fingerprint in expected.items():
            if name.casefold() not in names or names[name.casefold()].filename != name:
                raise ValueError("missing exact member: " + name)
            content = z.read(name)
            if len(content) != fingerprint["bytes"] or sha(content) != fingerprint["sha256"]:
                raise ValueError("member hash drift: " + name)
        extras = set(i.filename for i in z.infolist()) - set(expected)
        if any(not n.startswith("META-INF/") or not n.upper().endswith((".SF", ".RSA", ".DSA", ".EC", ".MF")) for n in extras):
            raise ValueError("unexpected APK member")
        data = apk.read_bytes()
        print(json.dumps({"status": "PASS", "webAssets": sum(n.startswith("assets/web/") for n in expected),
                          "entries": len(names), "verifiedPayloadMembers": len(expected),
                          "bytes": len(data), "sha256": sha(data)}, indent=2))

if __name__ == "__main__":
    args = sys.argv[1:]
    if args[0] == "pack" and len(args) == 6:
        pack(*map(Path, args[1:]))
    elif args[0] == "verify" and len(args) == 3:
        verify(*map(Path, args[1:]))
    else:
        raise SystemExit("usage: pack DIST BASE DEX OUT MANIFEST | verify APK MANIFEST")

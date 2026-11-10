#!/usr/bin/env python3
"""Build and verify deterministic, fail-closed release manifests."""

from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import os
import re
import stat
import sys
import tempfile
import zipfile
from dataclasses import asdict, dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Iterable

SCHEMA_VERSION = "iskra.release-manifest.v1"
DEFAULT_MAX_FILES = 5000
DEFAULT_MAX_TOTAL_BYTES = 256 * 1024 * 1024
DEFAULT_MAX_FILE_BYTES = 64 * 1024 * 1024
DEFAULT_MAX_COMPRESSION_RATIO = 200.0

GENERATED_PARTS = {
    "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache",
    ".coverage", ".DS_Store", "Thumbs.db",
}
GENERATED_SUFFIXES = {".pyc", ".pyo"}
SECRET_NAME_PATTERNS = (
    ".env", ".env.*", "id_rsa", "id_ed25519", "*.pem", "*.p12",
    "*.pfx", "*.key", "secrets.*",
)
SECRET_BYTES = (
    b"-----BEGIN " + b"PRIVATE KEY-----",
    b"-----BEGIN RSA " + b"PRIVATE KEY-----",
    b"-----BEGIN OPENSSH " + b"PRIVATE KEY-----",
    b"sk-" + b"proj-",
    b"sb_" + b"secret_",
)
WINDOWS_DRIVE_RE = re.compile(r"^[A-Za-z]:")


class ReleaseError(RuntimeError):
    """Fail-closed release validation error."""


@dataclass(frozen=True)
class Policy:
    max_files: int = DEFAULT_MAX_FILES
    max_total_bytes: int = DEFAULT_MAX_TOTAL_BYTES
    max_file_bytes: int = DEFAULT_MAX_FILE_BYTES
    max_compression_ratio: float = DEFAULT_MAX_COMPRESSION_RATIO
    allow_empty_files: bool = False
    reject_generated_noise: bool = True
    scan_secret_markers: bool = True

    def validate(self) -> None:
        if self.max_files < 1:
            raise ReleaseError("max_files must be positive")
        if self.max_total_bytes < 1 or self.max_file_bytes < 1:
            raise ReleaseError("byte limits must be positive")
        if self.max_file_bytes > self.max_total_bytes:
            raise ReleaseError("max_file_bytes cannot exceed max_total_bytes")
        if self.max_compression_ratio < 1:
            raise ReleaseError("max_compression_ratio must be at least 1")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def is_generated(path: str) -> bool:
    pure = PurePosixPath(path)
    return any(part in GENERATED_PARTS for part in pure.parts) or pure.suffix.lower() in GENERATED_SUFFIXES


def is_secret_name(path: str) -> bool:
    name = PurePosixPath(path).name
    return any(fnmatch.fnmatch(name, pattern) for pattern in SECRET_NAME_PATTERNS)


def contains_secret_marker(data: bytes) -> bool:
    sample = data[: 256 * 1024]
    return any(marker in sample for marker in SECRET_BYTES)


def validate_relative_path(raw: str) -> str:
    if not raw or "\x00" in raw:
        raise ReleaseError(f"unsafe empty or NUL path: {raw!r}")
    if "\\" in raw:
        raise ReleaseError(f"backslash path is not portable: {raw!r}")
    if raw.startswith("/") or WINDOWS_DRIVE_RE.match(raw):
        raise ReleaseError(f"absolute path rejected: {raw!r}")
    path = PurePosixPath(raw)
    if any(part in {"", ".", ".."} for part in path.parts):
        raise ReleaseError(f"traversal or ambiguous path rejected: {raw!r}")
    normalized = path.as_posix()
    if normalized != raw.rstrip("/"):
        raise ReleaseError(f"non-canonical path rejected: {raw!r}")
    return normalized


def ensure_unique_paths(paths: Iterable[str]) -> None:
    exact: set[str] = set()
    folded: dict[str, str] = {}
    for path in paths:
        if path in exact:
            raise ReleaseError(f"duplicate path: {path}")
        exact.add(path)
        key = path.casefold()
        previous = folded.get(key)
        if previous is not None and previous != path:
            raise ReleaseError(f"case-fold collision: {previous!r} vs {path!r}")
        folded[key] = path


def enforce_item_policy(path: str, size: int, data: bytes | None, policy: Policy) -> None:
    if size < 0:
        raise ReleaseError(f"negative size for {path}")
    if size == 0 and not policy.allow_empty_files:
        raise ReleaseError(f"empty file rejected: {path}")
    if size > policy.max_file_bytes:
        raise ReleaseError(f"file exceeds max_file_bytes: {path} ({size})")
    if policy.reject_generated_noise and is_generated(path):
        raise ReleaseError(f"generated noise rejected: {path}")
    if policy.scan_secret_markers:
        if is_secret_name(path):
            raise ReleaseError(f"secret-like filename rejected: {path}")
        if data is not None and contains_secret_marker(data):
            raise ReleaseError(f"secret marker rejected: {path}")


def finalize_manifest(release: str, artifact_type: str, items: list[dict[str, Any]], policy: Policy) -> dict[str, Any]:
    ensure_unique_paths(item["path"] for item in items)
    items.sort(key=lambda item: item["path"])
    file_count = len(items)
    total_bytes = sum(int(item["bytes"]) for item in items)
    if file_count == 0:
        raise ReleaseError("artifact contains no files")
    if file_count > policy.max_files:
        raise ReleaseError(f"file count exceeds max_files: {file_count}")
    if total_bytes > policy.max_total_bytes:
        raise ReleaseError(f"artifact exceeds max_total_bytes: {total_bytes}")
    return {
        "schema_version": SCHEMA_VERSION,
        "release": release,
        "artifact_type": artifact_type,
        "policy": asdict(policy),
        "items": items,
        "counts": {"files": file_count, "bytes": total_bytes},
        "checks": {
            "safe_paths": True,
            "no_symlinks": True,
            "no_duplicates": True,
            "no_casefold_collisions": True,
            "no_generated_noise": True,
            "secret_scan": True,
            "content_ok": True,
        },
    }


def scan_directory(root: Path, policy: Policy) -> dict[str, Any]:
    if not root.exists():
        raise ReleaseError(f"artifact does not exist: {root}")
    if not root.is_dir():
        raise ReleaseError(f"expected directory: {root}")
    if root.is_symlink():
        raise ReleaseError(f"root symlink rejected: {root}")

    resolved_root = root.resolve(strict=True)
    items: list[dict[str, Any]] = []
    for candidate in sorted(root.rglob("*"), key=lambda item: item.as_posix()):
        relative = candidate.relative_to(root).as_posix()
        validate_relative_path(relative)
        if candidate.is_symlink():
            raise ReleaseError(f"symlink rejected: {relative}")
        resolved = candidate.resolve(strict=True)
        try:
            resolved.relative_to(resolved_root)
        except ValueError as exc:
            raise ReleaseError(f"path escapes artifact root: {relative}") from exc
        if candidate.is_dir():
            continue
        if not candidate.is_file():
            raise ReleaseError(f"non-regular file rejected: {relative}")
        size = candidate.stat().st_size
        with candidate.open("rb") as handle:
            sample = handle.read(256 * 1024) if policy.scan_secret_markers else None
        enforce_item_policy(relative, size, sample, policy)
        items.append({"path": relative, "bytes": size, "sha256": sha256_file(candidate)})

    return finalize_manifest(root.name, "directory", items, policy)


def zip_is_symlink(info: zipfile.ZipInfo) -> bool:
    unix_mode = (info.external_attr >> 16) & 0xFFFF
    return stat.S_IFMT(unix_mode) == stat.S_IFLNK


def scan_zip(path: Path, policy: Policy) -> dict[str, Any]:
    if not path.exists() or not path.is_file():
        raise ReleaseError(f"ZIP does not exist: {path}")
    if path.is_symlink():
        raise ReleaseError(f"ZIP symlink rejected: {path}")
    if not zipfile.is_zipfile(path):
        raise ReleaseError(f"not a readable ZIP: {path}")

    items: list[dict[str, Any]] = []
    with zipfile.ZipFile(path, "r") as archive:
        infos = archive.infolist()
        file_infos = [info for info in infos if not info.is_dir()]
        if len(file_infos) > policy.max_files:
            raise ReleaseError(f"ZIP member count exceeds max_files: {len(file_infos)}")
        declared_total = sum(info.file_size for info in file_infos)
        if declared_total > policy.max_total_bytes:
            raise ReleaseError(f"ZIP declared bytes exceed max_total_bytes: {declared_total}")

        normalized_names: list[str] = []
        for info in file_infos:
            name = validate_relative_path(info.filename)
            normalized_names.append(name)
            if info.flag_bits & 0x1:
                raise ReleaseError(f"encrypted ZIP member rejected: {name}")
            if zip_is_symlink(info):
                raise ReleaseError(f"ZIP symlink rejected: {name}")
            if info.file_size > policy.max_file_bytes:
                raise ReleaseError(f"ZIP member exceeds max_file_bytes: {name}")
            if info.file_size > 0:
                ratio = info.file_size / max(info.compress_size, 1)
                if ratio > policy.max_compression_ratio:
                    raise ReleaseError(f"ZIP compression ratio too high: {name} ({ratio:.2f})")
        ensure_unique_paths(normalized_names)

        for info, name in zip(file_infos, normalized_names):
            digest = hashlib.sha256()
            total = 0
            sample = bytearray()
            with archive.open(info, "r") as handle:
                while True:
                    chunk = handle.read(1024 * 1024)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > policy.max_file_bytes:
                        raise ReleaseError(f"ZIP member expands beyond max_file_bytes: {name}")
                    if len(sample) < 256 * 1024:
                        sample.extend(chunk[: 256 * 1024 - len(sample)])
                    digest.update(chunk)
            if total != info.file_size:
                raise ReleaseError(f"ZIP size mismatch for {name}: declared {info.file_size}, read {total}")
            enforce_item_policy(name, total, bytes(sample) if policy.scan_secret_markers else None, policy)
            items.append({"path": name, "bytes": total, "sha256": digest.hexdigest()})

        bad_member = archive.testzip()
        if bad_member is not None:
            raise ReleaseError(f"ZIP CRC failure: {bad_member}")

    return finalize_manifest(path.stem, "zip", items, policy)


def scan_artifact(path: Path, policy: Policy) -> dict[str, Any]:
    policy.validate()
    if path.is_dir():
        return scan_directory(path, policy)
    if path.is_file() and path.suffix.lower() == ".zip":
        return scan_zip(path, policy)
    raise ReleaseError(f"artifact must be a directory or .zip file: {path}")


def validate_manifest_shape(manifest: Any) -> dict[str, Any]:
    if not isinstance(manifest, dict):
        raise ReleaseError("manifest must be a JSON object")
    if manifest.get("schema_version") != SCHEMA_VERSION:
        raise ReleaseError(f"unsupported manifest schema: {manifest.get('schema_version')!r}")
    if manifest.get("artifact_type") not in {"directory", "zip"}:
        raise ReleaseError("manifest artifact_type must be directory or zip")
    items = manifest.get("items")
    if not isinstance(items, list) or not items:
        raise ReleaseError("manifest items must be a non-empty list")
    paths: list[str] = []
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            raise ReleaseError(f"manifest item {index} must be an object")
        path = validate_relative_path(item.get("path", ""))
        if not isinstance(item.get("bytes"), int) or item["bytes"] < 0:
            raise ReleaseError(f"manifest item has invalid bytes: {path}")
        digest = item.get("sha256")
        if not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest):
            raise ReleaseError(f"manifest item has invalid sha256: {path}")
        paths.append(path)
    ensure_unique_paths(paths)
    counts = manifest.get("counts")
    if not isinstance(counts, dict):
        raise ReleaseError("manifest counts must be an object")
    expected_files = len(items)
    expected_bytes = sum(item["bytes"] for item in items)
    if counts.get("files") != expected_files or counts.get("bytes") != expected_bytes:
        raise ReleaseError("manifest counts do not match items")
    return manifest


def compare_manifests(expected: dict[str, Any], actual: dict[str, Any]) -> list[dict[str, Any]]:
    differences: list[dict[str, Any]] = []
    if expected["artifact_type"] != actual["artifact_type"]:
        differences.append({"kind": "artifact_type", "expected": expected["artifact_type"], "actual": actual["artifact_type"]})

    expected_map = {item["path"]: item for item in expected["items"]}
    actual_map = {item["path"]: item for item in actual["items"]}
    for path in sorted(expected_map.keys() - actual_map.keys()):
        differences.append({"kind": "missing", "path": path})
    for path in sorted(actual_map.keys() - expected_map.keys()):
        differences.append({"kind": "extra", "path": path})
    for path in sorted(expected_map.keys() & actual_map.keys()):
        exp = expected_map[path]
        got = actual_map[path]
        if exp["bytes"] != got["bytes"]:
            differences.append({"kind": "bytes", "path": path, "expected": exp["bytes"], "actual": got["bytes"]})
        if exp["sha256"] != got["sha256"]:
            differences.append({"kind": "sha256", "path": path, "expected": exp["sha256"], "actual": got["sha256"]})
    return differences


def write_json_atomic(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        handle.write(text)
        temp_name = handle.name
    os.replace(temp_name, path)


def build_policy(args: argparse.Namespace) -> Policy:
    return Policy(
        max_files=args.max_files,
        max_total_bytes=args.max_total_bytes,
        max_file_bytes=args.max_file_bytes,
        max_compression_ratio=args.max_compression_ratio,
        allow_empty_files=args.allow_empty_files,
        reject_generated_noise=not args.allow_generated_noise,
        scan_secret_markers=not args.skip_secret_scan,
    )


def add_policy_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--max-files", type=int, default=DEFAULT_MAX_FILES)
    parser.add_argument("--max-total-bytes", type=int, default=DEFAULT_MAX_TOTAL_BYTES)
    parser.add_argument("--max-file-bytes", type=int, default=DEFAULT_MAX_FILE_BYTES)
    parser.add_argument("--max-compression-ratio", type=float, default=DEFAULT_MAX_COMPRESSION_RATIO)
    parser.add_argument("--allow-empty-files", action="store_true")
    parser.add_argument("--allow-generated-noise", action="store_true")
    parser.add_argument("--skip-secret-scan", action="store_true")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    build_parser = subparsers.add_parser("build", help="build a deterministic manifest")
    build_parser.add_argument("artifact", type=Path)
    build_parser.add_argument("--output", type=Path)
    add_policy_args(build_parser)

    verify_parser = subparsers.add_parser("verify", help="verify an artifact against a manifest")
    verify_parser.add_argument("artifact", type=Path)
    verify_parser.add_argument("--manifest", type=Path, required=True)
    add_policy_args(verify_parser)

    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        policy = build_policy(args)
        actual = scan_artifact(args.artifact, policy)
        if args.command == "build":
            payload = actual
            if args.output:
                write_json_atomic(args.output, payload)
        else:
            raw = args.manifest.read_bytes()
            expected = validate_manifest_shape(json.loads(raw.decode("utf-8")))
            differences = compare_manifests(expected, actual)
            payload = {
                "ok": not differences,
                "mode": "verify",
                "artifact": str(args.artifact),
                "manifest": str(args.manifest),
                "manifest_sha256": sha256_bytes(raw),
                "differences": differences,
                "counts": actual["counts"],
            }
            if differences:
                print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))
                return 1
        print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))
        return 0
    except (OSError, ValueError, json.JSONDecodeError, zipfile.BadZipFile, ReleaseError) as exc:
        error = {"ok": False, "error": type(exc).__name__, "message": str(exc)}
        print(json.dumps(error, ensure_ascii=False, sort_keys=True), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

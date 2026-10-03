#!/usr/bin/env python
"""Ensure the shared Hindsight pg0 instance is healthy without bypassing pg0."""

from __future__ import annotations

import json
import os
import socket
import sys
import time
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

import psutil
from pg0 import Pg0

NAME = "hindsight-mcp"
PORT = 5432
LOCK_TIMEOUT = 30


class EnsureError(RuntimeError):
    pass


@contextmanager
def _lock(path: Path) -> Iterator[None]:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a+b") as lock:
        os.set_inheritable(lock.fileno(), False)
        if os.name == "nt":
            import msvcrt

            lock.seek(0, os.SEEK_END)
            if lock.tell() == 0:
                lock.write(b"0")
                lock.flush()
            deadline = time.monotonic() + LOCK_TIMEOUT
            while True:
                try:
                    lock.seek(0)
                    msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
                    break
                except OSError:
                    if time.monotonic() >= deadline:
                        raise EnsureError("timed out waiting for pg0 lock")
                    time.sleep(0.1)
            try:
                yield
            finally:
                lock.seek(0)
                msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl

            deadline = time.monotonic() + LOCK_TIMEOUT
            while True:
                try:
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except BlockingIOError:
                    if time.monotonic() >= deadline:
                        raise EnsureError("timed out waiting for pg0 lock")
                    time.sleep(0.1)
            try:
                yield
            finally:
                fcntl.flock(lock, fcntl.LOCK_UN)


def _alive(pid: int | None) -> bool:
    return bool(pid and psutil.pid_exists(pid))


def _same_path(left: str, right: str) -> bool:
    try:
        return os.path.samefile(left, right)
    except OSError:
        return False


def _pidfile(data_dir: Path) -> tuple[int | None, str | None]:
    try:
        lines = (data_dir / "postmaster.pid").read_text(encoding="utf-8").splitlines()
        return int(lines[0]), lines[1]
    except (OSError, ValueError, IndexError):
        return None, None


def _ready(instance: Pg0, metadata: dict) -> bool:
    info = instance.info()
    pid, pid_data_dir = _pidfile(Path(metadata["data_dir"]))
    if not info.running or info.pid != pid or metadata.get("pid") != pid:
        return False
    if info.port != PORT or metadata.get("port") != PORT:
        return False
    if not info.data_dir or not _same_path(info.data_dir, metadata["data_dir"]):
        return False
    if not pid_data_dir or not _same_path(pid_data_dir, metadata["data_dir"]):
        return False
    try:
        with socket.create_connection(("127.0.0.1", PORT), timeout=2):
            return True
    except OSError:
        return False


def ensure(cache_dir: Path) -> None:
    with _lock(cache_dir / "hindsight-pg0.lock"):
        instance = Pg0(name=NAME, port=PORT)
        info = instance.info()
        bootstrap = not info.data_dir

        if bootstrap:
            home = Path.home()
            if os.name == "nt":
                user_profile = os.environ.get("USERPROFILE")
                if not user_profile or not _same_path(str(home), user_profile):
                    raise EnsureError("cannot determine the pg0 home directory")
            pg0_root = home / ".pg0"
            if pg0_root.exists() and not pg0_root.is_dir():
                raise EnsureError("pg0 root is not a directory")
            instance_dir = pg0_root / "instances" / NAME
            data_dir = instance_dir / "data"
            metadata_path = instance_dir / "instance.json"
            if any(path.exists() or path.is_symlink() for path in (metadata_path, data_dir)):
                raise EnsureError("pg0 metadata is missing but instance files already exist")
            if instance_dir.is_symlink() or (
                instance_dir.exists() and any(instance_dir.iterdir())
            ):
                raise EnsureError("pg0 instance directory exists without metadata")
            from hindsight_api.pg0 import (
                DEFAULT_DATABASE,
                DEFAULT_PASSWORD,
                DEFAULT_USERNAME,
            )

            metadata = {
                "data_dir": str(data_dir),
                "database": DEFAULT_DATABASE,
                "password": DEFAULT_PASSWORD,
                "port": PORT,
                "username": DEFAULT_USERNAME,
            }
        else:
            metadata_path = Path(info.data_dir).parent / "instance.json"
            try:
                metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as exc:
                raise EnsureError("cannot read pg0 instance metadata") from exc
            if metadata.get("port") != PORT:
                raise EnsureError("pg0 instance metadata has an unexpected port")
            data_dir = metadata.get("data_dir")
            if not data_dir or not _same_path(info.data_dir, data_dir):
                raise EnsureError("pg0 metadata and instance data directory disagree")

        pid, pid_data_dir = _pidfile(Path(data_dir))
        active_pids = [candidate for candidate in (info.pid, metadata.get("pid"), pid) if _alive(candidate)]
        if active_pids:
            if not (
                info.running
                and info.pid == metadata.get("pid") == pid
                and pid_data_dir
                and _same_path(pid_data_dir, data_dir)
                and info.port == metadata.get("port") == PORT
            ):
                raise EnsureError("live pg0 process disagrees with its metadata or pidfile")
            if not _ready(instance, metadata):
                raise EnsureError("live pg0 instance is not ready or metadata is inconsistent")
            return

        try:
            instance = Pg0(
                name=NAME,
                port=PORT,
                username=metadata["username"],
                password=metadata["password"],
                database=metadata["database"],
                data_dir=str(data_dir),
            )
            instance.start()
        except Exception as exc:  # noqa: BLE001 - pg0 may include credentials in stderr
            raise EnsureError(f"pg0 start failed ({type(exc).__name__})") from None

        try:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise EnsureError("cannot read pg0 metadata after start") from exc
        if not _ready(instance, metadata):
            raise EnsureError("pg0 did not become ready with matching metadata")


def main() -> int:
    try:
        ensure(Path(os.environ["HS_CACHE_DIR"]))
        return 0
    except EnsureError as exc:
        print(f"hindsight pg0 ensure failed: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:  # noqa: BLE001 - keep unexpected diagnostics safe
        print(f"hindsight pg0 ensure failed: {type(exc).__name__}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

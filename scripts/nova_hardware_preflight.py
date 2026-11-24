#!/usr/bin/env python3
"""Read-only NOVA hardware inventory; does not load a model or start training.

Run on the target workstation with:
    python3 scripts/nova_hardware_preflight.py

The report contains hardware/software inventory only. This script never reads
environment variables, calls a network service, downloads weights, or writes a
report file unless the shell is explicitly redirected by the operator.
"""
from __future__ import annotations

import importlib.util
import json
import os
import platform
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def gib(value: int | None) -> float | None:
    return round(value / (1024 ** 3), 2) if value is not None else None


def cpu_model() -> str | None:
    if sys.platform.startswith("linux"):
        try:
            for line in Path("/proc/cpuinfo").read_text(encoding="utf-8", errors="replace").splitlines():
                if line.lower().startswith(("model name", "hardware")):
                    return line.split(":", 1)[-1].strip() or None
        except OSError:
            pass
    return platform.processor() or None


def memory_bytes() -> dict[str, int | None]:
    if sys.platform.startswith("linux"):
        values: dict[str, int] = {}
        try:
            for line in Path("/proc/meminfo").read_text(encoding="ascii", errors="replace").splitlines():
                key, _, remainder = line.partition(":")
                if key in {"MemTotal", "MemAvailable"}:
                    amount = remainder.strip().split()[0]
                    values[key] = int(amount) * 1024
        except (OSError, ValueError, IndexError):
            pass
        return {"total": values.get("MemTotal"), "available": values.get("MemAvailable")}

    try:
        page_size = int(os.sysconf("SC_PAGE_SIZE"))
        total_pages = int(os.sysconf("SC_PHYS_PAGES"))
        available_pages = int(os.sysconf("SC_AVPHYS_PAGES"))
        return {"total": page_size * total_pages, "available": page_size * available_pages}
    except (AttributeError, OSError, ValueError):
        return {"total": None, "available": None}


def nvidia_smi() -> list[dict[str, Any]]:
    executable = shutil.which("nvidia-smi")
    if not executable:
        return []
    try:
        result = subprocess.run(
            [executable, "--query-gpu=name,memory.total,memory.free,driver_version", "--format=csv,noheader,nounits"],
            check=False,
            capture_output=True,
            text=True,
            timeout=3,
            stdin=subprocess.DEVNULL,
        )
    except (OSError, subprocess.TimeoutExpired):
        return []
    if result.returncode != 0:
        return []

    devices = []
    for row in result.stdout.splitlines():
        columns = [part.strip() for part in row.split(",")]
        if len(columns) < 4:
            continue
        try:
            total_mib = int(columns[1])
            free_mib = int(columns[2])
        except ValueError:
            continue
        devices.append({
            "name": columns[0],
            "memoryTotalBytes": total_mib * 1024 ** 2,
            "memoryFreeBytes": free_mib * 1024 ** 2,
            "driverVersion": columns[3],
            "source": "nvidia-smi",
        })
    return devices


def accelerator_inventory() -> dict[str, Any]:
    torch_installed = importlib.util.find_spec("torch") is not None
    if torch_installed:
        try:
            import torch  # type: ignore[import-not-found]

            if torch.cuda.is_available():
                devices = []
                for index in range(torch.cuda.device_count()):
                    props = torch.cuda.get_device_properties(index)
                    try:
                        free_bytes, total_bytes = torch.cuda.mem_get_info(index)
                    except (RuntimeError, TypeError):
                        free_bytes, total_bytes = None, int(props.total_memory)
                    devices.append({
                        "index": index,
                        "name": props.name,
                        "memoryTotalBytes": total_bytes,
                        "memoryFreeBytes": free_bytes,
                        "backend": "ROCm/HIP" if getattr(torch.version, "hip", None) else "CUDA",
                        "source": "PyTorch",
                    })
                return {
                    "detected": True,
                    "backend": "ROCm/HIP" if getattr(torch.version, "hip", None) else "CUDA",
                    "devices": devices,
                    "torchVersion": str(torch.__version__),
                    "torchCudaVersion": getattr(torch.version, "cuda", None),
                    "torchHipVersion": getattr(torch.version, "hip", None),
                }

            mps_available = bool(getattr(torch.backends, "mps", None) and torch.backends.mps.is_available())
            if mps_available:
                return {
                    "detected": True,
                    "backend": "Apple MPS",
                    "devices": [{"name": "Apple Metal device", "memoryTotalBytes": None, "memoryFreeBytes": None, "source": "PyTorch"}],
                    "torchVersion": str(torch.__version__),
                }

            # PyTorch may be CPU-only while the NVIDIA driver can still identify
            # a GPU. Prefer the driver inventory when it is available.
            driver_devices = nvidia_smi()
            if driver_devices:
                return {
                    "detected": True,
                    "backend": "NVIDIA driver (PyTorch CUDA unavailable)",
                    "devices": driver_devices,
                    "torchVersion": str(torch.__version__),
                    "torchCudaVersion": getattr(torch.version, "cuda", None),
                }
            return {
                "detected": False,
                "backend": None,
                "devices": [],
                "torchVersion": str(torch.__version__),
                "note": "PyTorch is installed but reports no CUDA, ROCm/HIP, or MPS device.",
            }
        except Exception as error:  # inventory should report a probe failure, not start training
            return {
                "detected": False,
                "backend": None,
                "devices": [],
                "torchInstalled": True,
                "probeError": type(error).__name__,
            }

    driver_devices = nvidia_smi()
    return {
        "detected": bool(driver_devices),
        "backend": "NVIDIA driver" if driver_devices else None,
        "devices": driver_devices,
        "torchInstalled": False,
        "note": None if driver_devices else "PyTorch is not installed and nvidia-smi found no NVIDIA device; other accelerators may not be enumerated.",
    }


def main() -> None:
    memory = memory_bytes()
    try:
        disk_free = shutil.disk_usage(Path.cwd()).free
    except OSError:
        disk_free = None

    report = {
        "schemaVersion": 1,
        "purpose": "read-only hardware preflight",
        "collectedAt": datetime.now(timezone.utc).isoformat(),
        "trainingStarted": False,
        "modelSelected": False,
        "networkAccess": False,
        "system": {
            "os": platform.system(),
            "osRelease": platform.release(),
            "architecture": platform.machine(),
            "pythonVersion": platform.python_version(),
        },
        "cpu": {
            "model": cpu_model(),
            "logicalCores": os.cpu_count(),
        },
        "memory": {
            "totalBytes": memory["total"],
            "availableBytes": memory["available"],
            "totalGiB": gib(memory["total"]),
            "availableGiB": gib(memory["available"]),
        },
        "storage": {"freeBytes": disk_free, "freeGiB": gib(disk_free)},
        "accelerators": accelerator_inventory(),
    }
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

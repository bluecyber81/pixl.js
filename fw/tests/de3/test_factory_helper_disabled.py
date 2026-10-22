"""Static check only: never invokes the factory helper, a shell, or hardware."""
import re
from pathlib import Path


def main():
    source = Path(__file__).resolve().parents[2] / "scripts" / "fw_update.bat"
    text = source.read_text(encoding="ascii")
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    # A deliberately tiny allowed grammar excludes executable downloads,
    # programmers, conditional jumps, command chaining, and variable expansion.
    for line in lines:
        assert re.fullmatch(r"@rem [A-Za-z0-9 .,:'/-]+|@echo off|echo [A-Za-z0-9 .,:'/-]+|exit /b 1", line), line
    assert lines[-1] == "exit /b 1"
    assert sum(line == "exit /b 1" for line in lines) == 1
    assert "application-only Bluetooth OTA" in text
    assert "Bootloader and SoftDevice must remain unchanged" in text
    print("PASS: legacy factory helper is a nonzero-exit OTA notice; no hardware command is executable")


if __name__ == "__main__":
    main()

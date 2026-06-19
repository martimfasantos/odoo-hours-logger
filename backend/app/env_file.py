from pathlib import Path

# backend/.env — the file pydantic-settings reads when the server runs with cwd=backend.
# Kept as a module-level variable so tests can monkeypatch it.
ENV_PATH = Path(__file__).resolve().parent.parent / ".env"


def read_env() -> dict[str, str]:
    """Parse ENV_PATH into a KEY→VALUE dict.

    Ignores blank lines and comment lines (starting with #).
    Returns an empty dict if the file is missing.
    """
    if not ENV_PATH.exists():
        return {}
    result: dict[str, str] = {}
    for line in ENV_PATH.read_text().splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if "=" in stripped:
            key, _, value = stripped.partition("=")
            result[key.strip()] = value
    return result


def write_env(updates: dict[str, str]) -> None:
    """Update ENV_PATH in place.

    For each key in *updates*, replaces its existing ``KEY=...`` line or
    appends ``KEY=value`` if absent.  Preserves all other lines, comments,
    and ordering.  Creates the file if missing.  Values are written verbatim
    (no quoting).
    """
    if ENV_PATH.exists():
        lines = ENV_PATH.read_text().splitlines(keepends=True)
    else:
        ENV_PATH.parent.mkdir(parents=True, exist_ok=True)
        lines = []

    remaining = dict(updates)  # keys yet to be written

    new_lines: list[str] = []
    for line in lines:
        stripped = line.rstrip("\n").rstrip("\r")
        if "=" in stripped and not stripped.lstrip().startswith("#"):
            key = stripped.partition("=")[0].strip()
            if key in remaining:
                new_lines.append(f"{key}={remaining.pop(key)}\n")
                continue
        new_lines.append(line if line.endswith("\n") else line + "\n")

    # Append any keys that were not already present.
    for key, value in remaining.items():
        new_lines.append(f"{key}={value}\n")

    ENV_PATH.write_text("".join(new_lines))

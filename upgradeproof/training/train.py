"""Train the tiny action selector and write src/upgradeproof/data/action_model.json."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from upgradeproof.cpu_model import dump_model, train  # noqa: E402


def main() -> None:
    rows = [
        json.loads(line)
        for line in (ROOT / "training" / "synthetic.jsonl").read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    model = train(rows)
    destination = ROOT / "src" / "upgradeproof" / "data" / "action_model.json"
    dump_model(model, destination)
    print(destination)


if __name__ == "__main__":
    main()

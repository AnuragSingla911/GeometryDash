"""A tiny linear selector. It scores bounded actions; it does not write code.

Trained only on ``training/synthetic.jsonl``. Challenge tests are not training rows.
"""

from __future__ import annotations

import json
import math
import re
from pathlib import Path

from upgradeproof.actions import Action

_CAMEL = re.compile(r"[A-Z]?[a-z]+|[A-Z]+(?![a-z])|\d+")
_WORD = re.compile(r"[A-Za-z0-9]+")

_DATA = Path(__file__).resolve().parent / "data" / "action_model.json"


def tokens(text: str) -> set[str]:
    found: set[str] = set()
    for word in _WORD.findall(text or ""):
        found.add(word.lower())
        for piece in _CAMEL.findall(word):
            if len(piece) > 1:
                found.add(piece.lower())
    return {token for token in found if len(token) > 1}


def featurize(failure_text: str, action: Action) -> dict[str, float]:
    failure = tokens(failure_text)
    candidate = tokens(action.candidate_text)
    features = {f"s:{token}": 1.0 for token in sorted(failure & candidate)}
    features[f"k:{action.kind}"] = 1.0
    if action.broad:
        features["broad"] = 1.0
    return features


class ActionModel:
    def __init__(self, bias: float, weights: dict[str, float], threshold: float, margin: float):
        self.bias = bias
        self.weights = weights
        self.threshold = threshold
        self.margin = margin

    @classmethod
    def load(cls, path: Path | None = None) -> "ActionModel":
        payload = json.loads((path or _DATA).read_text(encoding="utf-8"))
        return cls(
            bias=float(payload["bias"]),
            weights={key: float(value) for key, value in payload["weights"].items()},
            threshold=float(payload["threshold"]),
            margin=float(payload["margin"]),
        )

    def probability(self, failure_text: str, action: Action) -> float:
        score = self.bias
        for key, value in featurize(failure_text, action).items():
            score += self.weights.get(key, 0.0) * value
        return _sigmoid(score)

    def select(self, failure_text: str, actions: list[Action]) -> tuple[Action | None, list[dict]]:
        if not actions:
            return None, []
        scored = []
        for action in actions:
            probability = self.probability(failure_text, action)
            scored.append({"id": action.id, "probability": round(probability, 4)})
        scored.sort(key=lambda item: item["probability"], reverse=True)
        best = scored[0]
        second = scored[1]["probability"] if len(scored) > 1 else 0.0
        if best["probability"] < self.threshold or best["probability"] - second < self.margin:
            return None, scored
        chosen = next(action for action in actions if action.id == best["id"])
        return chosen, scored


def train(examples: list[dict], epochs: int = 500, learning_rate: float = 0.35, l2: float = 0.001) -> ActionModel:
    weights: dict[str, float] = {}
    bias = 0.0
    for _ in range(epochs):
        grad_w: dict[str, float] = {}
        grad_b = 0.0
        for example in examples:
            action = Action(
                id="train",
                kind=example["kind"],
                summary="",
                origin="train",
                candidate_text=example["candidate"],
                broad=bool(example.get("broad")),
            )
            features = featurize(example["failure"], action)
            probability = _sigmoid(bias + sum(weights.get(key, 0.0) * value for key, value in features.items()))
            error = probability - float(example["label"])
            grad_b += error
            for key, value in features.items():
                grad_w[key] = grad_w.get(key, 0.0) + error * value
        scale = 1 / max(len(examples), 1)
        bias -= learning_rate * grad_b * scale
        keys = set(weights) | set(grad_w)
        for key in keys:
            weights[key] = weights.get(key, 0.0) - learning_rate * (
                grad_w.get(key, 0.0) * scale + l2 * weights.get(key, 0.0)
            )
    return ActionModel(bias=bias, weights=weights, threshold=0.6, margin=0.12)


def dump_model(model: ActionModel, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "version": 1,
        "bias": model.bias,
        "threshold": model.threshold,
        "margin": model.margin,
        "weights": dict(sorted(model.weights.items())),
        "notes": "Trained from training/synthetic.jsonl. Challenge cases are not rows in that file.",
    }
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def _sigmoid(value: float) -> float:
    if value > 30:
        return 1.0
    if value < -30:
        return 0.0
    return 1 / (1 + math.exp(-value))

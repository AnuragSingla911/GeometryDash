# Allowed changes and review

## The harness may change

- The pinned version of the one selected dependency in `requirements.txt`.
- Python source under `src/`, and only through a bounded action: keyword rename, symbol rename, except-type rename, string-field insert, or a full-file replacement used by adversarial checks.

## The harness must reject

- Any change under `tests/`, including a change that keeps the same number of assertions.
- A deleted or weakened `assert`.
- Edits to `README`, configuration, or any path outside the allowed prefixes.
- A pin edit that adds a second requirement or changes a different package.
- A patch larger than the line budget in `Limits`.
- A candidate rule that has not been moved into `rules/promoted/`. Files written by `upgradeproof promote` are proposals.

## Review standard for promoting a rule

A reviewer accepts a rule only when all of these are true:

- The preconditions name the package and the target version.
- The preconditions cite the error type and, for an ambiguous repair, the failing test name or another narrow pattern.
- The action is one of the bounded kinds above.
- The sealed oracle passed for that action, and a broader action (such as `except Exception`) was not the one promoted.
- The reviewer can say what later case should **not** match.

Ship the accepted file under `rules/promoted/`. Leave everything else as a candidate.

## Evidence standard

`verified_repair` and `verified_bump` are the only verdicts that count as verified successes. Both require a green baseline. A repair also requires a red upgrade, a policy-clean diff, a green public retest, and a green sealed oracle. Report model calls and API cost next to the verdict. CPU and deterministic cost stay at zero. Do not convert runner minutes into a fabricated model price.

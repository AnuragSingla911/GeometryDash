# UpgradeProof

UpgradeProof answers one question for a small Python project:

> Can this project upgrade dependency X from version A to version B? If it breaks, show why and produce the smallest verified fix.

It is a feasibility harness, not a general dependency bot. A passing run is evidence about the tests that ran. It is not a proof of universal compatibility.

## What the first milestone measures

| Piece | What it actually does |
|---|---|
| Deterministic mode | Promoted rules and structural checks. No model call. |
| CPU mode | The same checks. A tiny linear model chooses only when those checks abstain. |
| Paid mode | Off unless you set every paid variable. No automatic fallback. |
| Challenge suite | Five newly authored upgrades, plus adversarial cases. |
| Evidence | Baseline, breakage, patch, public retest, sealed oracle, time, model calls, cost. |

The CPU model does not write source. It scores repair actions that the analyzer already enumerated (rename this keyword, catch this exception, and so on). That is deliberate: the question for this milestone is how much of the decision can be checked, not how large a code generator we can host.

GitHub Models, including its inference API, was retired on 30 July 2026. This project does not call it. See the [GitHub Models retirement note](https://docs.github.com/en/github-models).

## Five challenge cases

| Case | Breakage | What a successful run must do |
|---|---|---|
| `tint_colour` | `color=` was renamed to `colour` | Apply the promoted rule and pass the sealed oracle |
| `bell_rename` | `say_hello` was renamed to `greet` | Follow the package `RENAME` line |
| `banner_text` | `banner()` returns `Banner` instead of `str` | Read the single string field |
| `ages_split` | `LegacyError` was removed and two replacements are documented | Deterministic mode abstains. CPU mode must pick `InputError` without swallowing `RegistryDown` |
| `note_patch` | Docstring-only release | Return a verified version bump and no code change |

`ages_split` is the case that separates the two modes. The migration note lists both `InputError` (blank or malformed values) and `StateError` (closed registry). Only one of those repairs preserves the sealed test. A repair that catches `Exception` passes the public tests and fails the oracle. The harness records that as a regression, not a success.

## Adversarial behavior

| Situation | Harness result |
|---|---|
| Original project already fails | `invalid_baseline` |
| Upgrade needs no code change | `verified_bump` |
| Proposed edit deletes or rewrites a test | `rejected`, reason `protected_test_modification` |
| Proposed edit touches an unrelated file | `rejected`, reason `patch_scope` |
| Patch calls an API that does not exist | `unresolved`, reason `unknown_api` |
| New release depends on a package that is not available | `constraint_conflict` |
| Tool failures reach the limit | `unresolved`, reason `retry_limit` |
| Public tests pass but no sealed oracle exists | `unresolved`, reason `evidence_insufficient` |
| Public tests pass and the sealed oracle fails | `regression` |

## Limits

One investigation does one dependency upgrade, at most two repair attempts, and stops after two failed tool calls. The in-process deadline is 120 seconds. The GitHub Actions job timeout is 20 minutes. Context sent to a selector is capped at 8,000 characters. Paid inference is not contacted unless all of these are set:

- `UPGRADEPROOF_ALLOW_PAID=1`
- `UPGRADEPROOF_PAID_MODEL`
- `UPGRADEPROOF_PAID_BASE_URL`
- `UPGRADEPROOF_PAID_API_KEY`

`UPGRADEPROOF_PAID_PRICE_PER_CALL` is optional. If you omit it, the run still refuses to invent a price. Deterministic and CPU runs record API cost as `0`.

## Run it

```bash
cd upgradeproof
python3 -m pip install pytest
PYTHONPATH=src python3 -m pytest
PYTHONPATH=src python3 -m upgradeproof benchmark --out artifacts
```

The benchmark writes `artifacts/results.md` and refreshes `site/results.json` for the static dashboard. Open `site/index.html`.

One case:

```bash
PYTHONPATH=src python3 -m upgradeproof run --case cases/challenge/tint_colour --mode deterministic
```

Promote a verified repair into a **candidate** rule. Candidates are not executed. A person moves a reviewed file into `rules/promoted/`.

```bash
PYTHONPATH=src python3 -m upgradeproof promote --report artifacts/bell.json --out rules/candidates/bell.json
```

## How a repair becomes a rule

1. The first ambiguous encounter asks the CPU selector, or a paid model if that mode was explicitly enabled.
2. The sealed tests accept or reject the selected action.
3. `upgradeproof promote` writes a candidate rule whose preconditions include the error type and the failing test name.
4. After a maintainer puts that file in `rules/promoted/`, a later run uses the rule and does not call a model.
5. If the preconditions do not hold, the harness abstains or investigates again. It does not stretch the rule.

`rules/promoted/tintlib-color-to-colour.json` is the one rule shipped with this milestone. It matches `tintlib` 1.1.0 only. `echo_partial` has the same keyword rename on a different package and does not use that rule.

## Datasets

**Challenge suite** (`cases/challenge/`): small applications and both versions of a toy dependency. Written for this repository on 31 October 2026. The repair workspace never receives `sealed/` or `case.json`. Each sealed file contains the marker `ORACLE_CANARY` so a leak fails the run.

**Historical catalog** (`cases/historical/catalog.json`): citations of public breakages in Django 4.0, NumPy 1.24, and Pydantic v2. They are not executed, and their source is not copied. Historical fixes may already be in a model's training data. This benchmark does not claim to be contamination-free. The synthetic training file `training/synthetic.jsonl` uses the same vocabulary as the exception case (blank, malformed, closed, registry). It does not contain the challenge tests.

Reproducible cases whose original environment cannot be rebuilt are left out of the executable suite.

## GitHub Actions

`benchmark.yml` checks out the repo, installs pytest, runs the unit tests and the benchmark, and uploads the evidence directory. Permissions are `contents: read`. The job does not open pull requests and does not receive a write token.

On a public repository, standard GitHub-hosted Linux runners are free; larger runners are billed, and artifacts have a separate allowance. This workflow uses `ubuntu-latest` and keeps what it uploads small. [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

The dashboard under `site/` is a static page. [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages) can publish that directory when this project is the repository being published. Do not point an existing site at it.

## Layout

| Path | Responsibility |
|---|---|
| `workflow.md` | Investigation procedure |
| `agent.md` | Investigator role and evidence bar |
| `SKILL.md` | Migration reading rules for the packages under test |
| `rules.md` | Allowed edits and review standard |
| `src/upgradeproof/` | Parse, classify, select, edit, test, report |
| `src/upgradeproof/mcp_server.py` | The same functions behind a small MCP tool list |
| `rules/promoted/` | Machine-readable rules a maintainer has accepted |
| `cases/` | Challenge fixtures and the historical catalog |
| `site/` | Static results dashboard |

The MCP server exposes `list_files`, `read_file`, `get_package_metadata`, `classify_failure`, and `validate_sources`. It does not expose a shell. `read_file` cannot leave the workspace, so sealed oracles that were never copied in cannot be read through it.

## License

MIT. See `LICENSE`. Toy packages under `cases/` are part of this repository and use the same license. Third-party projects cited in the historical catalog stay under their own licenses.

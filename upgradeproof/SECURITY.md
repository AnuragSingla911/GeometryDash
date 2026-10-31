# Security notes

UpgradeProof runs repository tests in a subprocess. Treat case code as code you are willing to execute.

- The benchmark workflow requests `contents: read`. It does not have a pull-request or contents-write token. Publishing a patch as a pull request would be a separate job, and this milestone does not have that job.
- The test subprocess gets a fresh environment with `PATH`, `HOME`, and `LANG` only, plus a `PYTHONPATH` limited to the case. Paid API keys are not copied into it.
- Paid HTTP is disabled unless `UPGRADEPROOF_ALLOW_PAID=1` and a model, base URL, and key are all set. A failed paid call does not fall back to another provider.
- MCP `read_file` resolves the path and refuses anything outside the workspace. Sealed tests are not copied into that workspace.
- Do not point the harness at an untrusted repository with more privileges than you would give that repository's own CI.

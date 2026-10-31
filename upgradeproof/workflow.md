# Investigation procedure

One run, one dependency, one direction: version A to version B.

1. **Baseline.** Install the original version and run the project's public tests and the sealed oracle. If either fails, stop with `invalid_baseline`. Do not propose a repair for a project that is already red.
2. **Pin.** Change only the selected requirement to version B.
3. **Resolve.** Read the new package metadata. If it depends on something this sandbox cannot import, stop with `constraint_conflict`.
4. **Reproduce.** Run the public tests again. If they pass, run the sealed oracle. Passing both with an empty code diff is a `verified_bump`. A sealed failure here is a `regression`. Missing sealed tests are `evidence_insufficient`, even if the public tests pass.
5. **Classify.** Apply the deterministic classifiers in `classify.py` to the pytest transcript: unexpected keyword, missing import, missing attribute, or unknown.
6. **Enumerate.** Build a bounded action list from the new package's signatures, `RENAME` lines, exception bullets, and string fields. Add a matching promoted rule in front of that list.
7. **Select.** Use a promoted rule, or the single non-broad structural candidate, with no model call. If several candidates remain, deterministic mode abstains. CPU mode asks the linear selector. Paid mode asks the configured endpoint and stops if that call fails. It does not fall through to another model.
8. **Patch and retest.** Apply the selected action under `src/` only. Reject test edits and unrelated files before retesting. Run the public tests, then the sealed oracle from outside the repair workspace. Two repair attempts is the maximum. Two tool failures stop the run.
9. **Report.** Write the verdict, the diff, the commands' results, model-call count, and estimated API cost. `verified_repair` requires the baseline to have passed, the upgrade to have failed, the patch to have passed policy, and both public and sealed tests to pass on the new version.

The repair process cannot see `sealed/` or the expected verdict in `case.json`.

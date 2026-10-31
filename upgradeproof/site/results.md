# UpgradeProof feasibility results

Passing tests cover only the tests that ran.

| Mode | Verified | Rate | Regressions | Abstentions | Wall clock (s) | Model calls | Cost / verified repair |
|---|---:|---:|---:|---:|---:|---:|---:|
| deterministic | 4/5 | 0.8 | 0 | 1 | 3.2032 | 0 | 0.0 |
| cpu | 5/5 | 1.0 | 0 | 0 | 3.486 | 1 | 0.0 |

| Case | Cohort | Mode | Verdict | Expected | Selector | Model calls |
|---|---|---|---|---|---|---:|
| tint_colour | challenge | deterministic | verified_repair | verified_repair | promoted_rule | 0 |
| tint_colour | challenge | cpu | verified_repair | verified_repair | promoted_rule | 0 |
| bell_rename | challenge | deterministic | verified_repair | verified_repair | deterministic | 0 |
| bell_rename | challenge | cpu | verified_repair | verified_repair | deterministic | 0 |
| banner_text | challenge | deterministic | verified_repair | verified_repair | deterministic | 0 |
| banner_text | challenge | cpu | verified_repair | verified_repair | deterministic | 0 |
| ages_split | challenge | deterministic | unresolved | unresolved | None | 0 |
| ages_split | challenge | cpu | verified_repair | verified_repair | cpu_model | 1 |
| note_patch | challenge | deterministic | verified_bump | verified_bump | None | 0 |
| note_patch | challenge | cpu | verified_bump | verified_bump | None | 0 |
| already_failing | adversarial | deterministic | invalid_baseline | invalid_baseline | None | 0 |
| already_failing | adversarial | cpu | invalid_baseline | invalid_baseline | None | 0 |
| echo_partial | adversarial | deterministic | unresolved | unresolved | deterministic | 0 |
| echo_partial | adversarial | cpu | unresolved | unresolved | deterministic | 0 |
| missing_extra | adversarial | deterministic | constraint_conflict | constraint_conflict | None | 0 |
| missing_extra | adversarial | cpu | constraint_conflict | constraint_conflict | None | 0 |

## Harness checks

| Check | Passed | Detail |
|---|---|---|
| policy_protected_test | True | ['protected_test_modification'] |
| policy_patch_scope | True | ['patch_scope'] |
| tool_retry_limit | True | first-raised,stopped |
| injected_unknown_api | True | verdict=unresolved reasons=['execution_failed', 'unknown_api', 'ambiguous_repair'] |
| injected_delete_test | True | verdict=rejected reasons=['protected_test_modification', 'ambiguous_repair'] |
| injected_unrelated_readme | True | verdict=rejected reasons=['patch_scope', 'ambiguous_repair'] |
| injected_hardcoded_return | True | verdict=regression reasons=['sealed_oracle_failed', 'ambiguous_repair'] |

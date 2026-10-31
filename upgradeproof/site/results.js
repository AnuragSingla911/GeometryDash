window.UPGRADEPROOF_RESULTS = {
  "suite": "upgradeproof-feasibility",
  "version": "0.1.0",
  "generated_at": "2026-10-31T05:39:11.768911+00:00",
  "modes": [
    "deterministic",
    "cpu"
  ],
  "cohorts": {
    "challenge": [
      "tint_colour",
      "bell_rename",
      "banner_text",
      "ages_split",
      "note_patch"
    ],
    "adversarial_cases": [
      "already_failing",
      "echo_partial",
      "missing_extra"
    ]
  },
  "rows": [
    {
      "case_id": "tint_colour",
      "title": "tintlib renames the color parameter to colour",
      "cohort": "challenge",
      "mode": "deterministic",
      "verdict": "verified_repair",
      "expected": "verified_repair",
      "expectation_met": true,
      "verified": true,
      "regression": false,
      "abstained": false,
      "selector": "promoted_rule",
      "wall_clock_seconds": 0.7302,
      "model_calls": 0,
      "estimated_cost_usd": 0.0,
      "reasons": [
        "public_and_sealed_passed"
      ]
    },
    {
      "case_id": "tint_colour",
      "title": "tintlib renames the color parameter to colour",
      "cohort": "challenge",
      "mode": "cpu",
      "verdict": "verified_repair",
      "expected": "verified_repair",
      "expectation_met": true,
      "verified": true,
      "regression": false,
      "abstained": false,
      "selector": "promoted_rule",
      "wall_clock_seconds": 0.7065,
      "model_calls": 0,
      "estimated_cost_usd": 0.0,
      "reasons": [
        "public_and_sealed_passed"
      ]
    },
    {
      "case_id": "bell_rename",
      "title": "belllib renames say_hello to greet",
      "cohort": "challenge",
      "mode": "deterministic",
      "verdict": "verified_repair",
      "expected": "verified_repair",
      "expectation_met": true,
      "verified": true,
      "regression": false,
      "abstained": false,
      "selector": "deterministic",
      "wall_clock_seconds": 0.7608,
      "model_calls": 0,
      "estimated_cost_usd": 0.0,
      "reasons": [
        "public_and_sealed_passed"
      ]
    },
    {
      "case_id": "bell_rename",
      "title": "belllib renames say_hello to greet",
      "cohort": "challenge",
      "mode": "cpu",
      "verdict": "verified_repair",
      "expected": "verified_repair",
      "expectation_met": true,
      "verified": true,
      "regression": false,
      "abstained": false,
      "selector": "deterministic",
      "wall_clock_seconds": 0.7687,
      "model_calls": 0,
      "estimated_cost_usd": 0.0,
      "reasons": [
        "public_and_sealed_passed"
      ]
    },
    {
      "case_id": "banner_text",
      "title": "bannerlib.banner now returns Banner instead of str",
      "cohort": "challenge",
      "mode": "deterministic",
      "verdict": "verified_repair",
      "expected": "verified_repair",
      "expectation_met": true,
      "verified": true,
      "regression": false,
      "abstained": false,
      "selector": "deterministic",
      "wall_clock_seconds": 0.7154,
      "model_calls": 0,
      "estimated_cost_usd": 0.0,
      "reasons": [
        "public_and_sealed_passed"
      ]
    },
    {
      "case_id": "banner_text",
      "title": "bannerlib.banner now returns Banner instead of str",
      "cohort": "challenge",
      "mode": "cpu",
      "verdict": "verified_repair",
      "expected": "verified_repair",
      "expectation_met": true,
      "verified": true,
      "regression": false,
      "abstained": false,
      "selector": "deterministic",
      "wall_clock_seconds": 0.7198,
      "model_calls": 0,
      "estimated_cost_usd": 0.0,
      "reasons": [
        "public_and_sealed_passed"
      ]
    },
    {
      "case_id": "ages_split",
      "title": "ages removes LegacyError and documents two replacements",
      "cohort": "challenge",
      "mode": "deterministic",
      "verdict": "unresolved",
      "expected": "unresolved",
      "expectation_met": true,
      "verified": false,
      "regression": false,
      "abstained": true,
      "selector": null,
      "wall_clock_seconds": 0.4355,
      "model_calls": 0,
      "estimated_cost_usd": 0.0,
      "reasons": [
        "ambiguous_repair"
      ]
    },
    {
      "case_id": "ages_split",
      "title": "ages removes LegacyError and documents two replacements",
      "cohort": "challenge",
      "mode": "cpu",
      "verdict": "verified_repair",
      "expected": "verified_repair",
      "expectation_met": true,
      "verified": true,
      "regression": false,
      "abstained": false,
      "selector": "cpu_model",
      "wall_clock_seconds": 0.7268,
      "model_calls": 1,
      "estimated_cost_usd": 0.0,
      "reasons": [
        "public_and_sealed_passed"
      ]
    },
    {
      "case_id": "note_patch",
      "title": "notelib 1.0.1 changes a docstring only",
      "cohort": "challenge",
      "mode": "deterministic",
      "verdict": "verified_bump",
      "expected": "verified_bump",
      "expectation_met": true,
      "verified": true,
      "regression": false,
      "abstained": false,
      "selector": null,
      "wall_clock_seconds": 0.5613,
      "model_calls": 0,
      "estimated_cost_usd": 0.0,
      "reasons": [
        "tests_passed_without_code_changes"
      ]
    },
    {
      "case_id": "note_patch",
      "title": "notelib 1.0.1 changes a docstring only",
      "cohort": "challenge",
      "mode": "cpu",
      "verdict": "verified_bump",
      "expected": "verified_bump",
      "expectation_met": true,
      "verified": true,
      "regression": false,
      "abstained": false,
      "selector": null,
      "wall_clock_seconds": 0.5642,
      "model_calls": 0,
      "estimated_cost_usd": 0.0,
      "reasons": [
        "tests_passed_without_code_changes"
      ]
    },
    {
      "case_id": "already_failing",
      "title": "The project already fails on the original dependency",
      "cohort": "adversarial",
      "mode": "deterministic",
      "verdict": "invalid_baseline",
      "expected": "invalid_baseline",
      "expectation_met": true,
      "verified": false,
      "regression": false,
      "abstained": false,
      "selector": null,
      "wall_clock_seconds": 0.2875,
      "model_calls": 0,
      "estimated_cost_usd": 0.0,
      "reasons": [
        "invalid_baseline"
      ]
    },
    {
      "case_id": "already_failing",
      "title": "The project already fails on the original dependency",
      "cohort": "adversarial",
      "mode": "cpu",
      "verdict": "invalid_baseline",
      "expected": "invalid_baseline",
      "expectation_met": true,
      "verified": false,
      "regression": false,
      "abstained": false,
      "selector": null,
      "wall_clock_seconds": 0.288,
      "model_calls": 0,
      "estimated_cost_usd": 0.0,
      "reasons": [
        "invalid_baseline"
      ]
    },
    {
      "case_id": "echo_partial",
      "title": "echolib renames a keyword but no sealed oracle is published",
      "cohort": "adversarial",
      "mode": "deterministic",
      "verdict": "unresolved",
      "expected": "unresolved",
      "expectation_met": true,
      "verified": false,
      "regression": false,
      "abstained": true,
      "selector": "deterministic",
      "wall_clock_seconds": 0.4288,
      "model_calls": 0,
      "estimated_cost_usd": 0.0,
      "reasons": [
        "evidence_insufficient"
      ]
    },
    {
      "case_id": "echo_partial",
      "title": "echolib renames a keyword but no sealed oracle is published",
      "cohort": "adversarial",
      "mode": "cpu",
      "verdict": "unresolved",
      "expected": "unresolved",
      "expectation_met": true,
      "verified": false,
      "regression": false,
      "abstained": true,
      "selector": "deterministic",
      "wall_clock_seconds": 0.424,
      "model_calls": 0,
      "estimated_cost_usd": 0.0,
      "reasons": [
        "evidence_insufficient"
      ]
    },
    {
      "case_id": "missing_extra",
      "title": "The new release requires a package this sandbox cannot provide",
      "cohort": "adversarial",
      "mode": "deterministic",
      "verdict": "constraint_conflict",
      "expected": "constraint_conflict",
      "expectation_met": true,
      "verified": false,
      "regression": false,
      "abstained": false,
      "selector": null,
      "wall_clock_seconds": 0.2848,
      "model_calls": 0,
      "estimated_cost_usd": 0.0,
      "reasons": [
        "constraint_conflict",
        "missinglib==1.2.3"
      ]
    },
    {
      "case_id": "missing_extra",
      "title": "The new release requires a package this sandbox cannot provide",
      "cohort": "adversarial",
      "mode": "cpu",
      "verdict": "constraint_conflict",
      "expected": "constraint_conflict",
      "expectation_met": true,
      "verified": false,
      "regression": false,
      "abstained": false,
      "selector": null,
      "wall_clock_seconds": 0.2853,
      "model_calls": 0,
      "estimated_cost_usd": 0.0,
      "reasons": [
        "constraint_conflict",
        "missinglib==1.2.3"
      ]
    }
  ],
  "checks": [
    {
      "id": "policy_protected_test",
      "passed": true,
      "detail": "['protected_test_modification']"
    },
    {
      "id": "policy_patch_scope",
      "passed": true,
      "detail": "['patch_scope']"
    },
    {
      "id": "tool_retry_limit",
      "passed": true,
      "detail": "first-raised,stopped"
    },
    {
      "id": "injected_unknown_api",
      "passed": true,
      "detail": "verdict=unresolved reasons=['execution_failed', 'unknown_api', 'ambiguous_repair']"
    },
    {
      "id": "injected_delete_test",
      "passed": true,
      "detail": "verdict=rejected reasons=['protected_test_modification', 'ambiguous_repair']"
    },
    {
      "id": "injected_unrelated_readme",
      "passed": true,
      "detail": "verdict=rejected reasons=['patch_scope', 'ambiguous_repair']"
    },
    {
      "id": "injected_hardcoded_return",
      "passed": true,
      "detail": "verdict=regression reasons=['sealed_oracle_failed', 'ambiguous_repair']"
    }
  ],
  "aggregates": {
    "deterministic": {
      "challenge_cases": 5,
      "verified_successes": 4,
      "verified_success_rate": 0.8,
      "verified_repairs": 3,
      "verified_bumps": 1,
      "regressions": 0,
      "abstentions": 1,
      "wall_clock_seconds": 3.2032,
      "model_calls": 0,
      "estimated_cost_usd": 0.0,
      "cost_per_verified_repair_usd": 0.0
    },
    "cpu": {
      "challenge_cases": 5,
      "verified_successes": 5,
      "verified_success_rate": 1.0,
      "verified_repairs": 4,
      "verified_bumps": 1,
      "regressions": 0,
      "abstentions": 0,
      "wall_clock_seconds": 3.486,
      "model_calls": 1,
      "estimated_cost_usd": 0.0,
      "cost_per_verified_repair_usd": 0.0
    }
  },
  "notes": [
    "Challenge cases were newly authored for this repository. They are not a contamination-free claim about language models.",
    "The CPU path is a tiny linear selector over bounded actions, trained on training/synthetic.jsonl. It is not a generative code model.",
    "Verified means the original tests passed, the upgrade failed or needed no code change, and the sealed oracle passed. It does not prove universal compatibility.",
    "GitHub Models was retired on 30 July 2026, including its inference API. This harness does not call it.",
    "Deterministic and CPU runs record API cost as 0. Paid mode is off unless UPGRADEPROOF_ALLOW_PAID, a model, a base URL, and an API key are all set."
  ]
};

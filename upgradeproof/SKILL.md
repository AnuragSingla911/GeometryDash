# Migration reading

Use this when classifying a failure against the package that was just installed. Prefer a structural fact over a guess.

## Signatures

Read the new module with the AST. For `TypeError: ... unexpected keyword argument 'color'`, list the parameters of the named callable. A replacement parameter must be within edit distance 2 and must not be identical. Zero matches or two matches means this skill does not choose. One match is a deterministic rename of that keyword at the call.

## `RENAME` lines

A migration file may contain a machine-readable line:

```text
RENAME say_hello -> greet
```

Apply it only when the missing imported name is exactly the left-hand side. Do not fuzzy-match `say_hello` to `greet` without that line. Names that far apart are not a structural rename.

## Exception splits

Bullets of the form `- InputError: blank or malformed values` become candidates, not winners. Also consider that a broad `except Exception` will often satisfy a public test that only checks the happy path and the blank path. Do not select the broad catch.

If the transcript shows one candidate's exception class as the error being handled, and does not show the others, that observation belongs in the failure text the selector sees. It is not itself a promoted rule.

## Returned objects

If `'Banner' object has no attribute 'upper'` and `upper` is a string method, look for string fields assigned in `Banner.__init__` from annotated `str` parameters. Exactly one such field is a deterministic insert (`value.text.upper()`). Zero or several is an abstention.

## Rules you may apply without a model

A file in `rules/promoted/` runs only when every precondition holds: package name, target version, error type, message or failure pattern, and any signature check. A rule for `tintlib` does not apply to another package that made the same rename.

## Training boundary

`training/synthetic.jsonl` is the only corpus for the CPU selector. Do not add challenge tests or sealed oracles to it. If a new failure needs a new word, add a synthetic row and retrain with `python3 training/train.py`.

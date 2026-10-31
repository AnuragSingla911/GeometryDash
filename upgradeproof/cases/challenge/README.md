# Challenge cases

These applications and both versions of each toy dependency were written for UpgradeProof. They are not forks of an upstream project.

`sealed/` is the oracle. The harness copies `app/` into a temporary workspace and does not copy `sealed/`. Oracle files contain the string `ORACLE_CANARY`. If that string shows up in the repair workspace, the run fails closed.

`echo_partial` is the same kind of keyword rename as `tint_colour`, on a package with no promoted rule and no sealed tests. A public-only pass must stay `unresolved`.

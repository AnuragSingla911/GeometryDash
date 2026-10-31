from demo.app import render

# ORACLE_CANARY banner sealed oracle.


def test_oracle_other_input():
    assert render("x y") == "X Y"

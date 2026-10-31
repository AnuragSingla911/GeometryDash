from demo.app import show

# ORACLE_CANARY note sealed oracle.


def test_oracle_other():
    assert show("b") == "note:b"

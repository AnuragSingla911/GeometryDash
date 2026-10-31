from demo.app import show

# ORACLE_CANARY already failing sealed oracle.


def test_oracle_real_behavior():
    assert show("a") == "note:a"

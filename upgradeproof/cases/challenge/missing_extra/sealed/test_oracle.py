from demo.app import show

# ORACLE_CANARY missing extra sealed oracle.


def test_oracle():
    assert show("z") == "note:z"

from demo.app import hello

# ORACLE_CANARY bell sealed oracle.


def test_oracle_other_name():
    assert hello("Grace") == "hello Grace"

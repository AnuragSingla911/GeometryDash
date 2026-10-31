from demo.app import swatch

# ORACLE_CANARY tint sealed oracle is hidden from the repair workspace.


def test_oracle_preserves_other_names():
    assert swatch("Blue") == "color: Blue"

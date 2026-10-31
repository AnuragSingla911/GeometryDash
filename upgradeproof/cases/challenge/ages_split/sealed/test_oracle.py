import ages
import pytest

from demo.app import age_label

# ORACLE_CANARY ages sealed oracle.


def test_oracle_zero():
    assert age_label("0") == "age=0"


def test_oracle_closed_registry_propagates():
    ages.close_registry()
    try:
        with pytest.raises(ages.RegistryDown):
            age_label("3")
    finally:
        ages.open_registry()

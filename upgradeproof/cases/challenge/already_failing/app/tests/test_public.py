from demo.app import show


def test_show_wrong_expectation():
    assert show("a") == "nope"

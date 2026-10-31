from demo.app import show


def test_show():
    assert show("a") == "note:a"

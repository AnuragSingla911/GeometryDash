from demo.app import shout


def test_shout():
    assert shout("red") == "color: red"

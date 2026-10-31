from demo.app import swatch


def test_swatch():
    assert swatch("red") == "color: red"

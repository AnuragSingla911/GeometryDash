from demo.app import hello


def test_hello():
    assert hello("Ada") == "hello Ada"

from demo.app import render


def test_render_strips_and_uppercases():
    assert render(" Ann ") == "ANN"

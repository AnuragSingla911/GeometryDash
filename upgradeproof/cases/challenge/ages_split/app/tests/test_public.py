from demo.app import age_label


def test_blank_is_invalid():
    assert age_label("   ") == "invalid"


def test_number():
    assert age_label("20") == "age=20"

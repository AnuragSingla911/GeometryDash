from upgradeproof.editing import (
    insert_field_before_method,
    rename_except_attribute,
    rename_keyword_calls,
    rename_name_tokens,
)


def test_rename_keyword_keeps_the_rest_of_the_line():
    source = "return tintlib.Tint(color=name).css()\n"
    updated = rename_keyword_calls(source, "Tint", "color", "colour")
    assert updated == "return tintlib.Tint(colour=name).css()\n"


def test_rename_except_attribute():
    source = "def age_label(value):\n    try:\n        age = ages.parse_age(value)\n    except ages.LegacyError:\n        return 'invalid'\n    return age\n"
    updated = rename_except_attribute(source, "LegacyError", "InputError")
    assert "except ages.InputError:" in updated
    assert "LegacyError" not in updated


def test_insert_field_before_string_method():
    source = "def render(name):\n    return bannerlib.banner(name).upper()\n"
    updated = insert_field_before_method(source, "upper", "text", {2})
    assert updated == "def render(name):\n    return bannerlib.banner(name).text.upper()\n"


def test_rename_name_tokens_skips_strings():
    source = "from belllib import say_hello\n\ndef hello(name):\n    return say_hello(name)\n"
    updated = rename_name_tokens(source, "say_hello", "greet")
    assert "import greet" in updated
    assert "return greet(name)" in updated
    assert "say_hello" not in updated

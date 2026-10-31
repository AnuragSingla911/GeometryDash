import ages


def age_label(value: str) -> str:
    try:
        age = ages.parse_age(value)
    except ages.LegacyError:
        return "invalid"
    return f"age={age}"

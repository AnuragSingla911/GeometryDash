import tintlib


def swatch(name: str) -> str:
    return tintlib.Tint(color=name).css()

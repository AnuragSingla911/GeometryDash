import bannerlib


def render(name: str) -> str:
    return bannerlib.banner(name).upper()

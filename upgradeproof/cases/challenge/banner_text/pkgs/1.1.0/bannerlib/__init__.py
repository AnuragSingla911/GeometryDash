class Banner:
    def __init__(self, text: str):
        self.text = text


def banner(name: str) -> Banner:
    return Banner(name.strip().upper())

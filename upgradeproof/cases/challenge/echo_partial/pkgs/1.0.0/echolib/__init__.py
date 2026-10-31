class Echo:
    def __init__(self, color: str):
        self.color = color

    def css(self) -> str:
        return f"color: {self.color}"

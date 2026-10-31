class Echo:
    def __init__(self, colour: str):
        self.colour = colour

    def css(self) -> str:
        return f"color: {self.colour}"

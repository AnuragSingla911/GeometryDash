import echolib


def shout(name: str) -> str:
    return echolib.Echo(color=name).css()

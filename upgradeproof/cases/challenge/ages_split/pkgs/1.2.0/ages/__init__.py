class InputError(ValueError):
    pass


class StateError(RuntimeError):
    pass


class RegistryDown(RuntimeError):
    pass


_open = True


def close_registry() -> None:
    global _open
    _open = False


def open_registry() -> None:
    global _open
    _open = True


def _ensure_open() -> None:
    if not _open:
        raise RegistryDown("registry is closed")


def parse_age(value: str) -> int:
    _ensure_open()
    if value.strip() == "":
        raise InputError("blank or malformed age")
    return int(value)

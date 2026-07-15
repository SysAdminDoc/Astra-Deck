"""Import-safe compatibility helpers for the companion module extraction."""

from importlib import import_module


def make_legacy_resolver(export_names):
    """Resolve legacy symbols only when a caller actually requests one.

    Keeping the resolver lazy lets boundary modules be imported by config tools,
    tests, and packagers without importing PyQt or Flask as a side effect. The
    resolver is intentionally temporary: each export disappears from its map as
    ownership moves into the boundary module.
    """

    allowed = frozenset(export_names)
    main_module = None

    def resolve(name):
        nonlocal main_module
        if name not in allowed:
            raise AttributeError(name)
        if main_module is None:
            try:
                main_module = import_module("astra_downloader.astra_downloader")
            except (ImportError, AttributeError):
                main_module = import_module("astra_downloader")
        return getattr(main_module, name)

    return resolve

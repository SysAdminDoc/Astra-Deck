"""Qt translation loading and locale normalization for Astra Downloader."""

import os
import sys
from pathlib import Path

from PyQt6.QtCore import QLocale, QTranslator, Qt


SUPPORTED_LOCALES = (
    "ar",
    "de",
    "en",
    "es",
    "fr",
    "it",
    "ja",
    "ko",
    "pt_BR",
    "ru",
    "zh_CN",
)


def normalize_companion_locale(value, system_locale=None):
    """Resolve a configured/system locale onto a bundled catalogue."""
    requested = str(value or "system").strip().replace("-", "_")
    if requested.lower() == "system":
        requested = str(
            system_locale
            or os.environ.get("ASTRA_COMPANION_LANGUAGE")
            or QLocale.system().name()
        ).strip().replace("-", "_")
    exact = next(
        (locale for locale in SUPPORTED_LOCALES if locale.lower() == requested.lower()),
        None,
    )
    if exact:
        return exact
    language = requested.split("_", 1)[0].lower()
    return next(
        (
            locale
            for locale in SUPPORTED_LOCALES
            if locale.split("_", 1)[0].lower() == language
        ),
        "en",
    )


def companion_translations_dir():
    """Return the source or PyInstaller extraction directory for `.qm` files."""
    frozen_root = getattr(sys, "_MEIPASS", None)
    if frozen_root:
        return Path(frozen_root) / "translations"
    return Path(__file__).resolve().parent / "translations"


def install_companion_translator(app, configured_locale="system"):
    """Install the selected Qt catalogue and return its retained translator."""
    locale = normalize_companion_locale(configured_locale)
    app.setLayoutDirection(
        Qt.LayoutDirection.RightToLeft
        if locale == "ar"
        else Qt.LayoutDirection.LeftToRight
    )
    app.setProperty("astraLocale", locale)
    if locale == "en":
        return None
    translator = QTranslator(app)
    catalog = companion_translations_dir() / f"astra_downloader_{locale}.qm"
    if not translator.load(str(catalog)):
        return None
    app.installTranslator(translator)
    return translator


__all__ = (
    "SUPPORTED_LOCALES",
    "companion_translations_dir",
    "install_companion_translator",
    "normalize_companion_locale",
)

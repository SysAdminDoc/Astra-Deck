#!/usr/bin/env python3
"""Generate Qt Linguist sources and compile companion translation catalogues."""

import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "astra_downloader" / "translations"
SOURCE_STRINGS = (
    "Dashboard",
    "Downloads",
    "History",
    "Settings",
    "Quick download",
    "Add to queue",
    "Video",
    "Audio",
    "Best",
    "Clip from",
    "to",
    "Pause intake",
    "Queue is clear",
    "Downloads sent from Astra Deck appear here.",
    "Open dashboard",
    "Server offline",
    "Local only · start before downloading",
    "Start Server",
    "Stop Server",
    "Tray behavior",
    "Stage copied video links for review",
    "Sign-ins",
    "Save changes",
)

CATALOGS = {
    "ar": {
        "Sign-ins": "تسجيلات الدخول",
        "Dashboard": "لوحة المعلومات",
        "Downloads": "التنزيلات",
        "History": "السجل",
        "Settings": "الإعدادات",
    },
    "de": {
        "Sign-ins": "Anmeldungen",
        "Dashboard": "Übersicht",
        "Downloads": "Downloads",
        "History": "Verlauf",
        "Settings": "Einstellungen",
        "Quick download": "Schnell-Download",
        "Add to queue": "Zur Warteschlange hinzufügen",
        "Video": "Video",
        "Audio": "Audio",
        "Best": "Beste",
        "Clip from": "Clip von",
        "to": "bis",
        "Pause intake": "Annahme pausieren",
        "Queue is clear": "Warteschlange ist leer",
        "Downloads sent from Astra Deck appear here.": (
            "Von Astra Deck gesendete Downloads erscheinen hier."
        ),
        "Open dashboard": "Übersicht öffnen",
        "Server offline": "Server offline",
        "Local only · start before downloading": (
            "Nur lokal · vor dem Herunterladen starten"
        ),
        "Start Server": "Server starten",
        "Stop Server": "Server stoppen",
        "Tray behavior": "Infobereich",
        "Stage copied video links for review": (
            "Kopierte YouTube-Links zur Prüfung vormerken"
        ),
        "Save changes": "Änderungen speichern",
    },
    "en": {},
    "es": {
        "Sign-ins": "Inicios de sesión",
        "Dashboard": "Panel",
        "Downloads": "Descargas",
        "History": "Historial",
        "Settings": "Configuración",
    },
    "fr": {
        "Sign-ins": "Connexions",
        "Dashboard": "Tableau de bord",
        "Downloads": "Téléchargements",
        "History": "Historique",
        "Settings": "Paramètres",
    },
    "it": {
        "Sign-ins": "Accessi",
        "Dashboard": "Panoramica",
        "Downloads": "Download",
        "History": "Cronologia",
        "Settings": "Impostazioni",
    },
    "ja": {
        "Sign-ins": "サインイン",
        "Dashboard": "ダッシュボード",
        "Downloads": "ダウンロード",
        "History": "履歴",
        "Settings": "設定",
    },
    "ko": {
        "Sign-ins": "로그인",
        "Dashboard": "대시보드",
        "Downloads": "다운로드",
        "History": "기록",
        "Settings": "설정",
    },
    "pt_BR": {
        "Sign-ins": "Logins",
        "Dashboard": "Painel",
        "Downloads": "Downloads",
        "History": "Histórico",
        "Settings": "Configurações",
    },
    "ru": {
        "Sign-ins": "Входы",
        "Dashboard": "Обзор",
        "Downloads": "Загрузки",
        "History": "История",
        "Settings": "Настройки",
    },
    "zh_CN": {
        "Sign-ins": "登录",
        "Dashboard": "仪表板",
        "Downloads": "下载",
        "History": "历史记录",
        "Settings": "设置",
    },
}


def write_ts(locale, translations):
    root = ET.Element(
        "TS",
        {
            "version": "2.1",
            "language": locale.replace("_", "-"),
            "sourcelanguage": "en",
        },
    )
    context = ET.SubElement(root, "context")
    ET.SubElement(context, "name").text = "AstraDownloader"
    for source in SOURCE_STRINGS:
        message = ET.SubElement(context, "message")
        ET.SubElement(message, "source").text = source
        translation = ET.SubElement(message, "translation")
        translation.text = translations.get(source, source)
    tree = ET.ElementTree(root)
    ET.indent(tree, space="  ")
    target = OUTPUT_DIR / f"astra_downloader_{locale}.ts"
    tree.write(target, encoding="utf-8", xml_declaration=True)
    return target


def find_lrelease():
    for name in ("pyside6-lrelease", "lrelease", "lrelease-qt6"):
        found = shutil.which(name)
        if found:
            return found
    raise SystemExit(
        "Qt lrelease is required to refresh companion .qm files. "
        "Install the Qt/PySide development tools or retain the reviewed compiled catalogues."
    )


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    compiler = find_lrelease()
    for locale, translations in CATALOGS.items():
        ts_path = write_ts(locale, translations)
        qm_path = ts_path.with_suffix(".qm")
        subprocess.run(
            [compiler, str(ts_path), "-qm", str(qm_path)],
            check=True,
        )
        if not qm_path.exists() or qm_path.stat().st_size < 100:
            raise SystemExit(f"Translation compiler did not produce {qm_path}")
    print(f"Compiled {len(CATALOGS)} companion translation catalogues.")


if __name__ == "__main__":
    main()

"""
Astra Downloader — PyQt6 GUI, system tray, and related helpers.

Re-exports GUI-related symbols from the main astra_downloader module:
MainWindow, SetupWorker, FolderPickerService, stylesheet, uninstall,
single-instance guard, widget helpers.
"""

try:
    import astra_downloader.astra_downloader as _ad
except (ImportError, AttributeError):
    import astra_downloader as _ad

# GUI classes
MainWindow = _ad.MainWindow
SetupWorker = _ad.SetupWorker
FolderPickerService = _ad.FolderPickerService

# GUI widget helpers
repolish = _ad.repolish
make_label = _ad.make_label
make_section_label = _ad.make_section_label
make_divider = _ad.make_divider
make_card = _ad.make_card
make_stat = _ad.make_stat
make_empty_state = _ad.make_empty_state

# Stylesheet
STYLESHEET = _ad.STYLESHEET

# Module-level state
_folder_pick_q = _ad._folder_pick_q

# Uninstall
run_uninstall = _ad.run_uninstall
is_safe_install_dir_for_removal = _ad.is_safe_install_dir_for_removal
spawn_delayed_install_dir_removal = _ad.spawn_delayed_install_dir_removal

# Single instance
check_single_instance = _ad.check_single_instance

# Entry point
main = _ad.main

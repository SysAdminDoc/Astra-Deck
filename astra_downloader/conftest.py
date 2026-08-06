"""Test-run isolation for the companion suite.

The suite exercises the REAL DownloadManager / updater wiring, whose logger
is ``astra_downloader.write_persistent_log``. Without redirection every run
appended fabricated failure lines ("updater exploded", "disk full",
"SHA-256 mismatch") to the production ``%LOCALAPPDATA%/AstraDownloader/
server.log`` — growing it and poisoning any later support/debug read.
``write_persistent_log`` binds ``LOG_PATH`` late specifically so this
fixture can point the module globals at a per-run temp file.

``INSTALL_DIR`` is redirected for the same reason and it is not optional:
``DownloadManagerCore`` roots the site-login store there, so a test that
builds a real manager and imports a fixture cookie wrote
``site-logins/x.com.txt`` into the user's live install — a fabricated sign-in
that would then be listed in the GUI and attached to real downloads for that
site. The dependency reads the module global on each call, so redirecting it
here covers every manager the suite constructs.
"""

import pytest


@pytest.fixture(autouse=True, scope="session")
def _redirect_persistent_state(tmp_path_factory):
    import astra_downloader as ad

    log_dir = tmp_path_factory.mktemp("astra-test-logs")
    install_dir = tmp_path_factory.mktemp("astra-test-install")
    original_log, original_crash = ad.LOG_PATH, ad.CRASH_LOG_PATH
    original_install = ad.INSTALL_DIR
    ad.LOG_PATH = log_dir / "server.log"
    ad.CRASH_LOG_PATH = log_dir / "crash.log"
    ad.INSTALL_DIR = install_dir
    yield
    ad.LOG_PATH = original_log
    ad.CRASH_LOG_PATH = original_crash
    ad.INSTALL_DIR = original_install

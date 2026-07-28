"""Test-run isolation for the companion suite.

The suite exercises the REAL DownloadManager / updater wiring, whose logger
is ``astra_downloader.write_persistent_log``. Without redirection every run
appended fabricated failure lines ("updater exploded", "disk full",
"SHA-256 mismatch") to the production ``%LOCALAPPDATA%/AstraDownloader/
server.log`` — growing it and poisoning any later support/debug read.
``write_persistent_log`` binds ``LOG_PATH`` late specifically so this
fixture can point the module globals at a per-run temp file.
"""

import pytest


@pytest.fixture(autouse=True, scope="session")
def _redirect_persistent_logs(tmp_path_factory):
    import astra_downloader as ad

    log_dir = tmp_path_factory.mktemp("astra-test-logs")
    original_log, original_crash = ad.LOG_PATH, ad.CRASH_LOG_PATH
    ad.LOG_PATH = log_dir / "server.log"
    ad.CRASH_LOG_PATH = log_dir / "crash.log"
    yield
    ad.LOG_PATH = original_log
    ad.CRASH_LOG_PATH = original_crash

import socket
import tempfile
import threading
import time
import unittest
from pathlib import Path

import astra_downloader as ad


class FakeConfig:
    def __init__(self, data=None):
        self.data = {
            "DownloadPath": str(Path(tempfile.gettempdir()) / "astra-downloader-tests"),
            "AudioDownloadPath": "",
            "ConcurrentFragments": 4,
            "EmbedMetadata": False,
            "EmbedThumbnail": False,
            "EmbedChapters": False,
            "EmbedSubs": False,
            "SponsorBlock": False,
            "RateLimit": "",
            "Proxy": "",
        }
        if data:
            self.data.update(data)

    def get(self, key, default=None):
        return self.data.get(key, default)


class FakeHistory:
    def __init__(self):
        self.entries = []

    def add(self, entry):
        self.entries.append(entry)

    def load(self):
        return list(self.entries)


class NormalizationTests(unittest.TestCase):
    def test_normalize_url_rejects_invalid_or_ambiguous_values(self):
        for value in ("", "https://", "javascript:alert(1)", "https://exa mple.com"):
            with self.subTest(value=value):
                url, err = ad.normalize_url(value)
                self.assertIsNone(url)
                self.assertIsNotNone(err)

        url, err = ad.normalize_url("https://example.com/watch?v=abc")
        self.assertEqual(url, "https://example.com/watch?v=abc")
        self.assertIsNone(err)

    def test_normalize_url_rejects_overlong_values_without_truncating(self):
        value = "https://example.com/" + ("a" * 5000)
        url, err = ad.normalize_url(value)
        self.assertIsNone(url)
        self.assertEqual(err, "URL is too long to download safely.")

    def test_sanitize_config_clamps_and_normalizes_untrusted_values(self):
        cfg = ad.sanitize_config({
            "ServerPort": "999999",
            "ServerToken": "short",
            "ConcurrentFragments": "999",
            "RateLimit": "2m",
            "Proxy": "file:///tmp/nope",
            "EmbedMetadata": "false",
            "SubLangs": "en,es;<bad>",
        })
        self.assertEqual(cfg["ServerPort"], 65535)
        self.assertEqual(cfg["ConcurrentFragments"], 32)
        self.assertEqual(cfg["RateLimit"], "2M")
        self.assertEqual(cfg["Proxy"], "")
        self.assertFalse(cfg["EmbedMetadata"])
        self.assertEqual(cfg["SubLangs"], "en,esbad")
        self.assertGreaterEqual(len(cfg["ServerToken"]), 16)

    def test_output_directory_must_be_absolute(self):
        path, err = ad.normalize_output_dir("relative-folder")
        self.assertIsNone(path)
        self.assertEqual(err, "Choose an absolute output folder.")

    def test_output_directory_rejects_overlong_values(self):
        path, err = ad.normalize_output_dir("C:\\" + ("a" * 3000))
        self.assertIsNone(path)
        self.assertEqual(err, "Output folder path is too long.")


class PersistenceTests(unittest.TestCase):
    def test_history_load_backs_up_corrupt_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            original = ad.HISTORY_PATH
            try:
                ad.HISTORY_PATH = Path(tmp) / "history.json"
                ad.HISTORY_PATH.write_text("{not-json", encoding="utf-8")
                history = ad.History()
                self.assertEqual(history.load(), [])
                backups = list(Path(tmp).glob("history.json.corrupt-*"))
                self.assertEqual(len(backups), 1)
            finally:
                ad.HISTORY_PATH = original


class InstanceCommandTests(unittest.TestCase):
    def test_startup_command_detects_protocol_launches(self):
        self.assertEqual(ad.startup_command_from_argv(["mediadl://start"]), "start")
        self.assertEqual(ad.startup_command_from_argv(["ytdl://download"]), "start")
        self.assertEqual(ad.startup_command_from_argv(["--start-server"]), "start")
        self.assertEqual(ad.startup_command_from_argv(["--uninstall"]), "")

    def test_send_instance_command_posts_start_to_listener(self):
        ready = threading.Event()
        received = []
        port_holder = []

        def run_server():
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
                server.bind(("127.0.0.1", 0))
                port_holder.append(server.getsockname()[1])
                server.listen(1)
                ready.set()
                conn, _addr = server.accept()
                with conn:
                    received.append(conn.recv(128).decode("ascii").strip())

        thread = threading.Thread(target=run_server, daemon=True)
        thread.start()
        self.assertTrue(ready.wait(2))
        self.assertTrue(ad.send_instance_command("start", port=port_holder[0], attempts=1))
        thread.join(2)
        self.assertEqual(received, ["start"])


class DownloadManagerTests(unittest.TestCase):
    def test_queued_downloads_count_toward_concurrency_limit(self):
        manager = ad.DownloadManager(FakeConfig(), FakeHistory())

        def hold_queued(_download):
            time.sleep(0.2)

        manager._run_download = hold_queued

        ids = []
        for i in range(ad.MAX_CONCURRENT):
            dl_id, err = manager.start_download(f"https://example.com/{i}")
            self.assertIsNone(err)
            ids.append(dl_id)

        dl_id, err = manager.start_download("https://example.com/overflow")
        self.assertIsNone(dl_id)
        self.assertIn("limit", err.lower())
        self.assertEqual(manager.active_count(), ad.MAX_CONCURRENT)

    def test_cancel_does_not_relabel_completed_downloads(self):
        manager = ad.DownloadManager(FakeConfig(), FakeHistory())
        dl = ad.Download("done", "https://example.com/done")
        dl.status = "complete"
        manager.downloads[dl.id] = dl

        self.assertFalse(manager.cancel(dl.id))
        self.assertEqual(dl.status, "complete")


class ApiSecurityTests(unittest.TestCase):
    def test_health_advertises_service_identity(self):
        config = FakeConfig({"ServerToken": "a" * 32})
        manager = ad.DownloadManager(config, FakeHistory())
        api = ad.create_api(config, manager, FakeHistory())
        resp = api.test_client().get("/health", headers={"X-MDL-Client": "MediaDL"})
        body = resp.get_json()

        self.assertEqual(body["service"], ad.SERVICE_ID)
        self.assertEqual(body["api"], ad.SERVICE_API_VERSION)
        self.assertTrue(body["token_required"])
        self.assertEqual(body["token"], "a" * 32)

    def test_health_token_is_not_exposed_to_null_origin_pages(self):
        config = FakeConfig({"ServerToken": "a" * 32})
        manager = ad.DownloadManager(config, FakeHistory())
        api = ad.create_api(config, manager, FakeHistory())
        client = api.test_client()

        null_origin = client.get("/health", headers={
            "Origin": "null",
            "X-MDL-Client": "MediaDL",
        })
        self.assertNotIn("Access-Control-Allow-Origin", null_origin.headers)
        self.assertNotIn("token", null_origin.get_json())

        extension_origin = "chrome-extension://abcdefghijklmnop"
        extension_resp = client.get("/health", headers={
            "Origin": extension_origin,
            "X-MDL-Client": "MediaDL",
        })
        self.assertEqual(extension_resp.headers.get("Access-Control-Allow-Origin"), extension_origin)
        self.assertEqual(extension_resp.get_json()["token"], "a" * 32)

        background_resp = client.get("/health", headers={"X-MDL-Client": "MediaDL"})
        self.assertEqual(background_resp.get_json()["token"], "a" * 32)

    def test_download_rejects_non_object_json_body(self):
        token = "c" * 32
        config = FakeConfig({"ServerToken": token})
        manager = ad.DownloadManager(config, FakeHistory())
        api = ad.create_api(config, manager, FakeHistory())
        resp = api.test_client().post(
            "/download",
            json=["https://example.com/video"],
            headers={"X-Auth-Token": token},
        )

        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.get_json()["error"], "Missing download URL.")

    def test_history_limit_is_clamped(self):
        token = "d" * 32
        history = FakeHistory()
        history.entries = [{"id": str(i), "url": "https://example.com", "title": str(i)} for i in range(3)]
        config = FakeConfig({"ServerToken": token})
        manager = ad.DownloadManager(config, history)
        api = ad.create_api(config, manager, history)

        resp = api.test_client().get("/history?limit=-5", headers={"X-Auth-Token": token})

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.get_json()["count"], 1)

    def test_cancel_finished_download_returns_conflict_not_not_found(self):
        token = "b" * 32
        config = FakeConfig({"ServerToken": token})
        manager = ad.DownloadManager(config, FakeHistory())
        dl = ad.Download("done", "https://example.com/done")
        dl.status = "complete"
        manager.downloads[dl.id] = dl
        api = ad.create_api(config, manager, FakeHistory())
        resp = api.test_client().delete(f"/cancel/{dl.id}", headers={"X-Auth-Token": token})

        self.assertEqual(resp.status_code, 409)
        self.assertIn("already finished", resp.get_json()["error"])

    def test_dns_rebinding_attack_is_rejected_before_handler(self):
        """Verify Host-header validation blocks DNS rebinding to attacker-controlled domains."""
        token = "e" * 32
        config = FakeConfig({"ServerToken": token})
        manager = ad.DownloadManager(config, FakeHistory())
        api = ad.create_api(config, manager, FakeHistory())
        client = api.test_client()

        # Simulate a DNS-rebinding attack: the browser resolved attacker.com
        # to 127.0.0.1 after the page loaded, but it still sends the attacker
        # hostname in the Host header. Legitimate local clients always send
        # 127.0.0.1 / localhost / ::1.
        for bad_host in ("attacker.com", "attacker.com:9751", "example.org:80"):
            with self.subTest(host=bad_host):
                resp = client.get(
                    "/health",
                    headers={"Host": bad_host, "X-MDL-Client": "MediaDL"},
                )
                self.assertEqual(resp.status_code, 421, f"Expected 421 Misdirected Request for Host={bad_host}")
                self.assertIn("Invalid Host", resp.get_json().get("error", ""))

        for good_host in ("127.0.0.1:9751", "localhost:9751", "[::1]:9751"):
            with self.subTest(host=good_host):
                resp = client.get(
                    "/health",
                    headers={"Host": good_host, "X-MDL-Client": "MediaDL"},
                )
                self.assertEqual(resp.status_code, 200, f"Expected 200 for Host={good_host}")

    def test_bootstrap_surfaces_failure_to_stderr(self):
        """Verify _bootstrap writes a helpful message to stderr when pip is unreachable."""
        import io
        import unittest.mock as mock
        # Only run if running from source (frozen exe skips bootstrap entirely)
        buf = io.StringIO()
        with mock.patch.object(ad, "subprocess") as fake_subproc, \
             mock.patch.object(ad.sys, "stderr", buf), \
             mock.patch.object(ad.os.environ, "get", return_value=None), \
             mock.patch.object(ad.sys, "frozen", False, create=True):
            # Force each install strategy to report that pip is not on PATH
            fake_subproc.check_call.side_effect = FileNotFoundError(2, "No such file", "pip")
            # Force the import check to report every dependency as missing
            with mock.patch("builtins.__import__", side_effect=ImportError):
                ad._bootstrap()
        stderr = buf.getvalue()
        self.assertIn("Failed to auto-install", stderr)
        self.assertIn("pip install", stderr)


class CookieJarTests(unittest.TestCase):
    """Audit-pass coverage for write_cookies_netscape.

    The extension pushes Chrome cookie objects into the server's /download
    request and yt-dlp needs them in Netscape cookies.txt format. Regressing
    the converter would silently break logged-in/age-gated downloads, so each
    behaviour below is locked down by a dedicated test.
    """

    def _read(self, path):
        with open(path, "r", encoding="utf-8") as fh:
            return fh.read()

    def test_returns_none_for_empty_or_invalid_input(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "cookies.txt"
            self.assertIsNone(ad.write_cookies_netscape(None, target))
            self.assertIsNone(ad.write_cookies_netscape([], target))
            self.assertIsNone(ad.write_cookies_netscape("not a list", target))
            # All entries invalid (missing name/domain) → no jar written.
            self.assertIsNone(ad.write_cookies_netscape(
                [{"name": ""}, {"domain": ".youtube.com"}],
                target,
            ))
            self.assertFalse(target.exists())

    def test_writes_netscape_format_with_httponly_prefix(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "cookies.txt"
            cookies = [
                {
                    "domain": ".youtube.com", "name": "SID", "value": "abc",
                    "path": "/", "secure": True, "httpOnly": True,
                    "expirationDate": 1700000000,
                },
                {
                    "domain": "youtube.com", "name": "PREF", "value": "tz=UTC",
                    "path": "/", "secure": False, "httpOnly": False,
                    # Session cookie (no expirationDate) — must serialize as 0
                    "expirationDate": None,
                },
            ]
            result = ad.write_cookies_netscape(cookies, target)
            self.assertEqual(result, str(target))
            body = self._read(target)
            self.assertIn("# Netscape HTTP Cookie File", body)
            # httpOnly cookie gets the #HttpOnly_ prefix yt-dlp expects.
            self.assertIn("#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t1700000000\tSID\tabc", body)
            self.assertIn("youtube.com\tFALSE\t/\tFALSE\t0\tPREF\ttz=UTC", body)

    def test_strips_control_chars_that_would_corrupt_tsv(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "cookies.txt"
            cookies = [
                # Tabs/newlines in a value would shift columns in the TSV and
                # make yt-dlp fail to parse the jar. Control-char stripping
                # produces a well-formed single-line value.
                {"domain": ".youtube.com", "name": "X", "value": "a\tb\nc"},
                {"domain": ".youtube.com", "name": "Y", "value": "ok"},
            ]
            self.assertEqual(ad.write_cookies_netscape(cookies, target), str(target))
            body = self._read(target)
            # The line for X must end with a clean value containing no raw
            # tabs or newlines beyond the column separator.
            x_line = [line for line in body.splitlines() if "\tX\t" in line][0]
            self.assertTrue(x_line.endswith("abc"))
            self.assertEqual(x_line.count("\t"), 6)  # 7 columns → 6 separators
            self.assertIn("Y\tok", body)

    def test_rejects_malformed_expiration_without_failing_whole_jar(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "cookies.txt"
            cookies = [
                {"domain": ".youtube.com", "name": "A", "value": "a", "expirationDate": "bogus"},
                {"domain": ".youtube.com", "name": "B", "value": "b", "expirationDate": -42},
                {"domain": ".youtube.com", "name": "C", "value": "c", "expirationDate": 100},
            ]
            self.assertEqual(ad.write_cookies_netscape(cookies, target), str(target))
            body = self._read(target)
            self.assertIn("\tA\ta", body)  # bogus → 0
            self.assertIn("\t0\tA\ta", body)
            self.assertIn("\t0\tB\tb", body)  # negative → 0
            self.assertIn("\t100\tC\tc", body)


class PathConfinementTests(unittest.TestCase):
    """v1.2.0 S1 — outputDir allowlist.

    The server accepts a client-supplied `outputDir` on /download. Before
    v1.2.0 it only checked that the path was absolute — a compromised
    extension could write anywhere the server user had access to. These
    tests lock down the rejection path and the permissive subfolder path.
    """

    def test_confinement_accepts_subfolder_of_allowed_root(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "downloads"
            root.mkdir()
            subfolder = root / "channel-a" / "2026"
            out, err = ad.normalize_output_dir(
                str(subfolder),
                default_dir=str(root),
                allowed_roots=[root.resolve()],
            )
            self.assertIsNone(err)
            self.assertTrue(Path(out).resolve() == subfolder.resolve())
            self.assertTrue(subfolder.exists())

    def test_confinement_rejects_path_outside_allowed_roots(self):
        with tempfile.TemporaryDirectory() as allowed_tmp, tempfile.TemporaryDirectory() as forbidden_tmp:
            allowed_root = Path(allowed_tmp).resolve()
            forbidden = Path(forbidden_tmp) / "escape" / "target"
            out, err = ad.normalize_output_dir(
                str(forbidden),
                default_dir=str(allowed_root),
                allowed_roots=[allowed_root],
            )
            self.assertIsNone(out)
            self.assertEqual(err, "Output folder is outside the configured download locations.")
            # Critical: confinement must reject BEFORE mkdir; a rejected
            # request should not create the forbidden directory.
            self.assertFalse(forbidden.exists())

    def test_confinement_rejects_parent_traversal(self):
        with tempfile.TemporaryDirectory() as tmp:
            allowed_root = Path(tmp) / "downloads"
            allowed_root.mkdir()
            # .. traversal: resolve() normalizes before the check.
            traversal = str(allowed_root / ".." / ".." / "somewhere")
            out, err = ad.normalize_output_dir(
                traversal,
                default_dir=str(allowed_root),
                allowed_roots=[allowed_root.resolve()],
            )
            self.assertIsNone(out)
            self.assertEqual(err, "Output folder is outside the configured download locations.")

    def test_allowed_output_roots_dedupes_and_resolves(self):
        with tempfile.TemporaryDirectory() as tmp:
            video = Path(tmp) / "videos"
            audio = Path(tmp) / "audio"
            video.mkdir()
            audio.mkdir()

            class _Cfg:
                def get(self, key, default=None):
                    return {
                        "DownloadPath": str(video),
                        # Same dir under DownloadPath and ExtraOutputRoots
                        # must collapse in the final list.
                        "AudioDownloadPath": str(video),
                        "ExtraOutputRoots": [str(audio), str(audio)],
                    }.get(key, default)

            roots = ad.allowed_output_roots(_Cfg())
            resolved_video = video.resolve()
            resolved_audio = audio.resolve()
            self.assertIn(resolved_video, roots)
            self.assertIn(resolved_audio, roots)
            self.assertEqual(len(roots), 2)


class RateLimiterTests(unittest.TestCase):
    """v1.2.0 S2 — sliding-window rate limit on /download."""

    def test_allows_up_to_max_events_then_rejects(self):
        limiter = ad.RateLimiter(max_events=3, window_seconds=60)
        for _ in range(3):
            allowed, retry = limiter.allow('download')
            self.assertTrue(allowed)
            self.assertEqual(retry, 0.0)
        allowed, retry = limiter.allow('download')
        self.assertFalse(allowed)
        self.assertGreater(retry, 0.0)

    def test_separate_bucket_keys_are_independent(self):
        limiter = ad.RateLimiter(max_events=1, window_seconds=60)
        self.assertTrue(limiter.allow('a')[0])
        # Second call to 'a' rejected, but 'b' gets its own budget.
        self.assertFalse(limiter.allow('a')[0])
        self.assertTrue(limiter.allow('b')[0])


class Sha256VerifyTests(unittest.TestCase):
    """v1.2.0 S3 — binary integrity verification for yt-dlp/ffmpeg."""

    def test_verify_accepts_matching_hash(self):
        import hashlib
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "bin.exe"
            path.write_bytes(b"hello world")
            expected = hashlib.sha256(b"hello world").hexdigest()
            self.assertTrue(ad.verify_file_sha256(path, expected))

    def test_verify_raises_on_mismatch(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "bin.exe"
            path.write_bytes(b"tampered bytes")
            wrong = "0" * 64
            with self.assertRaises(RuntimeError) as ctx:
                ad.verify_file_sha256(path, wrong)
            self.assertIn("SHA-256 mismatch", str(ctx.exception))

    def test_verify_returns_false_on_missing_or_malformed_sidecar(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "bin.exe"
            path.write_bytes(b"hi")
            self.assertFalse(ad.verify_file_sha256(path, None))
            self.assertFalse(ad.verify_file_sha256(path, ""))
            self.assertFalse(ad.verify_file_sha256(path, "not-a-hash"))

    def test_parse_sha256_sums_with_multiple_assets(self):
        doc = (
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  yt-dlp.exe\n"
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb  yt-dlp\n"
            "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc  yt-dlp_macos\n"
        )
        self.assertEqual(
            ad._parse_sha256_sums(doc, target_asset="yt-dlp.exe"),
            "a" * 64,
        )

    def test_parse_sha256_sums_accepts_single_line_sidecar(self):
        digest = "d" * 64
        self.assertEqual(ad._parse_sha256_sums(f"{digest}\n"), digest)


class CookieJarSweepTests(unittest.TestCase):
    """v1.2.0 S4 — orphaned .cookies.*.txt cleanup on server start.

    When the downloader is killed mid-run (power loss, taskkill /F), session
    cookies leak into INSTALL_DIR. A stale sweep on DownloadManager init
    keeps session cookies from outliving the process that needed them.
    """

    def test_cleanup_removes_old_cookie_jars_and_spares_fresh_ones(self):
        with tempfile.TemporaryDirectory() as tmp:
            install_dir = Path(tmp)
            original = ad.INSTALL_DIR
            try:
                ad.INSTALL_DIR = install_dir
                stale = install_dir / ".cookies.abc123.txt"
                fresh = install_dir / ".cookies.def456.txt"
                unrelated = install_dir / "config.json"
                stale.write_text("stale", encoding="utf-8")
                fresh.write_text("fresh", encoding="utf-8")
                unrelated.write_text("{}", encoding="utf-8")
                # Backdate the stale entry to beyond the cleanup horizon.
                old_mtime = time.time() - 3600
                import os as _os
                _os.utime(stale, (old_mtime, old_mtime))
                ad.cleanup_stale_cookie_jars(older_than_seconds=300)
                self.assertFalse(stale.exists(), "stale cookie jar should be removed")
                self.assertTrue(fresh.exists(), "fresh cookie jar should be preserved")
                self.assertTrue(unrelated.exists(), "non-cookie files must not be touched")
            finally:
                ad.INSTALL_DIR = original


class ApiRateLimitTests(unittest.TestCase):
    """End-to-end /download rate limit via the Flask test client."""

    def test_download_endpoint_returns_429_after_burst(self):
        token = "f" * 32
        config = FakeConfig({"ServerToken": token})
        manager = ad.DownloadManager(config, FakeHistory())
        api = ad.create_api(config, manager, FakeHistory())
        client = api.test_client()

        # Force a low limit so we can exhaust it without actually starting
        # 30 real downloads (which would be blocked by MAX_CONCURRENT first).
        # We replicate the burst at the HTTP layer by patching the limiter
        # state after construction.
        # Simpler: send many OPTIONS-bypassed requests with invalid bodies.
        # The rate check runs after auth but BEFORE body parsing, so a
        # missing body still consumes a token.
        saw_429 = False
        for _ in range(ad.RATE_LIMIT_DOWNLOAD_MAX + 2):
            resp = client.post(
                "/download",
                headers={"X-Auth-Token": token, "Content-Type": "application/json"},
                data="{}",
            )
            if resp.status_code == 429:
                saw_429 = True
                self.assertIn("Retry-After", resp.headers)
                break
        self.assertTrue(saw_429, "rate limiter should reject eventually")


class CorsHeaderTests(unittest.TestCase):
    def test_response_advertises_max_age(self):
        token = "g" * 32
        config = FakeConfig({"ServerToken": token})
        manager = ad.DownloadManager(config, FakeHistory())
        api = ad.create_api(config, manager, FakeHistory())
        resp = api.test_client().get("/health", headers={"X-MDL-Client": "MediaDL"})
        self.assertEqual(resp.headers.get("Access-Control-Max-Age"), str(ad.CORS_MAX_AGE_SECONDS))

    def test_response_disables_intermediary_caching(self):
        # v1.4.0 NX11: defense-in-depth against intermediary caching of
        # auth-bearing responses (CVE-2026-27205 class). Every cors_response
        # must declare Cache-Control: no-store and Vary: Cookie so a future
        # session-bearing variant can't ride on a stale cache entry.
        token = "n" * 32
        config = FakeConfig({"ServerToken": token})
        manager = ad.DownloadManager(config, FakeHistory())
        api = ad.create_api(config, manager, FakeHistory())
        resp = api.test_client().get("/health", headers={"X-MDL-Client": "MediaDL"})
        self.assertEqual(resp.headers.get("Cache-Control"), "no-store")
        vary = resp.headers.get("Vary", "")
        self.assertIn("Cookie", vary)

    def test_response_disables_caching_on_extension_origin_too(self):
        # The Origin-allow path adds "Vary: Origin"; the no-store + Cookie
        # token must compose with it, not overwrite it.
        token = "p" * 32
        config = FakeConfig({"ServerToken": token})
        manager = ad.DownloadManager(config, FakeHistory())
        api = ad.create_api(config, manager, FakeHistory())
        resp = api.test_client().get(
            "/health",
            headers={
                "X-MDL-Client": "MediaDL",
                "Origin": "chrome-extension://abcdefghijklmnop",
            },
        )
        self.assertEqual(resp.headers.get("Cache-Control"), "no-store")
        vary = resp.headers.get("Vary", "")
        self.assertIn("Cookie", vary)
        self.assertIn("Origin", vary)


class HealthAdditionsTests(unittest.TestCase):
    """v1.2.0 additions to /health schema — version strings + rate-limit policy."""

    def test_health_surface_includes_rate_limit_policy(self):
        token = "h" * 32
        config = FakeConfig({"ServerToken": token})
        manager = ad.DownloadManager(config, FakeHistory())
        api = ad.create_api(config, manager, FakeHistory())
        resp = api.test_client().get("/health", headers={"X-MDL-Client": "MediaDL"})
        body = resp.get_json()
        self.assertIn("rateLimit", body)
        self.assertEqual(body["rateLimit"]["downloadMaxPerWindow"], ad.RATE_LIMIT_DOWNLOAD_MAX)
        self.assertEqual(body["rateLimit"]["downloadWindowSeconds"], ad.RATE_LIMIT_DOWNLOAD_WINDOW_SECONDS)
        # ytDlpVersion / ffmpegVersion are present but may be None in CI; the
        # wire contract is "key exists, value is string or null" — assert both.
        self.assertIn("ytDlpVersion", body)
        self.assertIn("ffmpegVersion", body)


class AutoUpdateThrottleTests(unittest.TestCase):
    """v1.2.0 B3 — yt-dlp auto-update runs at most once per 24h."""

    def test_should_check_returns_true_with_no_prior_stamp(self):
        class _C:
            def get(self, key, default=None):
                return "" if key == "LastYtDlpUpdateCheck" else default
        self.assertTrue(ad.should_check_ytdlp_update(_C()))

    def test_should_check_returns_false_with_recent_stamp(self):
        recent = (ad.datetime.now() - ad.datetime.now().__class__.min.__class__.min.__class__.resolution).strftime("%Y-%m-%d %H:%M:%S")
        # Simpler form: use "now" as the stamp.
        import datetime as _dt
        recent = _dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        class _C:
            def get(self, key, default=None):
                return recent if key == "LastYtDlpUpdateCheck" else default
        self.assertFalse(ad.should_check_ytdlp_update(_C()))

    def test_should_check_handles_corrupt_stamp(self):
        class _C:
            def get(self, key, default=None):
                return "not-a-date" if key == "LastYtDlpUpdateCheck" else default
        # Malformed stamps should not wedge the update path — default to True
        # so the next launch can re-establish a valid stamp.
        self.assertTrue(ad.should_check_ytdlp_update(_C()))


class NoArchiveLockTests(unittest.TestCase):
    """v1.3.0 removed the download-archive lock so re-downloads always
    run. These tests pin the invariants so the lock can't be silently
    re-introduced via a stray flag, config key, or yt-dlp argv branch.
    """

    def test_default_config_has_no_download_archive_key(self):
        self.assertNotIn('DownloadArchive', ad.DEFAULT_CONFIG,
                         'DownloadArchive must not be a default config key.')

    def test_source_does_not_pass_download_archive_to_ytdlp(self):
        # Hard sentinel: searching the source rather than mocking the
        # subprocess catches the case where someone re-adds the flag
        # without going through the config knob.
        src = Path(ad.__file__).read_text(encoding='utf-8')
        self.assertNotIn("'--download-archive'", src,
                         "yt-dlp argv must not include --download-archive.")
        self.assertNotIn('"--download-archive"', src,
                         "yt-dlp argv must not include --download-archive.")

    def test_source_passes_force_overwrites_to_ytdlp(self):
        src = Path(ad.__file__).read_text(encoding='utf-8')
        self.assertIn("'--force-overwrites'", src,
                      "yt-dlp argv must include --force-overwrites so "
                      "re-downloads of the same URL aren't skipped because "
                      "the destination file already exists.")


class VideoFormatSelectorTests(unittest.TestCase):
    """Codec-aware format selection — the previous selector picked the
    highest-bitrate stream regardless of codec, then ``--merge-output-format
    mp4`` only swapped containers, leaving VP9/AV1 inside .mp4. Adobe Premiere
    rejects that combination as "unsupported compression". These tests pin
    the codec preferences per container so the regression can't return
    silently.
    """

    def _selector(self, args):
        # args is the full list returned by build_video_format_args.
        # Layout is ['-f', '<selector>', '--merge-output-format', '<container>']
        self.assertEqual(args[0], '-f')
        self.assertEqual(args[2], '--merge-output-format')
        return args[1], args[3]

    def test_mp4_prefers_avc1_video_and_m4a_audio(self):
        sel, container = self._selector(ad.build_video_format_args('mp4', 'best'))
        self.assertEqual(container, 'mp4')
        # Premiere requires H.264 (avc1) inside MP4. The first cascade tier
        # MUST be avc1+m4a — anything else means the regression is back.
        self.assertTrue(
            sel.startswith('bestvideo[vcodec^=avc1]+bestaudio[ext=m4a]/'),
            f'mp4 selector must lead with avc1+m4a, got: {sel}',
        )
        # Must terminate at plain `best` so download never fails purely on codec.
        self.assertTrue(sel.endswith('/best'))

    def test_mp4_with_quality_cap_applies_to_every_tier(self):
        sel, _ = self._selector(ad.build_video_format_args('mp4', '1080'))
        # Every cascade tier should respect the height cap, not just the first.
        # If a tier omits the filter, a 4K stream could leak through when the
        # user explicitly asked for 1080p.
        for tier in sel.split('/'):
            if tier == 'best':
                continue
            self.assertIn('[height<=1080]', tier,
                          f'tier missing height cap: {tier!r}')

    def test_webm_prefers_vp9_and_opus(self):
        sel, container = self._selector(ad.build_video_format_args('webm', 'best'))
        self.assertEqual(container, 'webm')
        self.assertTrue(
            sel.startswith('bestvideo[vcodec^=vp9]+bestaudio[ext=webm]/'),
            f'webm selector must lead with vp9+webm-audio, got: {sel}',
        )

    def test_mkv_has_no_codec_preference(self):
        sel, container = self._selector(ad.build_video_format_args('mkv', 'best'))
        self.assertEqual(container, 'mkv')
        # MKV is a universal container — codec filters here would needlessly
        # constrain quality with no compatibility benefit.
        self.assertNotIn('vcodec', sel)
        self.assertNotIn('acodec', sel)
        self.assertNotIn('[ext=', sel)

    def test_no_unfiltered_height_when_quality_is_best(self):
        # Sanity: when quality is 'best', no height filter should appear,
        # otherwise the cascade silently caps at the previous default.
        sel, _ = ad.build_video_format_args('mp4', 'best')[1], 'mp4'
        self.assertNotIn('[height<=', sel)


# v1.4.0 (N1): PO Token provider detection + extractor-args wiring.
class PoTokenProviderTests(unittest.TestCase):
    def setUp(self):
        ad.reset_po_token_provider_cache()

    def tearDown(self):
        ad.reset_po_token_provider_cache()

    def test_is_youtube_url_matches_canonical_hosts(self):
        for url in (
            "https://www.youtube.com/watch?v=abc",
            "https://youtube.com/watch?v=abc",
            "https://m.youtube.com/watch?v=abc",
            "https://youtu.be/abc",
            "https://www.youtube-nocookie.com/embed/abc",
            "http://youtube.com/",
        ):
            with self.subTest(url=url):
                self.assertTrue(ad.is_youtube_url(url))

    def test_is_youtube_url_rejects_non_youtube(self):
        for url in (
            "",
            None,
            "https://example.com/watch?v=abc",
            "https://fake-youtube.com.evil.example/",
            "https://youtubevideos.example.com/",
            "ftp://youtube.com/",
            "javascript:alert(1)",
        ):
            with self.subTest(url=url):
                self.assertFalse(ad.is_youtube_url(url))

    def test_build_youtube_extractor_args_empty_for_non_youtube(self):
        # Non-YouTube URLs must never receive YouTube-specific extractor args
        # so the helper stays safe to splat unconditionally in _run_download.
        for url in ("https://example.com/v/1", "https://vimeo.com/1"):
            self.assertEqual(
                ad.build_youtube_extractor_args(
                    url,
                    po_token_provider={'ok': True, 'port': 4416, 'version': None},
                ),
                [],
            )

    def test_build_youtube_extractor_args_always_includes_sabr_formats_duplicate(self):
        # N2: SABR-only adaptiveFormats silently break downloads on the
        # 2026 web client. ``youtube:formats=duplicate`` asks yt-dlp to
        # return both HTTPS and SABR families. Must be emitted whether or
        # not a PO Token provider is reachable, because SABR is a read-time
        # concern, not a token-mediated one.
        without_provider = ad.build_youtube_extractor_args(
            "https://www.youtube.com/watch?v=abc",
        )
        with_provider = ad.build_youtube_extractor_args(
            "https://www.youtube.com/watch?v=abc",
            po_token_provider={'ok': True, 'port': 4416, 'version': '1.2.3'},
        )
        for label, args in (("no-provider", without_provider),
                            ("with-provider", with_provider)):
            with self.subTest(label=label):
                self.assertIn('youtube:formats=duplicate', args)
                # Must be paired with --extractor-args so yt-dlp parses it.
                idx = args.index('youtube:formats=duplicate')
                self.assertEqual(args[idx - 1], '--extractor-args')

    def test_build_youtube_extractor_args_includes_only_sabr_when_provider_absent(self):
        # Validates that PO token routing is gated on provider availability
        # while SABR is unconditional. Prevents future regressions where
        # somebody short-circuits the helper to return [] on provider miss.
        for absent in (None, {'ok': False}, {}):
            with self.subTest(provider=absent):
                args = ad.build_youtube_extractor_args(
                    "https://www.youtube.com/watch?v=abc",
                    po_token_provider=absent,
                )
                self.assertIn('youtube:formats=duplicate', args)
                self.assertFalse(any(
                    a.startswith('youtubepot-bgutilhttp:') for a in args
                ))

    def test_build_youtube_extractor_args_routes_bgutil_when_provider_ok(self):
        args = ad.build_youtube_extractor_args(
            "https://www.youtube.com/watch?v=abc",
            po_token_provider={'ok': True, 'port': 4416, 'version': '1.2.3'},
        )
        self.assertIn('--extractor-args', args)
        bgutil = next((a for a in args if a.startswith('youtubepot-bgutilhttp:')), None)
        self.assertIsNotNone(bgutil)
        self.assertIn('http://127.0.0.1:4416', bgutil)
        # SABR arg still present alongside provider routing.
        self.assertIn('youtube:formats=duplicate', args)

    def test_probe_caches_negative_result(self):
        # The probe MUST cache None too — otherwise every download retries
        # the probe over the network, blocking startup behind 1 s timeouts.
        calls = []
        original_get = ad.http_requests.get

        def fake_get(url, **kwargs):
            calls.append(url)
            raise Exception("not running")

        ad.http_requests.get = fake_get
        try:
            self.assertIsNone(ad.probe_po_token_provider(force=True))
            self.assertIsNone(ad.probe_po_token_provider())
            # Two requests on the first force call (one per probe path), zero
            # on the cached call.
            self.assertGreater(len(calls), 0)
            cached_count = len(calls)
            ad.probe_po_token_provider()
            self.assertEqual(len(calls), cached_count)
        finally:
            ad.http_requests.get = original_get

    def test_probe_uses_ping_endpoint_first(self):
        # /ping is the documented liveness check. The fallback to / exists
        # only for older provider builds, so /ping must be tried first.
        seen_paths = []
        original_get = ad.http_requests.get

        class FakeResp:
            ok = True
            headers = {'content-type': 'application/json'}
            status_code = 200

            def json(self):
                return {'version': '2.0.0'}

        def fake_get(url, **kwargs):
            seen_paths.append(url)
            return FakeResp()

        ad.http_requests.get = fake_get
        try:
            result = ad.probe_po_token_provider(force=True)
        finally:
            ad.http_requests.get = original_get
        self.assertIsNotNone(result)
        self.assertEqual(result['port'], 4416)
        self.assertEqual(result['version'], '2.0.0')
        self.assertTrue(seen_paths[0].endswith('/ping'))

    # iter-6 N14: stale-version notice.
    def test_probe_flags_stale_when_provider_below_min_version(self):
        """If the running provider reports a version < BGUTIL_POT_MIN_VERSION,
        the probe result must set stale=True so the extension popup can
        surface an 'update bgutil-pot' notice."""
        original_get = ad.http_requests.get

        class FakeResp:
            ok = True
            headers = {'content-type': 'application/json'}
            status_code = 200
            def json(self):
                return {'version': '1.0.0'}  # well below 1.3.0

        ad.http_requests.get = lambda url, **k: FakeResp()
        try:
            result = ad.probe_po_token_provider(force=True)
        finally:
            ad.http_requests.get = original_get
        self.assertIsNotNone(result)
        self.assertEqual(result['version'], '1.0.0')
        self.assertTrue(result['stale'])
        self.assertEqual(result['minVersion'], ad.BGUTIL_POT_MIN_VERSION)

    def test_probe_does_not_flag_stale_when_version_meets_or_beats_min(self):
        original_get = ad.http_requests.get

        class FakeResp:
            ok = True
            headers = {'content-type': 'application/json'}
            status_code = 200
            def json(self):
                return {'version': '1.3.1'}  # at/above 1.3.0

        ad.http_requests.get = lambda url, **k: FakeResp()
        try:
            result = ad.probe_po_token_provider(force=True)
        finally:
            ad.http_requests.get = original_get
        self.assertIsNotNone(result)
        self.assertEqual(result['version'], '1.3.1')
        self.assertFalse(result['stale'])

    def test_compare_semver_handles_unusual_inputs(self):
        # Pre-release suffix is truncated at first non-digit segment.
        self.assertEqual(ad._compare_semver('1.3.1-rc.2', '1.3.1'), 0)
        # 'v' prefix is stripped.
        self.assertEqual(ad._compare_semver('v1.3.1', '1.3.1'), 0)
        # Different lengths normalize with zero-pad.
        self.assertEqual(ad._compare_semver('1.3', '1.3.0'), 0)
        self.assertEqual(ad._compare_semver('1.3', '1.3.1'), -1)
        # Garbage inputs compare as empty lists (equal).
        self.assertEqual(ad._compare_semver(None, None), 0)
        self.assertEqual(ad._compare_semver('', ''), 0)


# v1.4.0 (NX10): ffmpeg capabilities audit.
class FfmpegCapabilitiesTests(unittest.TestCase):
    def setUp(self):
        ad.reset_ffmpeg_capabilities_cache()

    def tearDown(self):
        ad.reset_ffmpeg_capabilities_cache()

    def test_parse_ffmpeg_major_extracts_integer_from_canonical_release(self):
        self.assertEqual(ad.parse_ffmpeg_major('8.1.1'), 8)
        self.assertEqual(ad.parse_ffmpeg_major('7.0-static'), 7)
        self.assertEqual(ad.parse_ffmpeg_major('6.1.1-essentials_build'), 6)

    def test_parse_ffmpeg_major_returns_none_on_unparseable(self):
        # ffmpeg-master nightly / git builds report N-NNNNN-gXXXXXXX; not a
        # version we can interpret. None lets the caller degrade gracefully.
        for value in ('', None, 'N-118574-gabc1234', 'not-a-version'):
            with self.subTest(value=value):
                self.assertIsNone(ad.parse_ffmpeg_major(value))

    def test_check_ffmpeg_capabilities_treats_unparseable_as_unknown(self):
        # Monkeypatch get_ffmpeg_version to a snapshot-style string. The
        # audit must not return current=false in that case — snapshot
        # builds are intentionally non-numeric and we shouldn't alarm.
        original = ad.get_ffmpeg_version
        ad.get_ffmpeg_version = lambda *a, **k: 'N-118574-gabc1234'
        try:
            result = ad.check_ffmpeg_capabilities(force=True)
        finally:
            ad.get_ffmpeg_version = original
        self.assertIsNone(result['majorVersion'])
        self.assertIsNone(result['current'])
        self.assertIn('not detected', result['message'].lower() + ' ' +
                      'or snapshot' if 'snapshot' not in result['message'].lower() else result['message'])

    def test_check_ffmpeg_capabilities_marks_current_when_at_or_above_floor(self):
        original = ad.get_ffmpeg_version
        ad.get_ffmpeg_version = lambda *a, **k: '8.1.1'
        try:
            result = ad.check_ffmpeg_capabilities(force=True)
        finally:
            ad.get_ffmpeg_version = original
        self.assertEqual(result['majorVersion'], 8)
        self.assertTrue(result['current'])
        self.assertIn('meets', result['message'])

    def test_check_ffmpeg_capabilities_marks_stale_below_floor(self):
        original = ad.get_ffmpeg_version
        ad.get_ffmpeg_version = lambda *a, **k: '5.1.2'
        try:
            result = ad.check_ffmpeg_capabilities(force=True)
        finally:
            ad.get_ffmpeg_version = original
        self.assertEqual(result['majorVersion'], 5)
        self.assertFalse(result['current'])
        self.assertIn('below', result['message'])

    def test_health_endpoint_exposes_ffmpeg_capabilities(self):
        # Pin the wire contract — the extension popup will key off
        # /health.ffmpegCapabilities.current to render the stale-ffmpeg
        # pill.
        config = FakeConfig({"ServerToken": "z" * 32})
        manager = ad.DownloadManager(config, FakeHistory())
        api = ad.create_api(config, manager, FakeHistory())
        resp = api.test_client().get(
            "/health", headers={"X-MDL-Client": "MediaDL"},
        )
        body = resp.get_json()
        self.assertIn('ffmpegCapabilities', body)
        caps = body['ffmpegCapabilities']
        self.assertIsInstance(caps, dict)
        for key in ('majorVersion', 'current', 'message'):
            self.assertIn(key, caps)


class HealthPoTokenSurfaceTests(unittest.TestCase):
    def setUp(self):
        ad.reset_po_token_provider_cache()

    def tearDown(self):
        ad.reset_po_token_provider_cache()

    def test_health_includes_po_token_provider_field_null_when_absent(self):
        # The extension popup keys the amber "PO Token provider not detected"
        # pill off this exact field shape. Pin it so the wire contract is
        # explicit.
        config = FakeConfig({"ServerToken": "f" * 32})
        manager = ad.DownloadManager(config, FakeHistory())
        api = ad.create_api(config, manager, FakeHistory())

        # Force the probe to return None without hitting the network.
        original_get = ad.http_requests.get
        ad.http_requests.get = lambda *a, **k: (_ for _ in ()).throw(Exception("offline"))
        try:
            resp = api.test_client().get(
                "/health", headers={"X-MDL-Client": "MediaDL"},
            )
        finally:
            ad.http_requests.get = original_get
        body = resp.get_json()
        self.assertIn("poTokenProvider", body)
        self.assertIsNone(body["poTokenProvider"])


class DenoRuntimeProbeTests(unittest.TestCase):
    """iter-8 N20: probe_deno_runtime, version-date cutoff parsing, and
    /health.denoRuntime field shape. The extension's downloadHealthPanel
    keys the 'Deno: missing' warn pill off exactly this wire contract."""

    def setUp(self):
        ad.reset_deno_runtime_cache()

    def tearDown(self):
        ad.reset_deno_runtime_cache()

    def test_parse_ytdlp_release_date_extracts_yyyy_mm_dd(self):
        self.assertEqual(ad._parse_ytdlp_release_date("2026.04.10"), (2026, 4, 10))
        self.assertEqual(ad._parse_ytdlp_release_date("2025.10.22"), (2025, 10, 22))
        # Builds may carry a nightly suffix like 2026.05.03.233852 — should
        # still parse the leading YYYY.MM.DD prefix.
        self.assertEqual(ad._parse_ytdlp_release_date("2026.05.03.233852"), (2026, 5, 3))

    def test_parse_ytdlp_release_date_returns_none_on_garbage(self):
        for bad in ["", "git-sha-abc123", None, "v1.2.3", "not-a-version", "0.0.0"]:
            self.assertIsNone(ad._parse_ytdlp_release_date(bad))

    def test_parse_ytdlp_release_date_rejects_out_of_range_components(self):
        # Defensive — out-of-range month / day mean we got something other
        # than a real release date and the runtime probe should NOT flag it.
        self.assertIsNone(ad._parse_ytdlp_release_date("2026.13.10"))
        self.assertIsNone(ad._parse_ytdlp_release_date("2026.04.99"))
        self.assertIsNone(ad._parse_ytdlp_release_date("2026.00.10"))

    def test_ytdlp_needs_external_runtime_at_or_past_cutoff(self):
        # Cutoff is 2026.04.01.
        self.assertTrue(ad.ytdlp_needs_external_runtime("2026.04.01"))
        self.assertTrue(ad.ytdlp_needs_external_runtime("2026.04.10"))
        self.assertTrue(ad.ytdlp_needs_external_runtime("2026.05.03.233852"))
        self.assertTrue(ad.ytdlp_needs_external_runtime("2027.01.01"))

    def test_ytdlp_needs_external_runtime_before_cutoff_returns_false(self):
        self.assertFalse(ad.ytdlp_needs_external_runtime("2026.03.31"))
        self.assertFalse(ad.ytdlp_needs_external_runtime("2025.10.22"))
        self.assertFalse(ad.ytdlp_needs_external_runtime("2024.12.31"))

    def test_ytdlp_needs_external_runtime_unparseable_is_false(self):
        # Important: we MUST NOT false-positive on first-run when
        # get_ytdlp_version() returns an empty string before bootstrap.
        for bad in ["", None, "git-sha", "unknown"]:
            self.assertFalse(ad.ytdlp_needs_external_runtime(bad))

    def test_probe_deno_runtime_returns_wire_contract_shape(self):
        # Fake the underlying primitives so the test has no PATH dep.
        original_which = ad.shutil.which
        original_get_version = ad.get_ytdlp_version
        original_run_captured = ad._run_captured
        ad.shutil.which = lambda binary: '/usr/local/bin/deno' if binary == 'deno' else None
        ad.get_ytdlp_version = lambda force=False: '2026.05.03.233852'
        ad._run_captured = lambda args, timeout=5: 'deno 2.4.1 (release, x86_64-pc-windows-msvc)\nv8 13.0.245.25-rusty\ntypescript 5.6.2\n'
        try:
            result = ad.probe_deno_runtime(force=True)
        finally:
            ad.shutil.which = original_which
            ad.get_ytdlp_version = original_get_version
            ad._run_captured = original_run_captured
        # Wire-contract shape pin — extension/ytkit.js consumes EXACTLY
        # these fields. Adding fields is safe (additive); renaming or
        # dropping any of these would break the downloadHealthPanel.
        self.assertEqual(set(result.keys()), {
            'installed', 'version', 'path', 'ytdlpNeedsRuntime', 'advice'
        })
        self.assertTrue(result['installed'])
        self.assertEqual(result['version'], '2.4.1')
        self.assertEqual(result['path'], '/usr/local/bin/deno')
        self.assertTrue(result['ytdlpNeedsRuntime'])
        self.assertEqual(result['advice'], '')

    def test_probe_deno_runtime_surfaces_advice_when_needed_and_missing(self):
        original_which = ad.shutil.which
        original_get_version = ad.get_ytdlp_version
        ad.shutil.which = lambda binary: None  # deno absent
        ad.get_ytdlp_version = lambda force=False: '2026.05.03.233852'
        try:
            result = ad.probe_deno_runtime(force=True)
        finally:
            ad.shutil.which = original_which
            ad.get_ytdlp_version = original_get_version
        self.assertFalse(result['installed'])
        self.assertIsNone(result['version'])
        self.assertIsNone(result['path'])
        self.assertTrue(result['ytdlpNeedsRuntime'])
        self.assertIn('Deno', result['advice'])
        self.assertIn('yt-dlp', result['advice'])

    def test_probe_deno_runtime_quiet_on_pre_cutoff_ytdlp(self):
        # Field installs running the pre-Deno-line yt-dlp don't need the
        # runtime — the pill should stay quiet (ytdlpNeedsRuntime=False)
        # AND advice should be empty regardless of Deno presence.
        original_which = ad.shutil.which
        original_get_version = ad.get_ytdlp_version
        ad.shutil.which = lambda binary: None
        ad.get_ytdlp_version = lambda force=False: '2025.10.22'
        try:
            result = ad.probe_deno_runtime(force=True)
        finally:
            ad.shutil.which = original_which
            ad.get_ytdlp_version = original_get_version
        self.assertFalse(result['ytdlpNeedsRuntime'])
        self.assertEqual(result['advice'], '')

    def test_probe_deno_runtime_cached_within_ttl(self):
        original_which = ad.shutil.which
        original_get_version = ad.get_ytdlp_version
        call_count = {'n': 0}
        def counting_which(binary):
            call_count['n'] += 1
            return None
        ad.shutil.which = counting_which
        ad.get_ytdlp_version = lambda force=False: '2026.05.03'
        try:
            ad.probe_deno_runtime(force=True)
            ad.probe_deno_runtime()  # cached
            ad.probe_deno_runtime()  # cached
        finally:
            ad.shutil.which = original_which
            ad.get_ytdlp_version = original_get_version
        # Only the force=True call should have hit shutil.which; the
        # other two reads should have come from cache.
        self.assertEqual(call_count['n'], 1)


class HealthDenoRuntimeSurfaceTests(unittest.TestCase):
    """iter-8 N20: /health.denoRuntime field on the wire."""

    def setUp(self):
        ad.reset_deno_runtime_cache()
        ad.reset_po_token_provider_cache()

    def tearDown(self):
        ad.reset_deno_runtime_cache()
        ad.reset_po_token_provider_cache()

    def test_health_includes_deno_runtime_field(self):
        config = FakeConfig({"ServerToken": "f" * 32})
        manager = ad.DownloadManager(config, FakeHistory())
        api = ad.create_api(config, manager, FakeHistory())
        original_which = ad.shutil.which
        original_get_version = ad.get_ytdlp_version
        original_po_get = ad.http_requests.get
        ad.shutil.which = lambda binary: None
        ad.get_ytdlp_version = lambda force=False: '2025.10.22'
        ad.http_requests.get = lambda *a, **k: (_ for _ in ()).throw(Exception("offline"))
        try:
            resp = api.test_client().get(
                "/health", headers={"X-MDL-Client": "MediaDL"},
            )
        finally:
            ad.shutil.which = original_which
            ad.get_ytdlp_version = original_get_version
            ad.http_requests.get = original_po_get
        body = resp.get_json()
        self.assertIn("denoRuntime", body)
        self.assertIsInstance(body["denoRuntime"], dict)
        for key in ("installed", "version", "path", "ytdlpNeedsRuntime", "advice"):
            self.assertIn(key, body["denoRuntime"])

    def test_api_version_constant_at_2(self):
        # Adding fields to /health is additive — wire-major stays at 2.
        # Pin so a future bump is a deliberate, reviewed change.
        self.assertEqual(ad.SERVICE_API_VERSION, 2)

    def test_app_version_bumped_to_1_5_0(self):
        # iter-8 N20 ships the denoRuntime field — APP_VERSION must move.
        self.assertEqual(ad.APP_VERSION, "1.5.0")


if __name__ == "__main__":
    unittest.main()

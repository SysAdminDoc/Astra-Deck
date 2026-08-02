"""Durable scheduled subscription ingestion for the Astra Downloader.

The companion deliberately keeps subscription state separate from the normal
download history.  A subscription document contains the schedule and a
bounded archive of video keys, while the download queue carries the small
amount of linkage needed to reconcile a scan with a restart.  Ordinary
downloads never consult this store and remain re-downloadable.
"""

import copy
import json
import math
import re
import threading
import time
import uuid
from pathlib import Path
from urllib.parse import urlparse


__all__ = (
    "SUBSCRIPTION_SCHEMA_VERSION",
    "SUBSCRIPTION_MIN_INTERVAL_MINUTES",
    "SUBSCRIPTION_MAX_INTERVAL_MINUTES",
    "SUBSCRIPTION_MAX_RECORDS",
    "SUBSCRIPTION_MAX_ARCHIVE_ENTRIES",
    "SubscriptionStore",
    "SubscriptionManager",
    "normalize_subscription_candidate",
    "subscription_archive_key",
)


SUBSCRIPTION_SCHEMA_VERSION = 1
SUBSCRIPTION_MIN_INTERVAL_MINUTES = 5
SUBSCRIPTION_MAX_INTERVAL_MINUTES = 7 * 24 * 60
SUBSCRIPTION_MAX_RECORDS = 100
SUBSCRIPTION_MAX_ARCHIVE_ENTRIES = 20_000
_TEXT_LIMIT = 500
_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,120}$")
_YOUTUBE_HOST_RE = re.compile(
    r"^https?://(?:[^/]+\.)?(?:youtube\.com|youtu\.be|youtube-nocookie\.com)(?:/|$|\?)",
    re.IGNORECASE,
)


def _default_clean_text(value, default="", max_len=_TEXT_LIMIT):
    if value is None:
        return default
    cleaned = str(value).replace("\x00", "").strip()
    return cleaned[:max_len].rstrip() if len(cleaned) > max_len else cleaned


def _default_normalize_url(value):
    raw = _default_clean_text(value, "", 4096)
    parsed = urlparse(raw)
    if not raw or any(character.isspace() for character in raw):
        return None, "Enter a valid http or https URL."
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc:
        return None, "Enter a valid http or https URL."
    return raw, None


def _default_is_youtube_url(url):
    return bool(_YOUTUBE_HOST_RE.match(url or ""))


def _default_clamp_int(value, default, minimum, maximum):
    try:
        parsed = int(value)
    except (TypeError, ValueError, OverflowError):
        parsed = default
    return max(minimum, min(maximum, parsed))


def _default_coerce_bool(value, default=False):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"1", "true", "yes", "on"}:
            return True
        if lowered in {"0", "false", "no", "off"}:
            return False
    return default


def _copy(value):
    """Copy JSON-shaped state without exposing the store's live dictionaries."""
    return copy.deepcopy(value)


def _finite_timestamp(value, default=None):
    try:
        parsed = float(value)
    except (TypeError, ValueError, OverflowError):
        return default
    if not math.isfinite(parsed) or parsed <= 0:
        return default
    return parsed


def _safe_nonnegative_int(value, default=0):
    try:
        parsed = int(value)
    except (TypeError, ValueError, OverflowError):
        parsed = default
    return max(0, parsed)


def _safe_candidate_id(value):
    cleaned = _default_clean_text(value, "", 120)
    return cleaned if cleaned and _ID_RE.fullmatch(cleaned) else ""


def normalize_subscription_candidate(
    entry,
    *,
    normalize_url=None,
    is_youtube_url=None,
    clean_text=None,
):
    """Normalize one yt-dlp flat-playlist entry into a safe video candidate.

    Flat playlist output frequently uses a bare video ID in ``url``.  Those
    entries are converted to a canonical watch URL before they reach the
    downloader; arbitrary extractor output is never passed through as a
    download target.
    """
    normalize_url = normalize_url or _default_normalize_url
    is_youtube_url = is_youtube_url or _default_is_youtube_url
    clean_text = clean_text or _default_clean_text
    if isinstance(entry, str):
        entry = {"url": entry}
    if not isinstance(entry, dict):
        return None

    video_id = _safe_candidate_id(entry.get("id"))
    raw_url = entry.get("webpage_url") or entry.get("original_url") or entry.get("url")
    raw_url = clean_text(raw_url, "", 4096)
    if raw_url and not raw_url.lower().startswith(("http://", "https://")) and video_id:
        raw_url = f"https://www.youtube.com/watch?v={video_id}"
    url, error = normalize_url(raw_url)
    if error or not url or not is_youtube_url(url):
        if video_id:
            url, error = normalize_url(f"https://www.youtube.com/watch?v={video_id}")
        if error or not url or not is_youtube_url(url):
            return None

    title = clean_text(entry.get("title"), "(untitled)", 500) or "(untitled)"
    channel = clean_text(
        entry.get("channel") or entry.get("uploader"), "", 200
    )
    upload_date = clean_text(
        entry.get("upload_date") or entry.get("release_date"), "", 32
    )
    return {
        "id": video_id,
        "url": url,
        "title": title,
        "channel": channel,
        "uploadDate": upload_date,
    }


def subscription_archive_key(candidate):
    """Return a stable, global key for a normalized video candidate."""
    if not isinstance(candidate, dict):
        return ""
    video_id = _safe_candidate_id(candidate.get("id"))
    if video_id:
        return f"id:{video_id}"
    url = _default_clean_text(candidate.get("url"), "", 4096)
    return f"url:{url}" if url else ""


class SubscriptionStore:
    """Schema-checked atomic storage for schedules and their archive."""

    def __init__(
        self,
        *,
        path,
        reader=None,
        writer=None,
        logger=None,
        normalize_url=None,
        is_youtube_url=None,
        clean_text=None,
        clamp_int=None,
        coerce_bool=None,
        schema_version=SUBSCRIPTION_SCHEMA_VERSION,
        max_records=SUBSCRIPTION_MAX_RECORDS,
        max_archive_entries=SUBSCRIPTION_MAX_ARCHIVE_ENTRIES,
        clock=time.time,
    ):
        self.path = Path(path)
        self._reader = reader or self._read_json
        self._writer = writer or self._write_json
        self._logger = logger or (lambda _message: None)
        self._normalize_url = normalize_url or _default_normalize_url
        self._is_youtube_url = is_youtube_url or _default_is_youtube_url
        self._clean_text = clean_text or _default_clean_text
        self._clamp_int = clamp_int or _default_clamp_int
        self._coerce_bool = coerce_bool or _default_coerce_bool
        self.schema_version = int(schema_version)
        self.max_records = max(1, int(max_records))
        self.max_archive_entries = max(1, int(max_archive_entries))
        self._clock = clock
        self._lock = threading.RLock()
        self._compatible = True
        self._data = self._load()

    @staticmethod
    def _read_json(path, fallback):
        try:
            with open(path, "r", encoding="utf-8") as handle:
                value = json.load(handle)
            return value
        except (OSError, ValueError, TypeError):
            return fallback

    @staticmethod
    def _write_json(path, data):
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
        try:
            with open(temporary, "w", encoding="utf-8", newline="\n") as handle:
                json.dump(data, handle, indent=2)
                handle.write("\n")
                handle.flush()
            temporary.replace(path)
        finally:
            try:
                temporary.unlink(missing_ok=True)
            except OSError:
                pass

    def _clean(self, value, default="", max_len=_TEXT_LIMIT):
        try:
            return self._clean_text(value, default, max_len)
        except TypeError:
            return self._clean_text(value, default)

    def _load(self):
        raw = self._reader(self.path, {})
        if not isinstance(raw, dict):
            return self._empty()
        if raw and raw.get("schemaVersion") != self.schema_version:
            self._compatible = False
            self._logger(
                "Subscription state schema is incompatible; preserving the file without changes."
            )
            return self._empty()
        now = self._clock()
        subscriptions = []
        seen_ids = set()
        for item in raw.get("subscriptions", []) if isinstance(raw.get("subscriptions", []), list) else []:
            record = self._sanitize_subscription(item, now)
            if not record or record["id"] in seen_ids:
                continue
            seen_ids.add(record["id"])
            subscriptions.append(record)
            if len(subscriptions) >= self.max_records:
                break
        archive = self._sanitize_archive(raw.get("archive"))
        return {
            "schemaVersion": self.schema_version,
            "subscriptions": subscriptions,
            "archive": archive,
        }

    def _empty(self):
        return {
            "schemaVersion": self.schema_version,
            "subscriptions": [],
            "archive": {},
        }

    def _sanitize_subscription(self, raw, now):
        if not isinstance(raw, dict):
            return None
        sub_id = self._clean(raw.get("id"), "", 120)
        if not sub_id or not _ID_RE.fullmatch(sub_id):
            return None
        url, error = self._normalize_url(raw.get("url"))
        if error or not url or not self._is_youtube_url(url):
            return None
        interval = self._clamp_int(
            raw.get("intervalMinutes"),
            60,
            SUBSCRIPTION_MIN_INTERVAL_MINUTES,
            SUBSCRIPTION_MAX_INTERVAL_MINUTES,
        )
        created = _finite_timestamp(raw.get("createdAt"), now) or now
        updated = _finite_timestamp(raw.get("updatedAt"), created) or created
        last_scan = _finite_timestamp(raw.get("lastScanAt"), None)
        enabled = self._coerce_bool(raw.get("enabled"), True)
        next_scan = _finite_timestamp(raw.get("nextScanAt"), None)
        if next_scan is None and enabled:
            next_scan = now
        return {
            "id": sub_id,
            "url": url,
            "title": self._clean(raw.get("title"), "", 300),
            "intervalMinutes": interval,
            "enabled": enabled,
            "createdAt": created,
            "updatedAt": updated,
            "lastScanAt": last_scan,
            "nextScanAt": next_scan,
            "lastError": self._clean(raw.get("lastError"), "", 500),
            "lastQueued": _safe_nonnegative_int(raw.get("lastQueued")),
            "lastSkipped": _safe_nonnegative_int(raw.get("lastSkipped")),
        }

    def _sanitize_archive(self, raw):
        if not isinstance(raw, dict):
            return {}
        entries = []
        for key, value in raw.items():
            key = self._clean(key, "", 430)
            if not key or not isinstance(value, dict):
                continue
            status = self._clean(value.get("status"), "failed", 16)
            if status not in {"reserved", "queued", "complete", "failed"}:
                status = "failed"
            entry = {
                "url": self._clean(value.get("url"), "", 4096),
                "title": self._clean(value.get("title"), "(untitled)", 500) or "(untitled)",
                "subscriptionId": self._clean(value.get("subscriptionId"), "", 120),
                "downloadId": self._clean(value.get("downloadId"), "", 120),
                "status": status,
                "createdAt": _finite_timestamp(value.get("createdAt"), self._clock()) or self._clock(),
                "updatedAt": _finite_timestamp(value.get("updatedAt"), self._clock()) or self._clock(),
                "completedAt": _finite_timestamp(value.get("completedAt"), None),
                "lastError": self._clean(value.get("lastError"), "", 500),
            }
            entries.append((key, entry))
        entries.sort(key=lambda item: item[1]["updatedAt"], reverse=True)
        return dict(entries[: self.max_archive_entries])

    def _save_locked(self):
        if not self._compatible:
            return False
        try:
            self._writer(self.path, _copy(self._data))
            return True
        except Exception as error:  # noqa: BLE001
            self._logger(f"Subscription state save failed: {error}")
            return False

    def _mutate(self, callback):
        with self._lock:
            before = _copy(self._data)
            result = callback(self._data)
            if self._save_locked():
                return result
            self._data = before
            return None

    def _find_locked(self, sub_id):
        return next(
            (item for item in self._data["subscriptions"] if item["id"] == sub_id),
            None,
        )

    def list_subscriptions(self):
        with self._lock:
            return _copy(self._data["subscriptions"])

    def get_subscription(self, sub_id):
        with self._lock:
            item = self._find_locked(str(sub_id))
            return _copy(item) if item else None

    def add_subscription(self, url, *, interval_minutes=60, enabled=True, title="", now=None):
        url, error = self._normalize_url(url)
        if error or not url or not self._is_youtube_url(url):
            return None, "Subscriptions must use a YouTube channel or playlist URL."
        now = _finite_timestamp(now, self._clock()) or self._clock()
        with self._lock:
            if len(self._data["subscriptions"]) >= self.max_records:
                return None, f"Subscription limit reached ({self.max_records})."
            if any(item["url"] == url for item in self._data["subscriptions"]):
                return None, "That subscription is already configured."
            interval = self._clamp_int(
                interval_minutes,
                60,
                SUBSCRIPTION_MIN_INTERVAL_MINUTES,
                SUBSCRIPTION_MAX_INTERVAL_MINUTES,
            )
            record = {
                "id": f"sub_{uuid.uuid4().hex[:16]}",
                "url": url,
                "title": self._clean(title, "", 300),
                "intervalMinutes": interval,
                "enabled": self._coerce_bool(enabled, True),
                "createdAt": now,
                "updatedAt": now,
                "lastScanAt": None,
                "nextScanAt": now,
                "lastError": "",
                "lastQueued": 0,
                "lastSkipped": 0,
            }
            before = _copy(self._data)
            self._data["subscriptions"].append(record)
            if not self._save_locked():
                self._data = before
                return None, "Could not save subscriptions. Check disk space and permissions."
            return _copy(record), None

    def update_subscription(self, sub_id, *, url=None, interval_minutes=None,
                            enabled=None, title=None, now=None):
        now = _finite_timestamp(now, self._clock()) or self._clock()
        with self._lock:
            record = self._find_locked(str(sub_id))
            if record is None:
                return None, "Subscription no longer exists."
            before = _copy(self._data)
            if url is not None:
                normalized, error = self._normalize_url(url)
                if error or not normalized or not self._is_youtube_url(normalized):
                    return None, "Subscriptions must use a YouTube channel or playlist URL."
                if any(
                    item["id"] != record["id"] and item["url"] == normalized
                    for item in self._data["subscriptions"]
                ):
                    return None, "That subscription is already configured."
                record["url"] = normalized
            if interval_minutes is not None:
                record["intervalMinutes"] = self._clamp_int(
                    interval_minutes,
                    record["intervalMinutes"],
                    SUBSCRIPTION_MIN_INTERVAL_MINUTES,
                    SUBSCRIPTION_MAX_INTERVAL_MINUTES,
                )
            was_enabled = bool(record["enabled"])
            if enabled is not None:
                record["enabled"] = self._coerce_bool(enabled, was_enabled)
            if title is not None:
                record["title"] = self._clean(title, "", 300)
            record["updatedAt"] = now
            if record["enabled"] and not was_enabled:
                record["nextScanAt"] = now
            elif not record["enabled"]:
                record["nextScanAt"] = None
            if not self._save_locked():
                self._data = before
                return None, "Could not save subscriptions. Check disk space and permissions."
            return _copy(record), None

    def remove_subscription(self, sub_id):
        with self._lock:
            before = _copy(self._data)
            original = len(self._data["subscriptions"])
            self._data["subscriptions"] = [
                item for item in self._data["subscriptions"] if item["id"] != str(sub_id)
            ]
            if len(self._data["subscriptions"]) == original:
                return False, "Subscription no longer exists."
            if not self._save_locked():
                self._data = before
                return False, "Could not save subscriptions. Check disk space and permissions."
            return True, None

    def due_subscriptions(self, now=None):
        now = _finite_timestamp(now, self._clock()) or self._clock()
        with self._lock:
            return _copy([
                item for item in self._data["subscriptions"]
                if item["enabled"] and item.get("nextScanAt") is not None
                and float(item["nextScanAt"]) <= now
            ])

    def begin_scan(self, sub_id, now=None):
        now = _finite_timestamp(now, self._clock()) or self._clock()
        with self._lock:
            record = self._find_locked(str(sub_id))
            if record is None:
                return None
            before = _copy(self._data)
            record["lastScanAt"] = now
            record["lastError"] = ""
            record["nextScanAt"] = now + record["intervalMinutes"] * 60
            record["updatedAt"] = now
            if not self._save_locked():
                self._data = before
                return None
            return _copy(record)

    def finish_scan(self, sub_id, *, queued=0, skipped=0, error="", now=None):
        now = _finite_timestamp(now, self._clock()) or self._clock()
        with self._lock:
            record = self._find_locked(str(sub_id))
            if record is None:
                return False
            before = _copy(self._data)
            record["lastQueued"] = _safe_nonnegative_int(queued)
            record["lastSkipped"] = _safe_nonnegative_int(skipped)
            record["lastError"] = self._clean(error, "", 500)
            record["nextScanAt"] = now + record["intervalMinutes"] * 60
            record["updatedAt"] = now
            if not self._save_locked():
                self._data = before
                return False
            return True

    def reserve_archive(self, key, candidate, subscription_id, now=None):
        key = self._clean(key, "", 430)
        if not key or not isinstance(candidate, dict):
            return False
        now = _finite_timestamp(now, self._clock()) or self._clock()
        with self._lock:
            existing = self._data["archive"].get(key)
            if existing and existing.get("status") in {"reserved", "queued", "complete"}:
                return False
            before = _copy(self._data)
            self._data["archive"][key] = {
                "url": self._clean(candidate.get("url"), "", 4096),
                "title": self._clean(candidate.get("title"), "(untitled)", 500) or "(untitled)",
                "subscriptionId": self._clean(subscription_id, "", 120),
                "downloadId": "",
                "status": "reserved",
                "createdAt": now,
                "updatedAt": now,
                "completedAt": None,
                "lastError": "",
            }
            self._trim_archive_locked()
            if not self._save_locked():
                self._data = before
                return False
            return True

    def mark_archive_queued(self, key, download_id, now=None):
        return self._update_archive(
            key,
            status="queued",
            downloadId=self._clean(download_id, "", 120),
            lastError="",
            now=now,
        )

    def release_archive(self, key, error="", now=None):
        return self._update_archive(
            key,
            status="failed",
            downloadId="",
            lastError=self._clean(error, "Download could not be queued.", 500),
            now=now,
        )

    def mark_download(self, download_id, status, error="", now=None):
        download_id = self._clean(download_id, "", 120)
        if not download_id:
            return 0
        status = "complete" if status == "complete" else "failed"
        now = _finite_timestamp(now, self._clock()) or self._clock()
        with self._lock:
            matches = [
                entry for entry in self._data["archive"].values()
                if entry.get("downloadId") == download_id
            ]
            if not matches:
                return 0
            before = _copy(self._data)
            for entry in matches:
                entry["status"] = status
                entry["updatedAt"] = now
                entry["lastError"] = self._clean(error, "", 500)
                if status == "complete":
                    entry["completedAt"] = now
            if not self._save_locked():
                self._data = before
                return 0
            return len(matches)

    def reconcile_downloads(self, downloads, now=None):
        """Attach queue-restored subscription records and reopen orphan claims."""
        now = _finite_timestamp(now, self._clock()) or self._clock()
        active = {}
        for download in downloads or []:
            dl_id = self._clean(getattr(download, "id", ""), "", 120)
            key = self._clean(getattr(download, "archive_key", ""), "", 430)
            sub_id = self._clean(getattr(download, "subscription_id", ""), "", 120)
            if dl_id and key:
                active[dl_id] = (key, sub_id)
        with self._lock:
            before = _copy(self._data)
            changed = False
            active_keys = set()
            for dl_id, (key, sub_id) in active.items():
                entry = self._data["archive"].get(key)
                if not entry:
                    continue
                active_keys.add(key)
                if entry.get("downloadId") != dl_id or entry.get("status") != "queued":
                    entry["downloadId"] = dl_id
                    entry["subscriptionId"] = sub_id or entry.get("subscriptionId", "")
                    entry["status"] = "queued"
                    entry["updatedAt"] = now
                    changed = True
            for key, entry in self._data["archive"].items():
                if entry.get("status") in {"reserved", "queued"} and key not in active_keys:
                    entry["status"] = "failed"
                    entry["downloadId"] = ""
                    entry["lastError"] = "Scheduled download was interrupted; it will retry on the next scan."
                    entry["updatedAt"] = now
                    changed = True
            if changed and not self._save_locked():
                self._data = before
                return False
            return True

    def archive_summary(self):
        with self._lock:
            counts = {"reserved": 0, "queued": 0, "complete": 0, "failed": 0}
            for entry in self._data["archive"].values():
                status = entry.get("status")
                if status in counts:
                    counts[status] += 1
            return {"total": sum(counts.values()), **counts}

    def archive_entries(self):
        with self._lock:
            return _copy(self._data["archive"])

    def _update_archive(self, key, *, status, downloadId, lastError, now=None):
        key = self._clean(key, "", 430)
        now = _finite_timestamp(now, self._clock()) or self._clock()
        with self._lock:
            entry = self._data["archive"].get(key)
            if not entry:
                return False
            before = _copy(self._data)
            entry["status"] = status
            entry["downloadId"] = self._clean(downloadId, "", 120)
            entry["lastError"] = self._clean(lastError, "", 500)
            entry["updatedAt"] = now
            if not self._save_locked():
                self._data = before
                return False
            return True

    def _trim_archive_locked(self):
        if len(self._data["archive"]) <= self.max_archive_entries:
            return
        ordered = sorted(
            self._data["archive"].items(),
            key=lambda item: (
                2 if item[1].get("status") in {"reserved", "queued"}
                else 1 if item[1].get("status") == "complete" else 0,
                item[1].get("updatedAt", 0),
            ),
            reverse=True,
        )
        self._data["archive"] = dict(ordered[: self.max_archive_entries])


class SubscriptionManager:
    """Scheduler and scan coordinator around :class:`SubscriptionStore`."""

    def __init__(
        self,
        *,
        store,
        probe,
        enqueue,
        status_reader=None,
        logger=None,
        clock=time.time,
        tick_seconds=15,
    ):
        self.store = store
        self._probe = probe
        self._enqueue = enqueue
        self._status_reader = status_reader or (lambda _download_id: "failed")
        self._logger = logger or (lambda _message: None)
        self._clock = clock
        self._tick_seconds = max(1.0, float(tick_seconds))
        self._lock = threading.RLock()
        self._scan_ids = set()
        self._stop = threading.Event()
        self._thread = None

    def list_subscriptions(self):
        return self.store.list_subscriptions()

    def snapshot(self):
        with self._lock:
            scanning = sorted(self._scan_ids)
            running = bool(self._thread and self._thread.is_alive())
        return {
            "subscriptions": self.store.list_subscriptions(),
            "archive": self.store.archive_summary(),
            "schedulerRunning": running,
            "scanning": scanning,
        }

    def add_subscription(self, url, interval_minutes=60, enabled=True, title=""):
        return self.store.add_subscription(
            url,
            interval_minutes=interval_minutes,
            enabled=enabled,
            title=title,
        )

    def update_subscription(self, sub_id, **fields):
        allowed = {"url", "interval_minutes", "enabled", "title"}
        values = {key: value for key, value in fields.items() if key in allowed}
        return self.store.update_subscription(str(sub_id), **values)

    def remove_subscription(self, sub_id):
        return self.store.remove_subscription(str(sub_id))

    def start(self):
        with self._lock:
            if self._thread and self._thread.is_alive():
                return False
            self._stop.clear()
            self._thread = threading.Thread(
                target=self._run,
                name="AstraDownloaderSubscriptions",
                daemon=True,
            )
            self._thread.start()
            return True

    def stop(self, timeout=2):
        with self._lock:
            thread = self._thread
            self._stop.set()
        if thread and thread.is_alive():
            thread.join(timeout=max(0.1, float(timeout)))
        with self._lock:
            if self._thread is thread and (not thread or not thread.is_alive()):
                self._thread = None

    def _run(self):
        # A first pass is intentionally immediate: adding a subscription while
        # the companion is running should not wait for an entire interval.
        while not self._stop.is_set():
            try:
                self.scan_due()
            except Exception as error:  # noqa: BLE001
                self._logger(f"Subscription scheduler failed: {error}")
            self._stop.wait(self._tick_seconds)

    def scan_due(self, now=None):
        due = self.store.due_subscriptions(now)
        results = []
        for item in due:
            results.append(self.scan_subscription(item["id"], now=now))
        return results

    def request_scan(self, sub_id):
        sub_id = str(sub_id)
        if not self.store.get_subscription(sub_id):
            return None, "Subscription no longer exists."
        with self._lock:
            if sub_id in self._scan_ids:
                return {"id": sub_id, "scheduled": False, "scanning": True}, None
        threading.Thread(
            target=self.scan_subscription,
            kwargs={"sub_id": sub_id},
            name=f"AstraSubscriptionScan-{sub_id}",
            daemon=True,
        ).start()
        return {"id": sub_id, "scheduled": True}, None

    def scan_now(self, sub_id, *, background=False):
        if background:
            return self.request_scan(sub_id)
        return self.scan_subscription(sub_id)

    def scan_subscription(self, sub_id, *, now=None):
        sub_id = str(sub_id)
        with self._lock:
            if sub_id in self._scan_ids:
                return {"id": sub_id, "queued": 0, "skipped": 0, "scanning": True}
            self._scan_ids.add(sub_id)
        try:
            started = self.store.begin_scan(sub_id, now=now)
            if not started:
                return {"id": sub_id, "queued": 0, "skipped": 0, "error": "Subscription no longer exists."}
            try:
                probe_result = self._probe(started["url"])
                if isinstance(probe_result, tuple):
                    entries, probe_error = probe_result
                else:
                    entries, probe_error = probe_result, None
            except Exception as error:  # noqa: BLE001
                entries, probe_error = [], str(error)
            if probe_error:
                message = str(probe_error)[:500]
                self.store.finish_scan(sub_id, error=message, now=now)
                return {"id": sub_id, "queued": 0, "skipped": 0, "error": message}

            candidates = []
            for entry in entries if isinstance(entries, (list, tuple)) else []:
                candidate = normalize_subscription_candidate(
                    entry,
                    normalize_url=self.store._normalize_url,
                    is_youtube_url=self.store._is_youtube_url,
                    clean_text=self.store._clean_text,
                )
                if candidate:
                    candidates.append(candidate)

            queued = 0
            skipped = 0
            errors = []
            for candidate in candidates:
                key = subscription_archive_key(candidate)
                if not self.store.reserve_archive(key, candidate, sub_id, now=now):
                    skipped += 1
                    continue
                try:
                    result = self._enqueue(started, candidate, key)
                    if isinstance(result, tuple):
                        download_id, enqueue_error = result
                    else:
                        download_id, enqueue_error = result, None
                except Exception as error:  # noqa: BLE001
                    download_id, enqueue_error = None, str(error)
                if enqueue_error or not download_id:
                    message = str(enqueue_error or "Download could not be queued.")[:500]
                    self.store.release_archive(key, message, now=now)
                    errors.append(message)
                    continue
                if not self.store.mark_archive_queued(key, download_id, now=now):
                    errors.append("Could not save scheduled download archive state.")
                queued += 1

            error = "; ".join(errors[:3])
            self.store.finish_scan(
                sub_id,
                queued=queued,
                skipped=skipped,
                error=error,
                now=now,
            )
            return {
                "id": sub_id,
                "queued": queued,
                "skipped": skipped,
                "error": error,
            }
        finally:
            with self._lock:
                self._scan_ids.discard(sub_id)

    def handle_download_completed(self, download_id):
        status = self._status_reader(download_id)
        return self.store.mark_download(
            download_id,
            status,
            error="Scheduled download failed." if status != "complete" else "",
        )

    def reconcile_downloads(self, downloads):
        return self.store.reconcile_downloads(downloads)

import importlib.util
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock


MODULE_PATH = Path(__file__).with_name('build.py')
SPEC = importlib.util.spec_from_file_location('astra_downloader_release_build', MODULE_PATH)
build = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(build)


class FakeDistribution:
    def __init__(self, name, version, requires=()):
        self.metadata = {'Name': name, 'License': 'MIT'}
        self.version = version
        self.requires = list(requires)
        self.files = []


class ReleaseConstraintsTests(unittest.TestCase):
    def test_frozen_build_keeps_lazy_boundary_modules_in_the_graph(self):
        source = MODULE_PATH.read_text(encoding='utf-8')
        for module_name in ('_compat', 'config', 'download', 'health', 'routes', 'gui'):
            self.assertIn(f'"--hidden-import", "{module_name}"', source)

    def test_reviewed_constraints_are_exact_and_cover_release_roots(self):
        constraints = build.parse_release_constraints()
        self.assertGreaterEqual(len(constraints), 30)
        for required in ('pyinstaller', 'pyqt6', 'flask', 'requests', 'waitress', 'yt-dlp'):
            self.assertIn(required, constraints)
            self.assertTrue(constraints[required]['version'])

    def test_constraint_parser_rejects_ranges_and_duplicates(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'constraints.txt'
            for invalid in ('demo>=1\n', 'demo==1\ndemo==1\n'):
                path.write_text(invalid, encoding='utf-8')
                with self.assertRaises(SystemExit):
                    build.parse_release_constraints(path)

    def _verify_fixture(self, app_requires=('dep>=2',), app_version='1.0'):
        distributions = {
            'app': FakeDistribution('app', app_version, app_requires),
            'dep': FakeDistribution('dep', '2.0'),
            'pyinstaller': FakeDistribution('pyinstaller', '3.0'),
        }
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            requirements = root / 'requirements.txt'
            constraints = root / 'constraints.txt'
            requirements.write_text('app>=1,<2\n', encoding='utf-8')
            constraints.write_text('app==1.0\ndep==2.0\npyinstaller==3.0\n', encoding='utf-8')

            def distribution(name):
                key = build.canonicalize_name(name)
                if key not in distributions:
                    raise build.importlib.metadata.PackageNotFoundError(name)
                return distributions[key]

            with mock.patch.object(build, 'REQUIREMENTS', requirements), \
                 mock.patch.object(build, 'RELEASE_CONSTRAINTS', constraints), \
                 mock.patch.object(build.sys, 'platform', 'win32'), \
                 mock.patch.object(build.importlib.metadata, 'distribution', side_effect=distribution):
                return build.verify_release_environment()

    def test_environment_verifier_returns_exact_dependency_edges(self):
        result = self._verify_fixture()
        self.assertEqual(result['graph']['app'], ['dep'])
        self.assertEqual(result['constraints']['dep']['version'], '2.0')

    def test_environment_verifier_rejects_unreviewed_active_dependency(self):
        with self.assertRaisesRegex(SystemExit, 'Unreviewed active dependency'):
            self._verify_fixture(app_requires=('rogue>=1',))

    def test_environment_verifier_rejects_installed_version_drift(self):
        with self.assertRaisesRegex(SystemExit, 'Release environment drift'):
            self._verify_fixture(app_version='1.1')

    def test_prepare_translations_fails_on_stale_qm_without_compiler(self):
        expected = (
            'ar', 'de', 'en', 'es', 'fr', 'it', 'ja', 'ko', 'pt_BR', 'ru',
            'zh_CN',
        )
        with tempfile.TemporaryDirectory() as tmp:
            translations = Path(tmp)
            for locale in expected:
                ts = translations / f'astra_downloader_{locale}.ts'
                qm = translations / f'astra_downloader_{locale}.qm'
                ts.write_text('<TS/>', encoding='utf-8')
                qm.write_bytes(b'compiled')

            stale_ts = translations / 'astra_downloader_en.ts'
            stale_qm = translations / 'astra_downloader_en.qm'
            os.utime(stale_qm, ns=(1_000_000_000, 1_000_000_000))
            os.utime(stale_ts, ns=(2_000_000_000, 2_000_000_000))

            with mock.patch.object(build, 'TRANSLATIONS_DIR', translations), \
                 mock.patch.object(build.shutil, 'which', return_value=None):
                with self.assertRaisesRegex(SystemExit, r'stale \.qm catalogues.*en'):
                    build.prepare_translations()


if __name__ == '__main__':
    unittest.main()

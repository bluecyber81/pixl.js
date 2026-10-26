"""Actual version generator: Git checkouts, source archives, malformed metadata."""
import argparse
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import shutil
import tempfile
import unittest
from unittest.mock import patch

FW=Path(__file__).resolve().parents[2]
SOURCE=FW/'scripts/version_gen.py'
spec=importlib.util.spec_from_file_location('pixl_version_generator_tested',SOURCE)
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
VERSION='2.21.0-DE3.18'
COMMIT='57a3643'
EPOCH='1792713600'
DEFAULT={'rev-parse --short HEAD':COMMIT,'diff --quiet':'',
         'rev-parse --abbrev-ref HEAD':'main','rev-list --count HEAD':'123',
         'describe --tags --abbrev=0 --exact-match':'v2.21.1'}

def fake_git(overrides=None):
    values=DEFAULT.copy();values.update(overrides or {})
    def execute(command,**kwargs):
        assert command[0]=='git' and 'cwd' in kwargs
        value=values[' '.join(command[1:])]
        if isinstance(value,Exception):raise value
        return value if isinstance(value,bytes) else value.encode('utf-8')
    return execute

def error(code=128):return subprocess.CalledProcessError(code,['git'],output=b'not a repository')

class VersionTests(unittest.TestCase):
    def info(self,env=None,overrides=None,side_effect=None):
        with patch.dict(os.environ,env or {},clear=True),patch.object(
                module.subprocess,'check_output',side_effect=side_effect or fake_git(overrides)):
            return module.GitVersion('.').get_version_info()

    def generate(self,env=None,overrides=None,side_effect=None):
        with tempfile.TemporaryDirectory(prefix='pixl-version-archive-') as tmp:
            root=Path(tmp);(root/'application/src').mkdir(parents=True)
            with patch.dict(os.environ,{'SOURCE_DATE_EPOCH':EPOCH,**(env or {})},clear=True),patch.object(
                    module.subprocess,'check_output',side_effect=side_effect or fake_git(overrides)),patch.object(
                    module.Main,'get_root_dir',return_value=str(root)),contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(module.Main().generate(),0)
            return ((root/'application/src/version.inc.h').read_text(),
                    json.loads((root/'application/src/version.json').read_text()))

    def test_normal_clean_metadata(self):
        value=self.info({'APP_VERSION':VERSION})
        self.assertEqual((value['GIT_COMMIT'],value['GIT_BRANCH'],value['GIT_BRANCH_NUM']),
                         (COMMIT,'main','123'))
        self.assertEqual((value['BUILD_DIRTY'],value['BUILD_DIRTY_KNOWN']),(0,1))

    def test_normal_dirty_metadata(self):
        value=self.info({'APP_VERSION':VERSION},{'diff --quiet':error(1)})
        self.assertEqual((value['BUILD_DIRTY'],value['BUILD_DIRTY_KNOWN']),(1,1))

    def test_diff_failure_does_not_claim_clean(self):
        for failure in (error(128),FileNotFoundError(),PermissionError(),UnicodeError()):
            with self.subTest(failure=type(failure).__name__):
                value=self.info({'APP_VERSION':VERSION},{'diff --quiet':failure})
                self.assertEqual((value['BUILD_DIRTY'],value['BUILD_DIRTY_KNOWN']),(1,0))

    def test_git_missing_all_metadata_unknown(self):
        value=self.info({'APP_VERSION':VERSION},side_effect=FileNotFoundError('git missing'))
        self.assertEqual((value['GIT_COMMIT'],value['GIT_BRANCH'],value['GIT_BRANCH_NUM']),
                         ('unknown','source-archive','n/a'))
        self.assertEqual((value['BUILD_DIRTY'],value['BUILD_DIRTY_KNOWN']),(1,0))

    def test_non_repository_all_queries_handled(self):
        value=self.info({'APP_VERSION':VERSION},side_effect=error())
        self.assertEqual(value['VERSION'],VERSION)
        self.assertEqual(value['GIT_BRANCH'],'source-archive')

    def test_real_non_repository_directory(self):
        environment={'APP_VERSION':VERSION,'PATH':os.environ.get('PATH','')}
        if 'SYSTEMROOT' in os.environ:environment['SYSTEMROOT']=os.environ['SYSTEMROOT']
        with tempfile.TemporaryDirectory(prefix='pixl-no-git-') as tmp,patch.dict(
                os.environ,environment,clear=True):
            self.assertIsNotNone(shutil.which('git'))
            value=module.GitVersion(tmp).get_version_info()
        self.assertEqual(value['VERSION'],VERSION)
        self.assertEqual(value['GIT_COMMIT'],'unknown')
        self.assertEqual(value['BUILD_DIRTY_KNOWN'],0)

    def test_archive_requires_explicit_app_version(self):
        for env in ({},{'FW_VERSION':VERSION},{'GITHUB_REF_TYPE':'tag','GITHUB_REF_NAME':VERSION}):
            with self.subTest(env=env),self.assertRaisesRegex(ValueError,'APP_VERSION is required'):
                self.info(env,side_effect=error())

    def test_malformed_commit_is_unknown(self):
        for raw in ('','not-a-hash','123\n#define BAD 1',b'\xff'):
            with self.subTest(raw=raw):
                value=self.info({'APP_VERSION':VERSION},{'rev-parse --short HEAD':raw})
                self.assertEqual(value['GIT_COMMIT'],'unknown')
                self.assertEqual(value['BUILD_DIRTY_KNOWN'],0)

    def test_branch_and_count_failure_fallback(self):
        value=self.info({'APP_VERSION':VERSION},{'rev-parse --abbrev-ref HEAD':error(),
                                               'rev-list --count HEAD':PermissionError()})
        self.assertEqual((value['GIT_BRANCH'],value['GIT_BRANCH_NUM']),('unknown','n/a'))

    def test_malformed_branch_and_count_not_emitted(self):
        value=self.info({'APP_VERSION':VERSION},{'rev-parse --abbrev-ref HEAD':'bad\nbranch',
                                               'rev-list --count HEAD':'not-an-integer'})
        self.assertEqual((value['GIT_BRANCH'],value['GIT_BRANCH_NUM']),('unknown','n/a'))

    def test_workflow_override_preserved(self):
        value=self.info({'APP_VERSION':VERSION,'WORKFLOW_BRANCH_OR_TAG':'release/DE3.18'},
                        {'rev-parse --abbrev-ref HEAD':error()})
        self.assertEqual(value['GIT_BRANCH'],'release/DE3.18')

    def test_explicit_app_version_precedes_ci(self):
        value=self.info({'APP_VERSION':VERSION,'GITHUB_REF_TYPE':'branch','GITHUB_RUN_NUMBER':'bad'})
        self.assertEqual(value['VERSION'],VERSION)

    def test_normal_ci_tag_and_branch(self):
        self.assertEqual(self.info({'GITHUB_REF_TYPE':'tag','GITHUB_REF_NAME':'v2.22.0'})['VERSION'],'v2.22.0')
        self.assertEqual(self.info({'GITHUB_REF_TYPE':'branch','GITHUB_RUN_NUMBER':'576'})['VERSION'],'b576')

    def test_missing_ci_run_number_has_actionable_error(self):
        for env in ({'GITHUB_REF_TYPE':'branch'}, {'GITHUB_REF_TYPE':'branch','GITHUB_RUN_NUMBER':'bad'}):
            with self.subTest(env=env),self.assertRaisesRegex(ValueError,'GITHUB_RUN_NUMBER'):
                self.info(env)

    def test_exact_git_tag_and_describe_failure(self):
        self.assertEqual(self.info()['VERSION'],'v2.21.1')
        value=self.info(overrides={'describe --tags --abbrev=0 --exact-match':FileNotFoundError()})
        self.assertEqual(value['VERSION'],'unknown')

    def test_empty_or_control_app_version_rejected(self):
        for value in ('',' ','bad\nversion'):
            with self.subTest(value=value),self.assertRaisesRegex(ValueError,'nonempty'):
                self.info({'APP_VERSION':value})
        # OS environments reject NUL before the generator can receive it.
        self.assertFalse(module.GitVersion._valid_text('bad\x00version'))

    def test_generated_archive_metadata_and_current_date(self):
        header,value=self.generate({'APP_VERSION':VERSION},side_effect=error())
        self.assertIn('#define VERSION "'+VERSION+'"',header)
        self.assertIn('#define BUILD_DIRTY_KNOWN 0',header)
        self.assertIsNone(value['firmware_build_dirty'])
        self.assertEqual(value['firmware_build_date'],'2026-10-23')

    def test_generated_known_dirty_state(self):
        for dirty in (False,True):
            header,value=self.generate({'APP_VERSION':VERSION},{'diff --quiet':error(1) if dirty else ''})
            self.assertIn('#define BUILD_DIRTY_KNOWN 1',header)
            self.assertIs(value['firmware_build_dirty'],dirty)

    def test_explicit_version_literal_and_header_escaping(self):
        for version in ('unknown','DE3.18-"quoted"-\\literal'):
            header,_=self.generate({'APP_VERSION':version})
            emitted=next(line.split(' ',2)[2] for line in header.splitlines() if line.startswith('#define VERSION '))
            self.assertEqual(json.loads(emitted),version)

    def test_normal_git_fallback_still_supported(self):
        header,_=self.generate(overrides={'describe --tags --abbrev=0 --exact-match':error()})
        self.assertIn('#define VERSION "main_'+COMMIT+'"',header)


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--report',type=Path)
    args=parser.parse_args();before=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    result=unittest.TextTestRunner(verbosity=1).run(unittest.defaultTestLoader.loadTestsFromTestCase(VersionTests))
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==before
    report={'passed':result.wasSuccessful(),'device_access':False,'tests':result.testsRun,
            'source_sha256':{'scripts/version_gen.py':before},
            'limits':['Actual generator module; most Git subprocess outcomes mocked.',
                      'One real temporary non-repository exercised; firmware build handled separately.',
                      'Legacy C dirty bool stays conservative when metadata is unknown; explicit KNOWN/JSON preserve unknown.']}
    if args.report:args.report.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    if not result.wasSuccessful():raise SystemExit(1)
    print('PASS '+str(result.testsRun)+' source-archive/Git version generator cases')


if __name__=='__main__':main()

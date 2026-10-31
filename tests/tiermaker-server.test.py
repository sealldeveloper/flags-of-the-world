import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('tiermaker_server', Path(__file__).parents[1] / 'tierlist' / 'server.py')
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)

PAGE = '''<meta property="og:title" content="Create a Sample &amp; friends Tier List"><meta name="description" content="A public template"><script>baseTierImagePath="/images/chart/chart/sample-123";dateLastEdited="2026-10-30 10:00:00";tierSystem.initList("", "sample-123", "");</script>'''


class ImportTests(unittest.TestCase):
    def test_url_gate(self):
        self.assertEqual(server.allowed_url('https://www.tiermaker.com/create/sample-123?x=1#foo'), 'https://tiermaker.com/create/sample-123')
        for url in ['http://tiermaker.com/create/x', 'https://tiermaker.com.evil.test/create/x', 'https://127.0.0.1/create/x', 'https://tiermaker.com@localhost/create/x', 'https://tiermaker.com:9999/create/x', 'https://tiermaker.com/login/', 'https://tiermaker.com/images/a.png', 'https://tiermaker.com/create/../admin', 'https://tiermaker.com/create/%252e%252e/admin']:
            with self.assertRaises(ValueError, msg=url): server.allowed_url(url)
        for url in ['https://localhost/images/chart/a.png', 'https://tiermaker.com/images/chart/../admin.png', 'https://tiermaker.com/images/chart/%252e%252e/admin.png', 'https://tiermaker.com/includes/a.php']:
            with self.assertRaises(ValueError, msg=url): server.allowed_url(url, 'image')
        self.assertEqual(server.allowed_url('https://tiermaker.com/images/chart/chart/x/ppng', 'image'), 'https://tiermaker.com/images/chart/chart/x/ppng')

    def test_metadata_and_order(self):
        page = server.parse_page(PAGE, 'https://tiermaker.com/create/sample-123')
        self.assertEqual(page['name'], 'Sample & friends')
        self.assertEqual(page['slug'], 'sample-123')
        self.assertEqual(page['edited'], '2026-10-30 10:00:00')
        manifest = server.manifest_from_data(page, ['sample-123', 'b.png', 'a.png'])
        self.assertEqual([image['id'] for image in manifest['images']], ['1', '2'])
        self.assertEqual([image['label'] for image in manifest['images']], ['b', 'a'])
        self.assertEqual(manifest['tiers'], [])

    def test_saved_ranking_preserves_colors_and_item_positions_as_text(self):
        page = server.parse_page(PAGE.replace('initList("",', 'initList("sample-123==<b>Best</b>|3|2|1==Other|0",'), 'https://tiermaker.com/list/category/sample-123/55')
        manifest = server.manifest_from_data(page, ['sample-123', 'a.png', 'b.png', 'c.png'])
        self.assertEqual(manifest['tiers'][0], {'name': 'Best', 'color': '#ffff7f', 'items': ['2', '1']})
        self.assertEqual(manifest['tiers'][1]['items'], [])

    def test_variations_and_bad_entries(self):
        page = server.parse_page(PAGE, 'https://tiermaker.com/create/sample-123')
        manifest = server.manifest_from_data(page, ['sample-123', {'id': 50, 'src': 'https://tiermaker.com/images/chart/chart/sample-123/a.png', 'name': '<b>A</b>'}])
        self.assertEqual(manifest['images'][0]['id'], '50')
        self.assertEqual(manifest['images'][0]['label'], 'A')
        for data in [[], ['wrong', 'a.png'], ['sample-123', 'https://evil.test/a.png'], ['sample-123', {'id': 1, 'src': 'a.png'}, {'id': 1, 'src': 'b.png'}]]:
            with self.assertRaises(ValueError): server.manifest_from_data(page, data)
        page['code'] = 'sample-123==S|0|1|1'
        with self.assertRaises(ValueError): server.manifest_from_data(page, ['sample-123', 'a.png'])

    def test_modern_asset_root_and_no_image_count_cutoff(self):
        page = server.parse_page(PAGE, 'https://tiermaker.com/create/sample-123')
        manifest = server.manifest_from_data(page, ['/media/template_images/2024/123/sample-123', '01.png', '02.png'])
        self.assertEqual(manifest['images'][0]['url'], 'https://tiermaker.com/images/media/template_images/2024/123/sample-123/01.png')
        self.assertEqual(len(server.manifest_from_data(page, ['sample-123'] + ['a.png'] * 1001)['images']), 1001)
        with self.assertRaises(ValueError): server.manifest_from_data(page, ['/media/template_images/2024/123/other-template', '01.png'])

    def test_cover_metadata_and_restricted_hero_paths(self):
        cover = 'https://tiermaker.com/images/media/hero_images/2024/16864667/love-heart-cheat-code-tier-list-16864667/168646671793090503..png'
        page = server.parse_page(PAGE + '<meta property="og:image" content="' + cover + '">', 'https://tiermaker.com/create/sample-123')
        self.assertEqual(server.manifest_from_data(page, ['sample-123', 'a.png'])['cover'], cover)
        legacy = '/images/templates/sample-123/cover.png'
        page = server.parse_page(PAGE + '<meta name="twitter:image" content="' + legacy + '">', 'https://tiermaker.com/create/sample-123')
        self.assertEqual(page['cover'], 'https://tiermaker.com' + legacy)
        for bad in ['https://evil.test/images/templates/x.png', 'https://tiermaker.com@127.0.0.1/images/templates/x.png', 'http://127.0.0.1/x.png', 'https://tiermaker.com/includes/cover.php', '/images/media/hero_images/../../admin.png']:
            page = server.parse_page(PAGE + '<meta property="og:image" content="' + bad + '">', 'https://tiermaker.com/create/sample-123')
            self.assertNotIn('cover', server.manifest_from_data(page, ['sample-123', 'a.png']))

    def test_no_script_evaluation(self):
        with self.assertRaises(ValueError): server.parse_page('<script>globalThis.executeBadCode()</script>', 'https://tiermaker.com/create/sample')

    def test_redirects_never_reach_other_hosts(self):
        error = server.urllib.error.HTTPError('https://tiermaker.com/create/sample', 302, 'redirect', {'Location': 'http://127.0.0.1/admin'}, None)
        with patch.object(server.urllib.request.OpenerDirector, 'open', side_effect=error):
            with self.assertRaises(ValueError): server.fetch_public('https://tiermaker.com/create/sample')


if __name__ == '__main__': unittest.main()

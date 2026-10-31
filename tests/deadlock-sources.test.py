import hashlib
import importlib.util
import json
from pathlib import Path
import unittest

from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / 'deadlock-guess-who'
spec = importlib.util.spec_from_file_location('deadlock_roster_import', ROOT / 'update-roster.py')
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)
ROSTER = json.loads((ROOT / 'data' / 'deadlock.json').read_text())
SOURCES = json.loads((ROOT / 'data' / 'city-never-sleeps-sources.json').read_text())


class SourcedRosterTests(unittest.TestCase):
    def test_existing_38_heroes_are_byte_for_byte_equivalent_as_data(self):
        legacy = [hero for hero in ROSTER['heroes'] if not hero['id'].startswith('hero_')]
        self.assertEqual(len(legacy), 38)
        canonical = json.dumps(legacy, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()
        self.assertEqual(hashlib.sha256(canonical).hexdigest(), '24f9f09b7901db87b4e7c782f5b20624e35230a48aa7d86f03b9b312c570190a')

    def test_every_new_description_and_tag_is_copied_from_source_html(self):
        self.assertEqual(len(SOURCES['heroes']), 6)
        for source in SOURCES['heroes']:
            hero = next(hero for hero in ROSTER['heroes'] if hero['id'] == source['id'])
            self.assertEqual(hero['name'], source['name'])
            self.assertEqual(hero['role'], '')
            self.assertEqual(hero['playstyle'], ' '.join(importer.plain(fragment) for fragment in source['descriptionHtml']))
            self.assertEqual(hero['tags'], [importer.plain(fragment) for fragment in source['tagHtml']])
            for ability, original in zip(hero['abilities'], source['abilities']):
                self.assertEqual(ability['name'], importer.plain(original['nameHtml']))
                self.assertEqual(ability['description'], ' '.join(importer.plain(fragment) for fragment in original['descriptionHtml']))

    def test_violet_keeps_both_sourced_living_ink_modes(self):
        hero = next(hero for hero in ROSTER['heroes'] if hero['name'] == 'Violet')
        self.assertIn('Empower', hero['abilities'][0]['description'])
        self.assertIn('Draw', hero['abilities'][0]['description'])
        self.assertIn('blocks projectiles', hero['abilities'][0]['description'])

    def test_asset_hashes_dimensions_and_sources_match_the_import_manifest(self):
        for source in SOURCES['heroes']:
            items = list(source['artwork'].values()) + [dict(item, path=item['icon']) for item in source['abilities']]
            self.assertEqual(len(items), 8)
            for item in items:
                target = ROOT / item['path'].removeprefix('./')
                self.assertEqual(hashlib.sha256(target.read_bytes()).hexdigest(), item['localSha256'])
                self.assertEqual(len(item['sourceSha256']), 64)
                with Image.open(target) as image:
                    self.assertEqual(image.size, (item['width'], item['height']))
                self.assertTrue((item.get('iconSourceUrl') or item['sourceUrl']).startswith('https://cdn.deadlock.wiki/'))

    def test_markup_cleanup_does_not_rewrite_words_or_punctuation(self):
        self.assertEqual(importer.plain('<p>Keep <b>the source</b>, exactly.<br>Second line.</p>'), 'Keep the source, exactly. Second line.')


if __name__ == '__main__':
    unittest.main()

#!/usr/bin/env python3
"""Import the released City Never Sleeps heroes from pinned Deadlock Wiki data.

Maintenance dependencies: beautifulsoup4 and Pillow. No prose is authored here.
Use --apply to update the static roster/assets, otherwise print a source summary.
"""
import argparse
from datetime import datetime, timezone
import hashlib
from io import BytesIO
import json
from pathlib import Path
import re
import urllib.parse
import urllib.request

from bs4 import BeautifulSoup
from PIL import Image

ROOT = Path(__file__).resolve().parent
PAGES = ('Baba', 'Deadman_Danny', 'Nurse_Harrow', 'Rat_King', 'Solomon', 'Violet')
USER_AGENT = 'Deadlock-Guess-Who roster update (+https://puzzle.seall.dev/deadlock-guess-who/)'


def plain(fragment):
    """Copy source text, removing markup/footnotes and normalizing whitespace only."""
    node = BeautifulSoup(str(fragment), 'html.parser')
    for hidden in node.select('style,script,sup.reference'):
        hidden.decompose()
    for br in node.find_all('br'):
        br.replace_with('\n')
    for block in node.find_all(['p', 'li']):
        block.insert_after('\n')
    return re.sub(r'\s+', ' ', node.get_text()).strip()


def fetch(url, limit):
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        data = response.read(limit + 1)
        if len(data) > limit:
            raise ValueError('Source exceeds the download limit')
        return data


def original_image(value):
    url = urllib.parse.urlsplit(value)
    if url.scheme != 'https' or url.netloc != 'cdn.deadlock.wiki' or url.query or url.fragment:
        raise ValueError('Unexpected wiki artwork source')
    path = url.path
    if path.startswith('/thumb/'):
        path = '/' + path.split('/')[2]
    if not path.lower().endswith('.png') or '..' in urllib.parse.unquote(path):
        raise ValueError('Expected a source PNG image')
    return 'https://cdn.deadlock.wiki' + path


def load_page(page, directory):
    path = directory / (page + '.revision.json')
    if not path.exists():
        query = urllib.parse.urlencode({'action': 'parse', 'page': page, 'prop': 'text|revid', 'format': 'json'})
        path.write_bytes(fetch('https://deadlock.wiki/api.php?' + query, 4 * 1024 * 1024))
    document = json.loads(path.read_text())['parse']
    if document['title'].replace(' ', '_') != page or not isinstance(document['revid'], int):
        raise ValueError('Unexpected source revision')
    return document


def extract(page, document):
    html = document['text']['*']
    soup = BeautifulSoup(html, 'html.parser')
    root = soup.select_one('.mw-parser-output') or soup
    lead = root.find_all('p', recursive=False)[:2]
    wrappers = root.select('.ability-section-wrapper')[:4]
    if len(lead) != 2 or len(wrappers) != 4:
        raise ValueError('Wiki hero layout changed: ' + page)
    cards = [wrapper.select_one('.ability-card') for wrapper in wrappers]
    keys = {card['id'].split(':')[0] for card in cards}
    if len(keys) != 1 or not re.fullmatch(r'hero_[a-z_]+', next(iter(keys))):
        raise ValueError('Cannot verify internal hero key: ' + page)
    key = next(iter(keys))
    revision_url = 'https://deadlock.wiki/index.php?' + urllib.parse.urlencode({'title': page, 'oldid': document['revid']})
    tags = root.select('.infobox-h-herotag-pill')
    hero = {'id': key, 'name': document['title'], 'role': '', 'tags': [plain(tag) for tag in tags],
            'playstyle': ' '.join(plain(p) for p in lead), 'playstyleSource': 'Deadlock Wiki',
            'playstyleSourceUrl': revision_url, 'sourceRevision': document['revid']}
    evidence = {'id': key, 'name': document['title'], 'page': page, 'revision': document['revid'],
                'sourceUrl': revision_url, 'sourceHtmlSha256': hashlib.sha256(html.encode()).hexdigest(),
                'descriptionHtml': [str(p) for p in lead], 'tagHtml': [str(tag) for tag in tags], 'abilities': [], 'artwork': {}}
    # All chosen artwork is published on the same wiki page. No generated art.
    images = root.find_all('img')
    def image_file(filename):
        for image in images:
            try:
                url = original_image(image['src'])
            except ValueError:
                continue
            if urllib.parse.unquote(url.rsplit('/', 1)[-1]) == filename:
                return url
        raise ValueError('Missing source artwork: ' + filename)
    # Ignore SVG/stat icons while resolving the explicitly named PNG files.
    images = [image for image in images if urllib.parse.urlsplit(image.get('src', '')).path.lower().endswith('.png')]
    art = {'body': image_file(page + '_vertical.png'), 'headshot': image_file(page + '.png'),
           'showcase': image_file(page + '_Render.png')}
    background = root.select_one('.infobox-h-background img')
    if not background:
        raise ValueError('Missing source background: ' + page)
    # Use the wiki's supplied infobox thumbnail, rather than inventing a backdrop.
    art['background'] = background['src']
    hero['abilities'] = []
    for index, (wrapper, card) in enumerate(zip(wrappers, cards), 1):
        name_node = card.select_one('.ac-name')
        blocks = [block for block in card.select('.ac-info-desc') if plain(block)]
        if not name_node or not blocks:
            raise ValueError('Missing source ability text: ' + page)
        name, description = plain(name_node), ' '.join(plain(block) for block in blocks)
        anchor = wrapper.select_one('h3[id]')['id']
        source_url = revision_url + '#' + urllib.parse.quote(anchor, safe='_-.~')
        icon = original_image(card.select_one('.ac-icon img')['src'])
        icon_path = f'./assets/deadlock/hero-{key}-ability-{index}.png'
        hero['abilities'].append({'name': name, 'description': description, 'icon': icon_path,
                                  'textSource': 'Deadlock Wiki', 'textSourceUrl': source_url})
        evidence['abilities'].append({'nameHtml': str(name_node), 'descriptionHtml': [str(block) for block in blocks],
                                      'sourceUrl': source_url, 'iconSourceUrl': icon, 'icon': icon_path})
    for field in ('body', 'showcase', 'background', 'headshot'):
        suffix = 'card' if field == 'body' else field
        hero[field] = f'./assets/deadlock/hero-{key}-{suffix}.webp'
    evidence['artwork'] = {field: {'sourceUrl': url, 'path': hero[field]} for field, url in art.items()}
    return hero, evidence


def save_asset(url, relative, cache):
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != 'https' or parsed.netloc != 'cdn.deadlock.wiki' or parsed.query or parsed.fragment:
        raise ValueError('Unexpected image destination')
    source = cache / (hashlib.sha256(url.encode()).hexdigest() + '.png')
    if not source.exists():
        source.write_bytes(fetch(url, 25 * 1024 * 1024))
    raw = source.read_bytes()
    with Image.open(BytesIO(raw)) as image:
        image.load()
        if image.width * image.height > 24000000:
            raise ValueError('Artwork exceeds the image pixel budget')
        target = ROOT / relative.removeprefix('./')
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.suffix == '.png':
            target.write_bytes(raw)
        else:
            image.convert('RGBA').save(target, 'WEBP', lossless=True, exact=True, method=6)
        return {'sourceSha256': hashlib.sha256(raw).hexdigest(), 'localSha256': hashlib.sha256(target.read_bytes()).hexdigest(),
                'width': image.width, 'height': image.height}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path, default=Path('/tmp/deadlock-wave-source'))
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    args.source_dir.mkdir(parents=True, exist_ok=True)
    extracted = [extract(page, load_page(page, args.source_dir)) for page in PAGES]
    if not args.apply:
        print(json.dumps([{'name': hero['name'], 'id': hero['id'], 'revision': source['revision'], 'abilities': [a['name'] for a in hero['abilities']]} for hero, source in extracted], indent=2))
        return
    cache = args.source_dir / 'images'
    cache.mkdir(exist_ok=True)
    for hero, source in extracted:
        for item in source['artwork'].values():
            item.update(save_asset(item['sourceUrl'], item['path'], cache))
        for ability in source['abilities']:
            ability.update(save_asset(ability['iconSourceUrl'], ability['icon'], cache))
    path = ROOT / 'data' / 'deadlock.json'
    roster = json.loads(path.read_text())
    replaced = {hero['name'] for hero, _ in extracted}
    roster['heroes'] = sorted([hero for hero in roster['heroes'] if hero['name'] not in replaced] + [hero for hero, _ in extracted], key=lambda hero: hero['name'].casefold())
    roster['generated'] = datetime.now(timezone.utc).date().isoformat()
    roster['additionalSource'] = 'Deadlock Wiki, pinned revisions with verbatim plain-text extraction'
    roster['additionalSourceUrl'] = 'https://deadlock.wiki/Template:Hero_Navbox'
    path.write_text(json.dumps(roster, ensure_ascii=False, indent=2) + '\n')
    snapshot = {'source': 'Deadlock Wiki', 'license': 'CC BY-NC-SA 4.0', 'syncedAt': datetime.now(timezone.utc).isoformat(),
                'textNormalization': 'Markup and reference markers removed, whitespace collapsed. No prose paraphrased or synthesized.',
                'heroes': [source for _, source in extracted]}
    (ROOT / 'data' / 'city-never-sleeps-sources.json').write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + '\n')
    print('Imported: ' + ', '.join(hero['name'] for hero, _ in extracted))


if __name__ == '__main__':
    main()

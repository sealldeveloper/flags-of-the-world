#!/usr/bin/env python3
"""Static preview plus a public-only TierMaker importer. No accounts or stored imports."""
import argparse
import ast
from html.parser import HTMLParser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
import threading
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
PALETTE = ['#ff7f7f', '#ffbf7f', '#ffdf7f', '#ffff7f', '#bfff7f', '#7fff7f', '#7fffff', '#7fbfff', '#7f7fff', '#ff7fff', '#bf7fbf', '#3b3b3b', '#858585', '#cfcfcf', '#f7f7f7']
SLUG = r'[A-Za-z0-9][A-Za-z0-9_-]{0,250}'
MAX_PAGE = 2 * 1024 * 1024
MAX_IMAGE = 25 * 1024 * 1024
UPSTREAM = threading.BoundedSemaphore(4)


def allowed_url(value, kind='page'):
    if not isinstance(value, str) or len(value) > 2048:
        raise ValueError('Invalid TierMaker URL')
    url = urllib.parse.urlsplit(value.strip())
    if url.scheme != 'https' or url.hostname not in ('tiermaker.com', 'www.tiermaker.com') or url.username or url.password or url.port not in (None, 443):
        raise ValueError('Use an HTTPS tiermaker.com URL')
    decoded = urllib.parse.unquote(url.path)
    if any(part in ('.', '..') for part in decoded.split('/')) or '\\' in decoded or '%' in decoded or any(ord(c) < 32 for c in decoded):
        raise ValueError('Invalid TierMaker path')
    if kind == 'image':
        if not re.fullmatch(r'/(?:images/(?:chart|templates|media/(?:template_images|hero_images))|media/(?:template_images|hero_images))/[A-Za-z0-9_./ ()+-]+', decoded, re.I):
            raise ValueError('Only TierMaker template images can be imported')
    elif kind == 'api':
        if decoded != '/api/':
            raise ValueError('Invalid TierMaker API path')
    elif not re.fullmatch(r'/(?:create/' + SLUG + r'|(?:categories|list)/[A-Za-z0-9][A-Za-z0-9_/-]{1,500})/?', decoded):
        raise ValueError('Use a TierMaker template or saved tier list URL')
    query = url.query if kind == 'api' else ''
    return urllib.parse.urlunsplit(('https', 'tiermaker.com', urllib.parse.quote(decoded, safe='/._-+()'), query, ''))


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def fetch_public(value, kind='page'):
    url = allowed_url(value, kind)
    opener = urllib.request.build_opener(NoRedirect())
    limit = MAX_IMAGE if kind == 'image' else MAX_PAGE
    for _ in range(4):
        request = urllib.request.Request(url, headers={'User-Agent': 'tierlist-import/1.0', 'Accept-Encoding': 'identity'})
        try:
            with opener.open(request, timeout=20) as response:
                content_type = response.headers.get_content_type()
                if kind == 'image' and content_type not in ('image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/bmp'):
                    raise ValueError('TierMaker did not return a supported image')
                if kind == 'page' and content_type != 'text/html':
                    raise ValueError('TierMaker did not return a public template page')
                if kind == 'api' and content_type not in ('application/json', 'text/plain', 'text/html'):
                    raise ValueError('Unexpected TierMaker template response')
                data = response.read(limit + 1)
                if len(data) > limit:
                    raise ValueError('TierMaker response exceeds the import size limit')
                return data, content_type
        except urllib.error.HTTPError as error:
            if error.code in (301, 302, 303, 307, 308) and error.headers.get('Location'):
                url = allowed_url(urllib.parse.urljoin(url, error.headers['Location']), kind)
                continue
            if error.code in (401, 403):
                raise ValueError('TierMaker blocked this import or the list is not public') from None
            raise ValueError('TierMaker could not load this template') from None
    raise ValueError('Too many TierMaker redirects')


class Metadata(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.meta = {}
        self.title = []
        self.in_title = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'meta':
            self.meta[attrs.get('property') or attrs.get('name')] = attrs.get('content', '')
        if tag == 'title':
            self.in_title = True

    def handle_endtag(self, tag):
        if tag == 'title':
            self.in_title = False

    def handle_data(self, value):
        if self.in_title:
            self.title.append(value)


class PlainText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []

    def handle_data(self, value):
        self.parts.append(value)


def plain(value):
    parser = PlainText()
    parser.feed(str(value))
    return ''.join(parser.parts).strip()


def parse_page(document, source):
    metadata = Metadata()
    metadata.feed(document)
    quoted = r'''("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')'''
    match = re.search(r'tierSystem\.initList\(\s*' + quoted + r'\s*,\s*' + quoted + r'\s*(?:,\s*' + quoted + r')?\s*\)', document)
    if not match:
        raise ValueError('This TierMaker page does not expose an importable template')
    try:
        code, slug, variation = [ast.literal_eval(value) if value else '' for value in match.groups()]
    except (ValueError, SyntaxError):
        raise ValueError('Unsupported TierMaker template metadata') from None
    if not re.fullmatch(SLUG, slug) or not re.fullmatch(r'[A-Za-z0-9_-]{0,100}', variation):
        raise ValueError('Unsupported TierMaker template identifier')
    edited = re.search(r'dateLastEdited\s*=\s*[\'"]([0-9 :\-]{1,40})[\'"]', document)
    title = metadata.meta.get('og:title') or ''.join(metadata.title)
    title = re.sub(r'^Create (?:a|an)\s+', '', plain(title), flags=re.I)
    title = re.sub(r'\s*(?:Tier List(?: Maker)?| - TierMaker)\s*$', '', title, flags=re.I)
    title = re.sub(r'\s*Tier List\s*$', '', title, flags=re.I).strip()
    cover = ''
    candidate = metadata.meta.get('og:image') or metadata.meta.get('twitter:image')
    if candidate:
        try:
            cover = allowed_url(urllib.parse.urljoin(source, candidate), 'image')
        except ValueError:
            pass  # Foreign or malformed social images must never become fetch targets.
    return {'name': (title or slug.replace('-', ' '))[:120], 'description': plain(metadata.meta.get('description', ''))[:1000], 'slug': slug, 'variation': variation, 'code': code, 'edited': edited.group(1) if edited else '', 'source': source, 'cover': cover}


def manifest_from_data(page, data):
    if not isinstance(data, list) or len(data) < 2 or not isinstance(data[0], str):
        raise ValueError('Unsupported TierMaker image list')
    if data[0] == page['slug']:
        base = 'https://tiermaker.com/images/chart/chart/' + page['slug'] + '/'
    else:
        asset_root = urllib.parse.urlsplit(urllib.parse.urljoin('https://tiermaker.com/', data[0]))
        if asset_root.scheme != 'https' or asset_root.netloc != 'tiermaker.com' or asset_root.query or asset_root.fragment or not re.fullmatch(r'/media/template_images/[0-9]{4}/[0-9]+/' + re.escape(page['slug']), asset_root.path):
            raise ValueError('Unsupported TierMaker asset path')
        base = urllib.parse.urlunsplit(('https', 'tiermaker.com', '/images' + asset_root.path + '/', '', ''))
    images = []
    seen = set()
    for index, entry in enumerate(data[1:], 1):
        source = entry.get('src') if isinstance(entry, dict) else entry
        original_id = str(entry.get('id', index)) if isinstance(entry, dict) else str(index)
        if not isinstance(source, str) or len(source) > 2048 or original_id in seen:
            raise ValueError('Invalid TierMaker image entry')
        seen.add(original_id)
        url = allowed_url(urllib.parse.urljoin(base, source), 'image')
        label = plain(entry.get('name') or entry.get('label') or '') if isinstance(entry, dict) else ''
        if not label:
            label = urllib.parse.unquote(url.rsplit('/', 1)[-1]).rsplit('.', 1)[0].replace('-', ' ').replace('_', ' ')
        images.append({'id': original_id, 'url': url, 'label': label[:160] or 'Image ' + str(index)})
    tiers = []
    placed = set()
    if page['code']:
        rows = page['code'].split('==')
        if rows[0] != page['slug']:
            raise ValueError('Unsupported TierMaker saved ranking')
        for index, row in enumerate(rows[1:]):
            values = row.split('|')
            if len(values) < 2:
                raise ValueError('Invalid TierMaker saved ranking')
            try:
                color_index = int(values[1])
            except ValueError:
                raise ValueError('Invalid TierMaker row colour') from None
            if color_index == -1:
                color_index = index
            if not 0 <= color_index < len(PALETTE):
                raise ValueError('Unsupported TierMaker row colour')
            items = values[2:]
            if any(item not in seen or item in placed for item in items) or len(set(items)) != len(items):
                raise ValueError('Invalid image placement in TierMaker ranking')
            placed.update(items)
            tiers.append({'name': plain(values[0])[:100] or 'Tier ' + str(index + 1), 'color': PALETTE[color_index], 'items': items})
    return {'name': page['name'], 'description': page['description'], 'source': page['source'], 'images': images, 'tiers': tiers, **({'cover': page['cover']} if page.get('cover') else {})}


def load_manifest(value):
    source = allowed_url(value)
    parts = urllib.parse.urlsplit(source).path.strip('/').split('/')
    page_url = 'https://tiermaker.com/create/' + parts[2] if len(parts) == 3 and parts[0] == 'categories' else source
    document, _ = fetch_public(page_url)
    page = parse_page(document.decode('utf-8', errors='replace'), source)
    query = urllib.parse.urlencode({'type': 'templates-v2', 'id': page['slug'], 'lastEdited': page['edited'], 'variation': page['variation']})
    data, _ = fetch_public('https://tiermaker.com/api/?' + query, 'api')
    try:
        return manifest_from_data(page, json.loads(data))
    except json.JSONDecodeError:
        raise ValueError('TierMaker did not return an image list') from None


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        route = urllib.parse.urlsplit(self.path)
        if route.path not in ('/tierlist-import', '/tierlist-image'):
            if any(part.startswith('.') for part in urllib.parse.unquote(route.path).split('/') if part):
                self.send_error(404)
                return
            return super().do_GET()
        if not UPSTREAM.acquire(timeout=2):
            self.respond(429, b'{"error":"Import service is busy. Try again."}', 'application/json')
            return
        try:
            values = urllib.parse.parse_qs(route.query, max_num_fields=2)
            value = values.get('url', [''])[0]
            if route.path == '/tierlist-import':
                result = load_manifest(value)
                self.respond(200, json.dumps(result).encode(), 'application/json')
            else:
                data, content_type = fetch_public(value, 'image')
                self.respond(200, data, content_type)
        except (ValueError, urllib.error.URLError, TimeoutError, OSError) as error:
            message = str(error) if isinstance(error, ValueError) else 'TierMaker could not be reached. Try again.'
            self.respond(400, json.dumps({'error': message}).encode(), 'application/json')
        finally:
            UPSTREAM.release()

    def respond(self, status, data, content_type):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=18764)
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    print(f'Games preview: http://127.0.0.1:{args.port}/tierlist/', flush=True)
    server.serve_forever()

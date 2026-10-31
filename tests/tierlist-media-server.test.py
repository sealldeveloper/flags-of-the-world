import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('media_preview_server', Path(__file__).resolve().parents[1] / 'tierlist' / 'server.py')
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)
SOURCE = 'https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy'


class MediaBridgeTests(unittest.TestCase):
    def test_invalid_routes_queries_and_duplicate_values_never_spawn(self):
        with patch.object(server.subprocess, 'run') as run:
            for route, values in [('/upload', {'url': [SOURCE]}), ('/media-import', {}), ('/media-import', {'url': [SOURCE, SOURCE]}), ('/media-import', {'url': [SOURCE], 'other': ['x']}), ('/media-image', {'url': [SOURCE], 'cursor': ['x']})]:
                with self.assertRaises(ValueError):
                    server.fetch_media(route, values)
            run.assert_not_called()

    def test_metadata_bridge_uses_static_argv_stdin_and_a_deadline(self):
        result = SimpleNamespace(returncode=0, stdout=b'application/json\n{"kind":"spotify"}', stderr=b'')
        with patch.object(server.subprocess, 'run', return_value=result) as run:
            data, mime = server.fetch_media('/media-import', {'url': [SOURCE]})
            self.assertEqual(json.loads(data), {'kind': 'spotify'})
            self.assertEqual(mime, 'application/json')
            args, kwargs = run.call_args
            self.assertEqual(args[0], ['node', str(server.ROOT / 'tierlist' / 'media-cli.mjs')])
            self.assertNotIn('shell', kwargs)
            self.assertEqual(kwargs['timeout'], 50)
            self.assertEqual(json.loads(kwargs['input']), {'route': '/media-import', 'url': SOURCE})

    def test_artwork_bytes_are_preserved(self):
        result = SimpleNamespace(returncode=0, stdout=b'image/jpeg\n\xff\xd8\xff\xd9', stderr=b'')
        with patch.object(server.subprocess, 'run', return_value=result):
            data, mime = server.fetch_media('/media-image', {'url': ['https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg']})
            self.assertEqual(data, b'\xff\xd8\xff\xd9')
            self.assertEqual(mime, 'image/jpeg')

    def test_invalid_mime_body_framing_and_process_errors_are_not_served(self):
        for result in [SimpleNamespace(returncode=0, stdout=b'audio/mpeg\naudio', stderr=b''), SimpleNamespace(returncode=0, stdout=b'not framed', stderr=b''), SimpleNamespace(returncode=1, stdout=b'', stderr=b'Provider blocked public reads')]:
            with patch.object(server.subprocess, 'run', return_value=result):
                with self.assertRaises(ValueError):
                    server.fetch_media('/media-import', {'url': [SOURCE]})

    def test_response_size_is_bounded(self):
        result = SimpleNamespace(returncode=0, stdout=b'image/png\n' + b'x' * 33, stderr=b'')
        with patch.object(server, 'MAX_IMAGE', 32), patch.object(server.subprocess, 'run', return_value=result):
            with self.assertRaises(ValueError):
                server.fetch_media('/media-image', {'url': ['https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg']})


if __name__ == '__main__':
    unittest.main()

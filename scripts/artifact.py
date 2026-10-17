"""Turn the single-file build into an artifact page: the host supplies doctype, html, head and body,
so keep only what goes inside them (title and meta first, then styles, scripts and the app mount)."""
import pathlib, re
root = pathlib.Path(__file__).resolve().parent.parent
src = (root / 'dist-single' / 'index.html').read_text(encoding='utf-8')
head = re.search(r'<head>(.*?)</head>', src, re.S).group(1)
body = re.search(r'<body>(.*?)</body>', src, re.S).group(1)
head = re.sub(r'<meta charset[^>]*>\s*', '', head)
head = re.sub(r'<meta name="viewport"[^>]*>\s*', '', head)
title = re.search(r'<title>.*?</title>', head, re.S).group(0)
head = head.replace(title, '')
out = title + '\n' + head.strip() + '\n' + body.strip() + '\n'
# the publisher treats a page as review markup when an `id=` is followed by something that is neither a quoted value
# nor a short bare token (e.g. a minified `var id="...long string..."`); refuse to write such a page
N = 2048
pat = re.compile(r'(?<!-)\bid[\t\n\f\r ]*=[\t\n\f\r ]*(?:"([^"]{0,%d})"|\'([^\']{0,%d})\'|([^\t\n\f\r >"\'][^\t\n\f\r >]{0,%d})(?=[\t\n\f\r >]|$)|([\s\S]))' % (N, N, N), re.I)
bad = [m.start() for m in pat.finditer(out) if m.group(4) is not None and m.group(4) != '>']
if bad:
    for b in bad[:5]:
        print('  id= trap at', b, repr(out[max(0, b - 60):b + 40]))
    raise SystemExit('refusing to write: the page would be misread as a review page')
(root / 'dist-single' / 'ourtone.html').write_text(out, encoding='utf-8')
print('artifact page', len(out.encode('utf-8')) // 1024, 'KB')

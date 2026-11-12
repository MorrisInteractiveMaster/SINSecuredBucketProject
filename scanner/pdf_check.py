"""Conservative static-PDF validator, executed in an isolated bounded process."""
import resource
import sys
import pikepdf

# Keep compressed streams, recursive graphs and native parser failures bounded.
resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024,) * 2)
resource.setrlimit(resource.RLIMIT_CPU, (8, 8))
resource.setrlimit(resource.RLIMIT_FSIZE, (0, 0))
resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
resource.setrlimit(resource.RLIMIT_NOFILE, (32, 32))
FORBIDDEN = {'/JS', '/JavaScript', '/OpenAction', '/AA', '/EmbeddedFiles', '/EmbeddedFile', '/Filespec',
             '/RichMedia', '/3D', '/U3D', '/PRC', '/Movie', '/Sound', '/Rendition', '/Screen', '/PS', '/PostScript', '/FileAttachment', '/XFA', '/AcroForm', '/Launch', '/SubmitForm', '/ImportData', '/GoToR', '/GoToE', '/URI'}

def validate(filename):
    with pikepdf.open(filename, attempt_recovery=False, suppress_warnings=True) as pdf:
        if pdf.is_encrypted or not 1 <= len(pdf.pages) <= 500 or len(pdf.objects) > 20000:
            raise ValueError()
        if pdf.check_pdf_syntax(): raise ValueError()
        stack = [(obj, 0) for obj in pdf.objects]
        seen, nodes, decoded = set(), 0, 0
        while stack:
            obj, depth = stack.pop(); nodes += 1
            if depth > 64 or nodes > 100000: raise ValueError()
            if isinstance(obj, pikepdf.Name) and str(obj) in FORBIDDEN: raise ValueError()
            if not isinstance(obj, (pikepdf.Dictionary, pikepdf.Array, pikepdf.Stream)): continue
            if obj.objgen != (0, 0):
                if obj.objgen in seen: continue
                seen.add(obj.objgen)
            if isinstance(obj, pikepdf.Array):
                stack.extend((child, depth + 1) for child in obj)
            else:
                if any(str(key) in FORBIDDEN for key in obj.keys()): raise ValueError()
                if str(obj.get('/S', '')) in FORBIDDEN or str(obj.get('/Type', '')) in FORBIDDEN: raise ValueError()
                stack.extend((child, depth + 1) for child in obj.values())
                if isinstance(obj, pikepdf.Stream):
                    if '/F' in obj: raise ValueError()  # External-file stream references are not static content.
                    decoded += len(obj.read_bytes())
                    if decoded > 40 * 1024 * 1024: raise ValueError()
        if pdf.get_warnings(): raise ValueError()

if __name__ == '__main__':
    try: validate(sys.argv[1])
    except BaseException: sys.exit(1)  # Never print content, parser diagnostics or names.

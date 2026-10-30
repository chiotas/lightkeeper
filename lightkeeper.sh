#!/bin/sh
# Lightkeeper from a computer on the TV's network. Usage:
#
#   ./lightkeeper.sh build                 the package, dist/<id>_<version>_all.ipk, the same as
#                                        dist/lightkeeper.ipk, and its catalog entry
#   ./lightkeeper.sh install <tv-address>  build, install over SSH and set it up
#   ./lightkeeper.sh uninstall <tv-address>
#                                        remote keys back to LG, hook, settings and app removed
#   ./lightkeeper.sh preview               settings page and Home against a stand-in TV, on this computer
#
# SSH goes in as root with your key. Another key or options: LIGHTKEEPER_SSH="ssh -i ~/.ssh/tv_key".
set -e
ID=io.github.chiotas.lightkeeper
DIR=$(cd "$(dirname "$0")" && pwd)
SSH=${LIGHTKEEPER_SSH:-ssh}
VERSION=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$DIR/app/appinfo.json")
IPK="$DIR/dist/${ID}_${VERSION}_all.ipk"
APPDIR=/media/developer/apps/usr/palm/applications/$ID

# The .ipk, written by Python alone: a Debian ar archive of debian-binary,
# control.tar.gz and data.tar.gz. The tars are plain ustar owned by root, with
# no extended attributes, which the TV refuses ("ipk verified failed"). Names
# have no leading ./, as in ares-package's packages: the Homebrew Channel
# catalog's check reads control and usr/palm/... by exactly those names.
build() {
  mkdir -p "$DIR/dist"
  python3 - "$DIR" "$IPK" "$ID" "$VERSION" <<'EOF'
import gzip, hashlib, io, json, os, re, sys, tarfile, time
root, ipk, app_id, version = sys.argv[1:]
app = os.path.join(root, 'app')
# The version is written in three places; a package with two of them is refused.
for f, pat in (('index.html', r"APP_VERSION = '([^']+)'"), ('service/server.js', r"VERSION = '([^']+)'")):
    m = re.search(pat, open(os.path.join(app, f)).read())
    if not m or m.group(1) != version:
        sys.exit('version mismatch: app/%s says %s, appinfo.json %s' % (f, m and m.group(1), version))
EXEC = {'service/lightkeeper-init', 'service/setup.sh'}
now = int(time.time())

def tar(entries):
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode='wb', mtime=now) as gz:
        with tarfile.open(fileobj=gz, mode='w', format=tarfile.USTAR_FORMAT) as t:
            for name, data, mode in entries:
                info = tarfile.TarInfo(name)
                info.uid = info.gid = 0
                info.uname = info.gname = 'root'
                info.mtime = now
                info.mode = mode
                if data is None:
                    info.type = tarfile.DIRTYPE
                    t.addfile(info)
                else:
                    info.size = len(data)
                    t.addfile(info, io.BytesIO(data))
    return buf.getvalue()

base = 'usr/palm/applications/' + app_id
entries, dirs = [], set()
def add_dir(d):
    parts = d.split('/')
    for i in range(1, len(parts) + 1):
        p = '/'.join(parts[:i])
        if p not in dirs:
            dirs.add(p)
            entries.append((p, None, 0o755))
for here, subdirs, files in os.walk(app):
    subdirs.sort()
    rel = os.path.relpath(here, app)
    add_dir(base if rel == '.' else base + '/' + rel)
    for f in sorted(files):
        if f.startswith('.'):
            continue
        r = f if rel == '.' else rel + '/' + f
        entries.append((base + '/' + r, open(os.path.join(here, f), 'rb').read(), 0o755 if r in EXEC else 0o644))
add_dir('usr/palm/packages/' + app_id)
packageinfo = {'app': app_id, 'id': app_id, 'loc_name': 'Lightkeeper', 'package_format_version': 2, 'vendor': 'Francesco Gola', 'version': version}
entries.append(('usr/palm/packages/%s/packageinfo.json' % app_id, (json.dumps(packageinfo) + '\n').encode(), 0o644))
data = tar(entries)
control = ('Package: %s\nVersion: %s\nSection: misc\nPriority: optional\nArchitecture: all\n'
           'Installed-Size: %d\nMaintainer: Francesco Gola\nDescription: Lightkeeper, a calm Home for LG TVs\n'
           'webOS-Package-Format-Version: 2\nwebOS-Packager-Version: lightkeeper.sh\n') % (app_id, version, len(data) // 1024)
parts = [('debian-binary', b'2.0\n'), ('control.tar.gz', tar([('control', control.encode(), 0o644)])), ('data.tar.gz', data)]
with open(ipk, 'wb') as out:
    out.write(b'!<arch>\n')
    for n, d in parts:
        out.write(('%-16s%-12d%-6d%-6d%-8s%-10d`\n' % (n, now, 0, 0, '100644', len(d))).encode())
        out.write(d + (b'\n' if len(d) % 2 else b''))
blob = open(ipk, 'rb').read()
sha = hashlib.sha256(blob).hexdigest()
# A catalog in the Homebrew Channel's format, for the release beside the package.
release = 'https://github.com/chiotas/lightkeeper/releases/download/v%s/' % version
manifest = {'id': app_id, 'version': version, 'type': 'web', 'title': 'Lightkeeper',
            'appDescription': 'A calm Home screen for older webOS, with GlassHouse', 'iconUri': 'https://raw.githubusercontent.com/chiotas/lightkeeper/main/app/largeIcon.png',
            'sourceUrl': 'https://github.com/chiotas/lightkeeper', 'rootRequired': True,
            'ipkUrl': release + os.path.basename(ipk), 'ipkHash': {'sha256': sha}, 'ipkSize': len(blob)}
catalog = {'paging': {'page': 1, 'count': 1, 'maxPage': 1, 'itemsTotal': 1}, 'packages': [
    {'id': app_id, 'title': 'Lightkeeper', 'iconUri': manifest['iconUri'], 'shortDescription': manifest['appDescription'],
     'manifestUrl': release + 'lightkeeper.manifest.json', 'manifest': manifest, 'pool': 'main',
     'fullDescriptionUrl': 'https://raw.githubusercontent.com/chiotas/lightkeeper/main/docs/homebrew-channel.html'}]}
d = os.path.dirname(ipk)
json.dump(manifest, open(os.path.join(d, 'lightkeeper.manifest.json'), 'w'), indent=2)
json.dump(catalog, open(os.path.join(d, 'apps.json'), 'w'), indent=2)
print('%s  %d bytes  sha256 %s' % (ipk, len(blob), sha))
EOF
  # .../releases/latest/download/lightkeeper.ipk always leads to the newest release.
  cp "$IPK" "$DIR/dist/lightkeeper.ipk"
}

tv() {
  [ -n "$TV" ] || { echo "the TV's address is missing: $0 $1 192.168.1.50"; exit 2; }
  $SSH -o BatchMode=yes "root@$TV" "$@" </dev/null
}

TV=$2
case "$1" in
  build) build ;;
  install)
    [ -n "$TV" ] || { echo "usage: $0 install <tv-address>"; exit 2; }
    build
    $SSH -o BatchMode=yes "root@$TV" "cat > /tmp/$ID.ipk" < "$IPK"
    # luna-send without a terminal needs stdin closed, or it may print nothing.
    tv "T=\$(timeout -t 1 true 2>/dev/null && echo 'timeout -t 120' || echo 'timeout 120');
      \$T luna-send -i luna://com.webos.appInstallService/dev/install '{\"id\":\"$ID\",\"ipkUrl\":\"/tmp/$ID.ipk\",\"subscribe\":true}' </dev/null 2>&1 |
        grep -m1 -oE '\"state\": *\"installed\"|\"state\": *\"[^\"]*fail[^\"]*\"|\"errorText\": *\"[^\"]*\"|\"returnValue\": *false'
      rm -f /tmp/$ID.ipk
      sh $APPDIR/service/setup.sh
      luna-send -n 1 -w 5000 luna://com.webos.applicationManager/launch '{\"id\":\"$ID\"}' </dev/null >/dev/null 2>&1"
    echo "Lightkeeper is on the TV. Settings: http://$TV:$(tv 'sleep 3; cat /tmp/lightkeeper.port 2>/dev/null || echo 8090')/" ;;
  uninstall)
    tv "if [ -f $APPDIR/service/server.js ]; then node $APPDIR/service/server.js --uninstall; fi
      p=\$(cat /tmp/lightkeeper.pid 2>/dev/null); [ -n \"\$p\" ] && grep -q lightkeeper /proc/\$p/cmdline 2>/dev/null && kill \$p
      rm -f /var/lib/webosbrew/init.d/60-lightkeeper; true"
    echo "Lightkeeper is gone. The Home key goes back to LG's Home." ;;
  preview) exec sh "$DIR/test/fake-tv/serve.sh" ;;
  *) sed -n '2,/^[^#]/p' "$0" | sed '$d; s/^# \{0,1\}//'; exit 2 ;;
esac

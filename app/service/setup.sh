#!/bin/sh
# Puts Lightkeeper's boot hook in place and starts it, or starts it again after
# an update. Run as root: by the app itself through the Homebrew Channel's exec
# service when its server does not answer with the app's version, or by
# lightkeeper.sh over SSH. Safe to run any number of times. Prints one JSON line.
#
#   sh setup.sh --port 8091   the same, with the settings on another port
HERE=$(cd "$(dirname "$0")" && pwd)
# Set only by the checks on a computer, where LIGHTKEEPER_UID=0 stands for root; on a TV, the TV's own.
HOOKDIR=${LIGHTKEEPER_HOOKDIR:-/var/lib/webosbrew/init.d}
NODE=${LIGHTKEEPER_NODE:-/usr/bin/node}
DATA=${LIGHTKEEPER_DATA:-/var/lib/lightkeeper}
fail() { printf '{"ok":false,"error":"%s"}\n' "$1"; exit 0; }

[ -d "$HOOKDIR" ] || fail "the Homebrew Channel is not installed"
# Run without root, it says so rather than ok (#14, #15). A TV without id goes on, as before.
[ "${LIGHTKEEPER_UID:-$(id -u 2>/dev/null || echo 0)}" = 0 ] || fail "the Homebrew Channel is not running as root"
[ -x "$NODE" ] || fail "this TV has no node"
[ -f "$HERE/server.js" ] || fail "the app has no server in it"

# A package may store files writable by all: the hook and server run as root.
chmod -R go-w "$(dirname "$HERE")" 2>/dev/null
chmod 755 "$HERE/lightkeeper-init" "$HERE/setup.sh"
mkdir -p "$DATA" && chmod 700 "$DATA"
if [ "$1" = "--port" ]; then
  "$NODE" "$HERE/server.js" --port "$2" || fail "a port is a number from 1024 to 65535"
fi
# A link into the app rather than a copy: once the app is gone, nothing runs at boot.
ln -sf "$HERE/lightkeeper-init" "$HOOKDIR/60-lightkeeper" || fail "could not put the boot hook in place"
cd /
# Detached, with nothing left on the exec service's output, which waits for it to close.
setsid "$HOOKDIR/60-lightkeeper" </dev/null >/dev/null 2>&1 &
printf '{"ok":true}\n'

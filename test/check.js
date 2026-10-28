/*
 * Lightkeeper's check: the server's validation, its guards and the remote-key
 * map, against the stand-in TV in test/fake-tv. Run with `node test/check.js`.
 */
'use strict';
var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var http = require('http');
// Every process a check starts is stopped when the checks end, also after a failed
// assertion, Ctrl-C or a hang: a server left running keeps its port, and the output
// it shares, so `node test/check.js | tail` never ends.
var children = [];
function spawn() { var c = require('child_process').spawn.apply(null, arguments); children.push(c); return c; }
process.on('exit', function () { children.forEach(function (c) { c.kill(); }); });
['SIGINT', 'SIGTERM', 'SIGHUP'].forEach(function (s) { process.on(s, function () { process.exit(1); }); });
setTimeout(function () { console.error('check: no end after a minute'); process.exit(1); }, 60000).unref();

var FAKE = path.join(__dirname, 'fake-tv');
var RUNNING = path.join(FAKE, 'running'); // the fake TV's open apps
var BACKGROUNDS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app', 'backgrounds', 'index.json'), 'utf8')).map(function (b) { return b.id; });
var tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lightkeeper-'));
var env = {
  LIGHTKEEPER_DATA: path.join(tmp, 'data'),
  LIGHTKEEPER_TVWEB: path.join(tmp, 'tvweb'),
  LIGHTKEEPER_HOOK: path.join(tmp, 'hook'),
  LIGHTKEEPER_LUNA_SEND: path.join(FAKE, 'luna-send'),
  LIGHTKEEPER_KEY_FILTERS: path.join(FAKE, 'KeyFilters'),
  LIGHTKEEPER_PORT: '18090',
  LIGHTKEEPER_PORT_FILE: path.join(tmp, 'port'),
  LIGHTKEEPER_SESSION: path.join(tmp, 'session'), // the boot hook's mark for each time the TV is on
  LIGHTKEEPER_DF: path.join(tmp, 'df') // df, answering with the free space in tmp/df-free, in KB
};
fs.writeFileSync(env.LIGHTKEEPER_DF, '#!/bin/sh\necho "Filesystem 1K-blocks Used Available Use% Mounted on"\n' +
  'echo "/dev/fake 20971520 1 $(cat ' + path.join(tmp, 'df-free') + ') 1% /var"\n', { mode: 493 });
fs.writeFileSync(path.join(tmp, 'df-free'), '10485760'); // 10 GB
fs.mkdirSync(env.LIGHTKEEPER_TVWEB);
fs.writeFileSync(path.join(env.LIGHTKEEPER_TVWEB, 'tvweb.js'), '');
fs.writeFileSync(path.join(env.LIGHTKEEPER_TVWEB, 'tvwebctl'), '#!/bin/sh\n', { mode: 493 });
fs.writeFileSync(env.LIGHTKEEPER_HOOK, '');
Object.keys(env).forEach(function (k) { process.env[k] = env[k]; });
try { fs.unlinkSync(path.join(FAKE, 'calls.log')); } catch (e) {}
try { fs.unlinkSync(path.join(FAKE, 'chain-has-filter')); } catch (e) {}

var s = require('../app/service/server.js');

// Validation: good values pass cleaned, anything else refuses the change.
var keys = ['red', 'netflix'];
assert.deepEqual(s.validate({ clock: '12', veil: 42.4, openAtPowerOn: false }, keys), { clock: '12', veil: 42, openAtPowerOn: false });
assert.equal(s.DEFAULTS.openApps, false); // the Home looks as before until it is turned on
// The tile selected at start, the last opened as up to 1.0.8, or the first; the gear shown unless hidden.
assert.equal(s.DEFAULTS.startTile, 'last'); assert.equal(s.DEFAULTS.hideGear, false);
// The clock and weather on the left, as always, or on the right.
assert.equal(s.DEFAULTS.clockSide, 'left');
assert.deepEqual(s.validate({ clockSide: 'right' }, keys), { clockSide: 'right' });
assert.deepEqual(s.validate({ clockSide: 'left' }, keys), { clockSide: 'left' });
['centre', 'Right', '', null, 1].forEach(function (v) { assert.equal(s.validate({ clockSide: v }, keys), 'clockSide', JSON.stringify(v)); });
// A PNG's size from its header; null for anything else.
assert.deepEqual(s.pngSize(fs.readFileSync(path.join(__dirname, '..', 'app', 'logos', 'skyq.png'))), { width: 647, height: 236 });
assert.equal(s.pngSize(fs.readFileSync(path.join(__dirname, '..', 'app', 'backgrounds', 'godrevy.jpg'))), null);
assert.equal(s.pngSize(null), null);
// Where each digit's ink ends, for every style the clock has, with the "M" of AM/PM.
var logosDx = (function () { var ctx = {}; require('vm').runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'app', 'logos.js'), 'utf8'), ctx); return ctx.RIENTRO_DX; })();
['thin', 'bold', 'classic', 'mono', 'rounded', 'digital'].forEach(function (st) {
  assert.ok(logosDx[st] && logosDx[st].length === 11 && logosDx[st].every(function (x) { return x >= 0 && x < 0.2; }), st);
});
assert.deepEqual(s.validate({ startTile: 'first', hideGear: true }, keys), { startTile: 'first', hideGear: true });
['second', '', null, 1].forEach(function (v) { assert.equal(s.validate({ startTile: v }, keys), 'startTile'); });
['yes', 0].forEach(function (v) { assert.equal(s.validate({ hideGear: v }, keys), 'hideGear'); });

// A random background: off by default, any of the pool but never the last one, none from fewer than two.
assert.equal(s.DEFAULTS.randomBackground, false); assert.equal(s.DEFAULTS.backgroundPool, null);
for (var r = 0; r < 300; r++) { var last = ['a', 'b', 'c'][r % 3]; assert.notEqual(s.pickBackground(['a', 'b', 'c'], last), last); }
assert.equal(s.pickBackground(['a', 'b'], 'a'), 'b');
assert.equal(s.pickBackground(['a', 'b'], null, function () { return 0.99; }), 'b');
assert.equal(s.pickBackground(['a'], null), null); assert.equal(s.pickBackground([], 'a'), null);
assert.deepEqual(s.validate({ randomBackground: true, backgroundPool: ['night', 'dawn'] }, keys), { randomBackground: true, backgroundPool: ['night', 'dawn'] });
assert.equal(s.validate({ backgroundPool: ['night', 'custom'] }, keys), 'backgroundPool'); // 1.0.8's first try, never released
assert.deepEqual(s.validate({ backgroundPool: null }, keys), { backgroundPool: null });
['yes', 1].forEach(function (v) { assert.equal(s.validate({ randomBackground: v }, keys), 'randomBackground'); });
[['nope'], ['night', 'night'], 'night', {}].forEach(function (v) { assert.equal(s.validate({ backgroundPool: v }, keys), 'backgroundPool', JSON.stringify(v)); });
assert.deepEqual(s.validate({ openApps: true }, keys), { openApps: true });
assert.equal(s.validate({ openApps: 'true' }, keys), 'openApps');
assert.deepEqual(s.validate({ tiles: [{ id: 'netflix', title: '  Netflix \n' }] }, keys), { tiles: [{ id: 'netflix', title: 'Netflix' }] });
assert.equal(s.validate({ tiles: [{ id: '../etc', title: 'x' }] }, keys), 'tiles');
assert.equal(s.validate({ tiles: [{ id: 'a', title: 'x' }, { id: 'a', title: 'y' }] }, keys), 'tiles');
assert.equal(s.validate({ veil: 101 }, keys), 'veil');
assert.equal(s.validate({ key: 'power' }, keys), 'key');
assert.deepEqual(s.validate({ port: 8091 }, keys), { port: 8091 });
// The clock's style and size: only these values; Jost 200 at the medium size unless chosen.
['thin', 'classic', 'bold', 'mono', 'rounded', 'digital'].forEach(function (v) { assert.deepEqual(s.validate({ clockStyle: v }, keys), { clockStyle: v }); });
['small', 'medium', 'large'].forEach(function (v) { assert.deepEqual(s.validate({ clockSize: v }, keys), { clockSize: v }); });
['comic', '', 'Thin', 12, null].forEach(function (v) { assert.equal(s.validate({ clockStyle: v }, keys), 'clockStyle', String(v)); });
['huge', '', 2, null].forEach(function (v) { assert.equal(s.validate({ clockSize: v }, keys), 'clockSize', String(v)); });
assert.equal(s.DEFAULTS.clockStyle, 'thin'); assert.equal(s.DEFAULTS.clockSize, 'medium');
// Web page tiles: an id of their own and an http or https address.
var webTile = { id: 'web.k3x9', title: ' Meteo  ', url: 'https://www.meteo.it/oggi?citta=Stradella#ora' };
assert.deepEqual(s.validate({ tiles: [webTile] }, keys), { tiles: [{ id: 'web.k3x9', title: 'Meteo', url: webTile.url }] });
['javascript:alert(1)', 'ftp://example.com', 'https://', 'https://a b.com', 'https://x.com/"><b>', 'file:///etc/passwd',
 'https://x.com/' + new Array(500).join('a'), 42, null].forEach(function (u) {
  assert.equal(s.validate({ tiles: [{ id: 'web.k3x9', title: 'x', url: u }] }, keys), 'tiles', String(u));
});
assert.equal(s.validate({ tiles: [{ id: 'web.k3x9', title: 'x' }] }, keys), 'tiles'); // a web id needs its address
assert.equal(s.validate({ tiles: [{ id: 'netflix', title: 'x', url: 'https://netflix.com' }] }, keys), 'tiles'); // an app has none
assert.equal(s.validate({ tiles: [{ id: 'web.k3x9', title: 'x', url: 'https://a.it', device: 'tv' }] }, keys), 'tiles');
assert.equal(s.validate({ tiles: [{ id: 'web.k3x9', title: '', url: 'https://a.it' }] }, keys), 'tiles');
// A logo or icon picked for a tile, from the catalogue only; none means automatic.
assert.deepEqual(s.validate({ tiles: [{ id: 'com.amazoff.patcher', title: 'AmazOff', logo: 'xbox' }] }, keys),
  { tiles: [{ id: 'com.amazoff.patcher', title: 'AmazOff', logo: 'xbox' }] });
assert.deepEqual(s.validate({ tiles: [{ id: 'web.k3x9', title: 'x', url: 'https://a.it', logo: 'hdmi' }] }, keys).tiles[0].logo, 'hdmi');
assert.deepEqual(s.validate({ tiles: [{ id: 'com.webos.app.hdmi1', title: 'x', device: 'ps5', logo: 'arte' }] }, keys).tiles[0].logo, 'arte');
['nope', '', 'XBOX', '__proto__', 'toString', 3, null].forEach(function (v) {
  assert.equal(s.validate({ tiles: [{ id: 'netflix', title: 'x', logo: v }] }, keys), 'tiles', String(v));
});
assert.ok(Object.keys(s.CATALOG).length > 100 && s.CATALOG.hdmi && s.CATALOG.netflix && s.CATALOG.arte);
// Every background the app carries: 1920 × 1080 with a 384 × 216 copy, a credit, and a link for those not its own.
JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app', 'backgrounds', 'index.json'), 'utf8')).forEach(function (b) {
  var dir = path.join(__dirname, '..', 'app', 'backgrounds');
  assert.ok(/^[a-z0-9-]+$/.test(b.id) && b.title && b.short && b.by && ['pd', 'cc0', 'ccbysa', 'rights', 'own'].indexOf(b.licence) !== -1, b.id);
  assert.ok(b.licence === 'own' || /^https:\/\//.test(b.link), b.id + ' link');
  assert.deepEqual(s.jpegSize(fs.readFileSync(path.join(dir, b.id + '.jpg'))), { width: 1920, height: 1080 }, b.id);
  assert.deepEqual(s.jpegSize(fs.readFileSync(path.join(dir, 'thumbs', b.id + '.jpg'))), { width: 384, height: 216 }, b.id + ' thumb');
});
// Each licence a background names has its words in the settings page.
['pd', 'cc0', 'ccbysa', 'rights', 'own'].forEach(function (l) {
  assert.ok(new RegExp('\\b' + l + ": '").test(fs.readFileSync(path.join(__dirname, '..', 'app', 'service', 'settings.html'), 'utf8')), l);
});

// Open apps the Home may close: those a tile could open, never Lightkeeper, an input,
// Live TV, an app kept hidden or LG's Home, even when LG lists it as visible.
var tvApps = [{ id: 'netflix', title: 'Netflix' }, { id: 'youtube.leanback.v4', title: 'YouTube' },
  { id: 'io.github.chiotas.lightkeeper', title: 'Lightkeeper' }, { id: 'com.webos.app.hdmi1', title: 'HDMI 1', visible: false },
  { id: 'com.webos.app.livetv', title: 'Live TV' }, { id: 'com.webos.app.membership', title: 'LG Account', visible: false },
  { id: 'com.webos.app.home', title: 'Home' }, { id: 'cdp-30', title: 'Plex' }];
var runningNow = { returnValue: true, running: ['youtube.leanback.v4', 'com.webos.app.home', 'io.github.chiotas.lightkeeper', 'com.webos.app.hdmi1',
  'com.webos.app.livetv', 'com.webos.app.membership', 'netflix', 'com.palm.service.something'].map(function (id) {
    return { id: id, appType: 'web', defaultWindowType: 'card', processid: '', webprocessid: '' }; // as a C1 answers
  }) };
assert.deepEqual(s.openApps(runningNow, tvApps), [{ id: 'netflix', title: 'Netflix' }, { id: 'youtube.leanback.v4', title: 'YouTube' }]);
assert.deepEqual(s.openApps(null, tvApps), []);
assert.deepEqual(s.openApps({ running: [{ appId: 'netflix' }, null, 'netflix'] }, tvApps), []);
// Asked by the Home only: from the TV itself, by its file:// page or one on the TV's own servers.
function fromHome(addr, origin) { return s.fromHome({ socket: { remoteAddress: addr }, headers: origin === undefined ? {} : { origin: origin } }); }
assert.ok(fromHome('127.0.0.1', 'null') && fromHome('::ffff:127.0.0.1', 'null') && fromHome('::1', 'file://'));
assert.ok(fromHome('127.0.0.1') && fromHome('127.0.0.1', 'http://127.0.0.1:8091') && fromHome('127.0.0.1', 'http://localhost'));
assert.ok(fromHome('127.0.0.1', 'file://io.github.chiotas.lightkeeper-webos'), 'the Home on webOS 6');
assert.ok(!fromHome('127.0.0.1', 'file://other.app-webos') && !fromHome('192.168.0.20', 'file://io.github.chiotas.lightkeeper-webos'));
assert.ok(!fromHome('192.168.0.20', 'null') && !fromHome('192.168.0.20'), 'not from a phone');
assert.ok(!fromHome('127.0.0.1', 'https://evil.example') && !fromHome('127.0.0.1', 'http://127.0.0.1.evil.example') && !fromHome('127.0.0.1', 'http://192.168.0.53:8090'));

// Updates: versions compared by number, the manifest checked, the package checked against it.
assert.ok(s.newer('1.0.9', '1.0.10') && s.newer('1.0.5', '1.1') && !s.newer('1.0.5', '1.0.5') && !s.newer('1.0.6', '1.0.5'));
var REL = 'https://github.com/chiotas/lightkeeper/releases/';
var goodManifest = { version: '1.0.6', ipkUrl: REL + 'download/v1.0.6/x.ipk', ipkHash: { sha256: new Array(65).join('a') }, ipkSize: 3 };
assert.deepEqual(s.readManifest(JSON.stringify(goodManifest), REL), { version: '1.0.6', url: goodManifest.ipkUrl, sha256: new Array(65).join('a'), size: 3 });
assert.equal(typeof s.readManifest('<html>not found</html>', REL), 'string');
assert.equal(typeof s.readManifest(JSON.stringify({ version: '1.0.6', ipkUrl: 'https://example.com/x.ipk', ipkHash: { sha256: new Array(65).join('a') }, ipkSize: 3 }), REL), 'string');
assert.equal(typeof s.readManifest(JSON.stringify({ version: '1.0.6', ipkUrl: REL + '../x.ipk', ipkHash: { sha256: new Array(65).join('a') }, ipkSize: 3 }), REL), 'string');
assert.equal(typeof s.readManifest(JSON.stringify({ version: '1.0.6', ipkUrl: REL + 'x.ipk', ipkHash: { sha256: 'abc' }, ipkSize: 3 }), REL), 'string');
var pkg = path.join(tmp, 'pkg.ipk');
fs.writeFileSync(pkg, 'abc');
var abcSha = require('crypto').createHash('sha256').update('abc').digest('hex');
assert.equal(s.verifyIpk(pkg, { size: 3, sha256: abcSha }), null);
assert.ok(/sha256/.test(s.verifyIpk(pkg, { size: 3, sha256: new Array(65).join('b') })));
assert.ok(/bytes/.test(s.verifyIpk(pkg, { size: 4, sha256: abcSha })));
// update.sh: the TV's answer written for the page, installed or not; the package goes either way.
var UPDATE_SH = path.join(__dirname, '..', 'app', 'service', 'update.sh');
function runUpdater(lunaSend) {
  var st = path.join(tmp, 'update-status.json'), ipkFile = path.join(tmp, 'u.ipk');
  fs.writeFileSync(ipkFile, 'x');
  require('child_process').execFileSync('sh', [UPDATE_SH, ipkFile, '9.9.9'], { env: Object.assign({}, process.env, {
    LIGHTKEEPER_LUNA_SEND: lunaSend, LIGHTKEEPER_STATUS: st, LIGHTKEEPER_LOG: path.join(tmp, 'update.log'), LIGHTKEEPER_APPDIR: path.join(tmp, 'no-app') }) });
  assert.ok(!fs.existsSync(ipkFile));
  return JSON.parse(fs.readFileSync(st, 'utf8'));
}
assert.equal(runUpdater(path.join(FAKE, 'luna-send')).state, 'installed');
var refusing = path.join(tmp, 'luna-send-refusing');
fs.writeFileSync(refusing, '#!/bin/sh\necho \'{"returnValue":false,"errorText":"ipk verified failed"}\'\n', { mode: 493 });
var refused = runUpdater(refusing);
assert.equal(refused.state, 'failed'); assert.ok(/ipk verified failed/.test(refused.error), refused.error);

// The Home loads logos.js and then its own script into one global scope: a name
// declared in both overwrites the first (issue #2, the Home's weather icons were ICONE).
function globals(file) {
  var names = {}, re = /^(?:var|function) ([A-Za-z_$][\w$]*)/gm, m, text = fs.readFileSync(path.join(__dirname, '..', 'app', file), 'utf8');
  while ((m = re.exec(text))) names[m[1]] = true;
  return names;
}
var logosGlobals = globals('logos.js'), homeGlobals = globals('index.html');
assert.deepEqual(Object.keys(homeGlobals).filter(function (n) { return logosGlobals[n]; }), [], 'names declared by both logos.js and the Home');

// A TV without LG's key filters, as webOS 3 (issue #3): the key is reported as
// unsupported rather than "within a minute", and GlassHouse's map is left alone.
var noFilters = require('child_process').execFileSync(process.execPath, ['-e',
  'require(' + JSON.stringify(require.resolve('../app/service/server.js')) + ").applyKey('home', function (s) { console.log(s); })"],
  { env: Object.assign({}, process.env, { LIGHTKEEPER_KEY_FILTERS: path.join(tmp, 'no-key-filters') }) }).toString().trim();
assert.equal(noFilters, 'unsupported');

// At power on (the boot hook): over an input, LG's Home or nothing; over the app
// webOS puts back from before the TV went off; not over one that came up with it.
var HOOK_SCRIPT = path.join(__dirname, '..', 'app', 'service', 'lightkeeper-init');
[['com.webos.app.hdmi3', 'org.webosbrew.hbchannel', 'open'], ['', 'netflix', 'open'], ['com.webos.app.home', '', 'open'],
 ['org.webosbrew.hbchannel', 'org.webosbrew.hbchannel', 'cover'], ['netflix', 'com.webos.app.hdmi3', 'stay'],
 ['netflix', '', 'stay'], ['io.github.chiotas.lightkeeper', 'io.github.chiotas.lightkeeper', 'self']].forEach(function (c) {
  var got = require('child_process').execFileSync('sh', [HOOK_SCRIPT, '--decide', c[0], c[1]]).toString().trim();
  assert.equal(got, c[2], c[0] + ' after ' + c[1]);
});

// The boot hook started within five minutes of the TV starting is a cold start, and
// its first "Active" opens Lightkeeper; later it is the installer or an update with the
// TV on, and nothing opens over what is being watched.
[['40.12', '1'], ['299.99', '1'], ['300.00', '0'], ['26460.33', '0'], ['', '0']].forEach(function (c) {
  assert.equal(require('child_process').execFileSync('sh', [HOOK_SCRIPT, '--off-at-start', c[0]]).toString().trim(), c[1], c[0]);
});

// An app's icon: the largest the TV lists, 192 px extraLargeIcon before the 130 px largeIcon.
var appDir = path.join(tmp, 'app-icons');
fs.mkdirSync(appDir);
['icon.png', 'largeIcon.png', 'extraLarge.png'].forEach(function (f) { fs.writeFileSync(path.join(appDir, f), 'x'); });
var oneApp = [{ id: 'some.app', folderPath: appDir, icon: 'icon.png', largeIcon: 'largeIcon.png', extraLargeIcon: 'extraLarge.png' }];
assert.equal(s.iconFile(oneApp, 'some.app'), path.join(appDir, 'extraLarge.png'));
fs.unlinkSync(path.join(appDir, 'extraLarge.png'));
assert.equal(s.iconFile(oneApp, 'some.app'), path.join(appDir, 'largeIcon.png'));
assert.equal(s.iconFile([{ id: 'other.app', folderPath: appDir, icon: 'icon.png' }], 'other.app'), path.join(appDir, 'icon.png'));

// Back from the last app without an LG Home app (webOS 3, issue #3), replaying the
// foreground apps a B7 reported: Plex, nothing, Live TV. An input or Live TV picked
// straight from an app, or Lightkeeper itself giving way, does not count.
function replay(apps) {
  return require('child_process').execFileSync('sh', [HOOK_SCRIPT, '--replay'], { input: apps.join('\n') + '\n' })
    .toString().trim().split('\n').filter(Boolean);
}
assert.deepEqual(replay(['io.github.chiotas.lightkeeper', 'cdp-30', '', 'com.webos.app.livetv', 'io.github.chiotas.lightkeeper']),
  ['open (cdp-30 -> nothing)', 'open ( -> com.webos.app.livetv)']);
assert.deepEqual(replay(['cdp-30', 'com.webos.app.hdmi1', 'netflix', 'com.webos.app.livetv', 'io.github.chiotas.lightkeeper', '']), []);
assert.deepEqual(replay(['com.webos.app.livetv', '', 'com.webos.app.livetv']), []);

// Back from the last app with LG's Home app (webOS 6), replaying life events as a
// C1 with webOS 6.5.3 sent them (25/10): Lightkeeper opens at the stop of the app in
// front, before sam launches LG's Home. Not when switching apps (the next app in
// front in the same millisecond, no stop), not for apps closed from Lightkeeper, not
// for LG's Home after Lightkeeper's Down arrow, not while the TV goes off.
function replayLife(lines, power) {
  // "<seconds> <event> <appId> [card]", sent as the JSON lines luna-send prints; "<seconds> front <appId>"
  // for what the TV has in front from then on, as getForegroundAppInfo would answer.
  var json = lines.map(function (l) {
    var w = l.split(' ');
    if (w[1] === 'front') return l;
    return w[0] + ' ' + JSON.stringify({ event: w[1], appId: w[2], reason: 'undefined',
      windowType: w[3] === 'card' ? '_WEBOS_WINDOW_TYPE_CARD' : '_WEBOS_WINDOW_TYPE_OVERLAY', returnValue: true, subscribed: true });
  });
  return require('child_process').execFileSync('sh', [HOOK_SCRIPT, '--replay-life'],
    { input: json.join('\n') + '\n', env: Object.assign({}, process.env, { POWER: power || 'Active' }) })
    .toString().trim().split('\n').filter(Boolean);
}
var LK = 'io.github.chiotas.lightkeeper', LGHOME = 'com.webos.app.home';
var backOut = ['50 foreground amazon card', '56 background amazon', '56 stop amazon'];
assert.deepEqual(replayLife(backOut.concat(['56 foreground ' + LK + ' card'])), ['open (stop amazon)']);
// LG's Home in front all the same, right after: covered again; later, it is the Down arrow.
assert.deepEqual(replayLife(backOut.concat(['56 foreground ' + LK + ' card', '57 front ' + LGHOME, '57 foreground ' + LGHOME + ' card'])),
  ['open (stop amazon)', 'open (foreground ' + LGHOME + ')']);
assert.deepEqual(replayLife(backOut.concat(['56 foreground ' + LK + ' card', '70 foreground ' + LGHOME + ' card'])), ['open (stop amazon)']);
// As 1.0.7 measured it, LG's Home before Lightkeeper: covered.
assert.deepEqual(replayLife(['50 foreground amazon card', '57 front ' + LGHOME, '57 foreground ' + LGHOME + ' card']), ['open (foreground ' + LGHOME + ')']);
// YouTube and PlxNative on the C1 (26/10): no stop, LG's Home launched first, in front 0.15 s later.
// Covered sooner, LG's Home took the screen back: Lightkeeper opens a second after it is in front.
var youtube = ['40 foreground youtube.leanback.v4 card', '40 front youtube.leanback.v4', '56 launch ' + LGHOME, '56 background youtube.leanback.v4'];
assert.deepEqual(replayLife(youtube.concat(['56 foreground ' + LGHOME + ' card', '58 foreground ' + LK + ' card'])), ['open (foreground ' + LGHOME + ')']);
assert.deepEqual(replayLife(youtube.concat(['56 front ' + LGHOME, '56 foreground ' + LGHOME + ' card'])), ['open (foreground ' + LGHOME + ')']);
assert.deepEqual(replayLife(['60 foreground com.beb.plxnative card', '60 front com.beb.plxnative', '69 launch ' + LGHOME,
  '69 background com.beb.plxnative', '69 foreground ' + LGHOME + ' card', '70 foreground ' + LK + ' card']), ['open (foreground ' + LGHOME + ')']);
// The browser, from the settings page: it stops, and LG's Home never comes.
assert.deepEqual(replayLife(['80 foreground com.webos.app.browser card', '83 stop com.webos.app.browser', '83 front ',
  '84 foreground ' + LK + ' card']), ['open (stop com.webos.app.browser)']);
// Down from Lightkeeper launches LG's Home on purpose; nor while the TV goes off.
assert.deepEqual(replayLife(['50 foreground ' + LK + ' card', '60 launch ' + LGHOME, '60 foreground ' + LGHOME + ' card']), []);
assert.deepEqual(replayLife(youtube.concat(['56 foreground ' + LGHOME + ' card']), 'Active Standby'), []);
// Switching apps, then the old one stopped; apps closed from Lightkeeper; Down from Lightkeeper.
assert.deepEqual(replayLife(['50 foreground amazon card', '55 background amazon', '55 foreground netflix card', '60 stop amazon']), []);
assert.deepEqual(replayLife(['50 foreground ' + LK + ' card', '52 stop netflix', '53 stop youtube.leanback.v4']), []);
assert.deepEqual(replayLife(['50 foreground ' + LK + ' card', '60 foreground ' + LGHOME + ' card']), []);
// Overlays do not count; an input stopping does not; nor an app stopping as the TV goes off.
assert.deepEqual(replayLife(['50 foreground amazon card', '51 foreground com.webos.app.voice', '52 stop com.webos.app.voice']), []);
assert.deepEqual(replayLife(['50 foreground com.webos.app.hdmi3 card', '52 stop com.webos.app.hdmi3']), []);
assert.deepEqual(replayLife(backOut, 'Active Standby'), []);
assert.ok(!fs.existsSync(path.join(env.LIGHTKEEPER_TVWEB, 'remotekeys.json')));
// An entry left by 1.0.1 or 1.0.2 is taken out, GlassHouse's own keys stay.
fs.writeFileSync(path.join(env.LIGHTKEEPER_TVWEB, 'remotekeys.json'), JSON.stringify({ keys: { red: 'some.app' }, home: 'io.github.chiotas.lightkeeper' }));
require('child_process').execFileSync(process.execPath, ['-e',
  'require(' + JSON.stringify(require.resolve('../app/service/server.js')) + ").applyKey('home', function () {})"],
  { env: Object.assign({}, process.env, { LIGHTKEEPER_KEY_FILTERS: path.join(tmp, 'no-key-filters') }) });
var left = JSON.parse(fs.readFileSync(path.join(env.LIGHTKEEPER_TVWEB, 'remotekeys.json'), 'utf8'));
assert.equal(left.home, undefined); assert.deepEqual(left.keys, { red: 'some.app' });
fs.unlinkSync(path.join(env.LIGHTKEEPER_TVWEB, 'remotekeys.json'));
[80, 70000, 8091.5, '8091', null].forEach(function (v) { assert.equal(s.validate({ port: v }, keys), 'port'); });
assert.deepEqual(s.validate({ key: 'red' }, keys), { key: 'red' });
assert.equal(s.validate({ weather: { name: 'X', lat: 91, lon: 0 } }, keys), 'weather');
assert.equal(s.validate({ pin: '1234' }, keys), 'pin');
assert.equal(s.validate({ language: 'fr' }, keys), 'language');
assert.deepEqual(s.validate({ preset: 'night' }, keys), { preset: 'night' });
// Up to fifty tiles, and the names under logos and icons.
var many = [];
for (var n = 0; n < 51; n++) many.push({ id: 'app' + n, title: 'App ' + n });
assert.equal(s.validate({ tiles: many.slice(0, 50) }, keys).tiles.length, 50);
assert.equal(s.validate({ tiles: many }, keys), 'tiles');
assert.deepEqual(s.validate({ tileStyle: 'logo', labels: 'none' }, keys), { tileStyle: 'logo', labels: 'none' });
assert.deepEqual(s.validate({ labels: 'selected' }, keys), { labels: 'selected' });
assert.equal(s.validate({ labels: 'some' }, keys), 'labels');
// Two rows: off unless chosen, and the break is a single number, so never a third row.
assert.deepEqual([s.DEFAULTS.twoRows, s.DEFAULTS.rowBreak], [false, null]);
assert.deepEqual(s.validate({ twoRows: true, rowBreak: 3 }, keys), { twoRows: true, rowBreak: 3 });
assert.deepEqual(s.validate({ twoRows: false, rowBreak: null }, keys), { twoRows: false, rowBreak: null });
assert.equal(s.validate({ twoRows: 'yes' }, keys), 'twoRows');
[[2, 4], -1, 51, 2.5, '3'].forEach(function (v) { assert.equal(s.validate({ rowBreak: v }, keys), 'rowBreak', JSON.stringify(v)); });
assert.deepEqual(s.validate({ tileStyle: 'logo', tiles: [{ id: 'com.webos.app.hdmi3', title: 'PS5', device: 'ps5' }] }, keys),
  { tileStyle: 'logo', tiles: [{ id: 'com.webos.app.hdmi3', title: 'PS5', device: 'ps5' }] });
assert.equal(s.validate({ tiles: [{ id: 'netflix', title: 'Netflix', device: 'ps5' }] }, keys), 'tiles'); // apps have no device
assert.equal(s.validate({ tiles: [{ id: 'com.webos.app.hdmi1', title: 'X', device: 'toaster' }] }, keys), 'tiles');
assert.equal(s.validate({ preset: '../../etc/passwd' }, keys), 'preset');

// Two rows at most: the Home has two of them, the settings' preview too.
assert.equal(fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8').match(/<nav[ >]/g).length, 2);
assert.equal(fs.readFileSync(path.join(__dirname, '..', 'app', 'service', 'settings.html'), 'utf8').match(/<nav[ >]/g).length, 2);
// A row wider than the screen keeps each name on one line: tiles are flex items, which shrink.
assert.ok(/\nnav a \{[^}]*white-space: nowrap;/.test(fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8')));

// The device an HDMI label names (logos.js runs in the page; here only its pure part).
var vm = require('vm'), logos = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'app', 'logos.js'), 'utf8'), logos);
[['PS5 Console giochi', 'ps5'], ['PlayStation 4', 'ps4'], ['Xbox Series X', 'xboxseries'], ['XBOX ONE', 'xbox'],
 ['Nintendo Switch 2', 'switch2'], ['Nintendo Switch', 'switch'], ['Steam Deck', 'steamdeck'], ['Apple TV 4K', 'appletv'], ['Shield TV', 'shield'],
 ['Chromecast', 'chromecast'], ['Google TV', 'googletv'], ['Fire TV Stick', 'firetv'], ['Game console', 'console'], ['HDMI 2', 'hdmi'], ['', 'hdmi'],
 ['Nintendo Wii', 'wii'], ['Wii', 'wii'], ['Roku Ultra', 'roku'], ['Roku', 'roku']
].forEach(function (c) { assert.equal(logos.indovinaApparecchio(c[0]), c[1], c[0]); });
assert.equal(logos.logoDi({ id: 'netflix', title: 'Netflix' }, 'logo'), 'netflix');
assert.equal(logos.logoDi({ id: 'netflix', title: 'Netflix' }, 'icon'), ''); // the TV's own icon
assert.equal(logos.logoDi({ id: 'amazon', title: 'Prime Video' }, 'logo'), 'primevideo');
assert.equal(logos.logoDi({ id: 'it.rai.raiplay', title: 'RaiPlay' }, 'logo'), 'raiplay');
assert.equal(logos.logoDi({ id: 'some.app', title: 'Some App' }, 'logo'), ''); // no logo: the TV's icon
// Sky Q (#9): by an app's title, and picked for an HDMI input.
assert.equal(logos.logoDi({ id: 'some.app', title: 'Sky Q' }, 'logo'), 'skyq');
assert.equal(logos.logoDi({ id: 'com.webos.app.hdmi2', title: 'HDMI 2', logo: 'skyq' }, 'icon'), 'skyq');
// Sky Stream (#10), the same way.
assert.equal(logos.logoDi({ id: 'some.app', title: 'Sky Stream' }, 'logo'), 'skystream');
assert.equal(logos.logoDi({ id: 'com.webos.app.hdmi3', title: 'HDMI 3', logo: 'skystream' }, 'logo'), 'skystream');
assert.equal(logos.IMMAGINI_NOMI.skystream, 'Sky Stream');
// A logo uploaded: shown once the page knows it (cfg.myLogos), with names and logos alike but not names only.
assert.equal(logos.logoDi({ id: 'netflix', title: 'Netflix', logo: 'up-0123abcd' }, 'logo'), 'netflix');
logos.MIEI = { 'up-0123abcd': [480, 240] };
assert.equal(logos.logoDi({ id: 'netflix', title: 'Netflix', logo: 'up-0123abcd' }, 'logo'), 'up-0123abcd');
assert.equal(logos.logoDi({ id: 'netflix', title: 'Netflix', logo: 'up-0123abcd' }, 'text'), '');
logos.MIEI = {};
assert.equal(logos.logoDi({ id: 'com.webos.app.browser', title: 'Browser Web' }, 'logo'), 'browser');
assert.equal(logos.logoDi({ id: 'com.webos.app.livetv', title: 'Canali TV' }, 'text'), 'tv');
assert.equal(logos.logoDi({ id: 'com.webos.app.hdmi3', title: 'PlayStation 5' }, 'icon'), 'playstation5');
assert.equal(logos.logoDi({ id: 'com.webos.app.hdmi1', title: 'Box', device: 'firetv' }, 'logo'), 'firetv');
// Roku and Nintendo Wii, as asked on Reddit: as an input's device, and in the icon grid.
assert.equal(logos.logoDi({ id: 'com.webos.app.hdmi1', title: 'HDMI 1', device: 'roku' }, 'logo'), 'roku');
assert.equal(logos.logoDi({ id: 'com.webos.app.hdmi2', title: 'Wii' }, 'logo'), 'wii');
assert.deepEqual([logos.SIMPLE_ICONS_NOMI.roku, logos.IMMAGINI_NOMI.wii], ['Roku', 'Wii']);
assert.equal(logos.logoDi({ id: 'com.webos.app.hdmi2', title: 'Xbox Series X' }, 'logo'), 'xbox');
// Every logo picture is in app/logos/ at the size the table gives; every Commons file listed has its
// picture; every title leads to a drawing; arte, by the title its app has, gets its logo (October 2026).
function pngSize(f) { var b = fs.readFileSync(f); return [b.readUInt32BE(16), b.readUInt32BE(20)]; }
Object.keys(logos.IMMAGINI).forEach(function (n) {
  assert.deepEqual(pngSize(path.join(__dirname, '..', 'app', 'logos', n + '.png')), logos.IMMAGINI[n], n);
});
// Every logo has the name the settings' icon grid shows under it.
Object.keys(logos.SIMPLE_ICONS).forEach(function (n) { assert.ok(logos.SIMPLE_ICONS_NOMI[n], 'a name for ' + n); });
Object.keys(logos.IMMAGINI).forEach(function (n) { assert.ok(logos.IMMAGINI_NOMI[n], 'a name for ' + n); });
assert.deepEqual([logos.IMMAGINI_NOMI.amazonalexa, logos.SIMPLE_ICONS_NOMI.applemusic, logos.IMMAGINI_NOMI.ardmediathek, logos.IMMAGINI_NOMI.betplus],
  ['Alexa', 'Apple Music', 'ARD Mediathek', 'BET+']);
fs.readFileSync(path.join(__dirname, '..', 'docs', 'art', 'logos-commons.tsv'), 'utf8').split('\n').forEach(function (l) {
  var n = l.split('\t')[0];
  if (n && n.charAt(0) !== '#' && n !== 'name') assert.ok(logos.IMMAGINI[n], 'a picture for ' + n);
});
Object.keys(logos.LOGHI_TITOLI).forEach(function (t) {
  var n = logos.LOGHI_TITOLI[t];
  assert.ok(logos.SIMPLE_ICONS[n] || logos.IMMAGINI[n] || logos.ICONE[n], t + ' leads to ' + n);
});
['arte', 'ARTE', 'arte.tv'].forEach(function (t) { assert.equal(logos.logoDi({ id: 'some.arte.app', title: t }, 'logo'), 'arte', t); });
assert.equal(logos.logoDi({ id: 'some.app', title: 'BBC iPlayer' }, 'logo'), '');
// A web page: the browser's icon with logos, none fetched otherwise; it opens in the browser, as the gear does.
['https://www.meteo.it', 'http://192.168.0.1:8080/x?a=1', 'https://[::1]/', 'javascript:alert(1)', 'https://', 'https://a b.com', 'https://x.com/"><b>']
  .forEach(function (u) { assert.equal(logos.indirizzoWeb(u), s.webUrl(u), 'page and server agree on ' + u); });
assert.equal(logos.logoDi({ id: 'web.k3x9', title: 'Netflix', url: 'https://a.it' }, 'logo'), 'browser');
// The picked one takes the automatic one's place with logos and app icons, not with names;
// a name that is not in the catalogue is ignored.
var amazoff = { id: 'com.amazoff.patcher', title: 'AmazOff' };
assert.equal(logos.logoDi(amazoff, 'logo'), '');
assert.equal(logos.logoDi({ id: amazoff.id, title: amazoff.title, logo: 'xbox' }, 'logo'), 'xbox');
assert.equal(logos.logoDi({ id: amazoff.id, title: amazoff.title, logo: 'xbox' }, 'icon'), 'xbox');
assert.equal(logos.logoDi({ id: amazoff.id, title: amazoff.title, logo: 'xbox' }, 'text'), '');
assert.equal(logos.logoDi({ id: 'com.webos.app.hdmi3', title: 'PS5', device: 'ps5', logo: 'tv' }, 'logo'), 'tv');
assert.equal(logos.logoDi({ id: 'netflix', title: 'Netflix', logo: 'gone' }, 'logo'), 'netflix');
// Two rows off, or not set as before 1.0.10: one row, wherever the break is. On: the break, if both rows have tiles.
var otto = [1, 2, 3, 4, 5, 6, 7, 8].map(function (n) { return { id: 'app' + n, title: 'App ' + n }; });
[undefined, false].forEach(function (on) {
  [undefined, null, 0, 3, 8].forEach(function (k) { assert.equal(logos.inizioSeconda({ tiles: otto, twoRows: on, rowBreak: k }), 0); });
});
assert.equal(logos.inizioSeconda({ tiles: otto, twoRows: true, rowBreak: 3 }), 3);
[null, 0, 8, 9, 2.5, '3'].forEach(function (k) { assert.equal(logos.inizioSeconda({ tiles: otto, twoRows: true, rowBreak: k }), 0, String(k)); });
assert.equal(logos.inizioSeconda({ twoRows: true, rowBreak: 1 }), 0); // no tiles
// The clock: no class, so the Home's rule for it as it has always been, unless a style or size is chosen.
assert.equal(logos.classeOra({}), '');
assert.equal(logos.classeOra({ clockStyle: 'thin', clockSize: 'medium' }), '');
assert.equal(logos.classeOra({ clockStyle: 'digital', clockSize: 'large' }), 'st-digital sz-large');
// The clock's first digit lined up with the weather: by a fixed, measured amount per font and
// digit, in em so every size follows; thin, the default, keeps its place.
assert.equal(logos.rientroOra('thin', '10:41'), '');
assert.equal(logos.rientroOra(undefined, '10:41'), '');
assert.equal(logos.rientroOra('digital', '10:41'), '-0.655em');
assert.equal(logos.rientroOra('digital', '1:41PM'), '-0.655em');
assert.equal(logos.rientroOra('digital', '8:41'), '-0.099em');
['bold', 'classic', 'mono', 'rounded', 'digital'].forEach(function (st) {
  var r = logos.RIENTRO_ORA[st];
  assert.equal(r.length, 10, st);
  r.forEach(function (v) { assert.ok(v >= 0 && v < 1, st + ' ' + v); });
});
assert.ok(!logos.RIENTRO_ORA.thin);
var homeHtml = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
assert.ok(/allineaOra\(ora, meteoEl, cfg\)/.test(homeHtml), 'the Home lines the clock up');
// On the left as always; on the right, the clock and the weather moved by their ink's distance from the edge.
function finto(testo, piccolo) {
  return { style: {}, textContent: testo, getElementsByTagName: function (t) { return t === 'small' && piccolo ? [piccolo] : []; } };
}
var oraS = finto('8:41'), meteoS = finto('Rome \u00b7 12\u00b0');
logos.allineaOra(oraS, meteoS, { clockStyle: 'digital' });
assert.deepEqual([oraS.style.marginLeft, oraS.style.marginRight, meteoS.style.marginRight], ['-0.099em', '', '']);
logos.getComputedStyle = function (el) { return el.css; };
var oraD = finto('21:47'), meteoD = finto('Rome \u00b7 12\u00b0');
oraD.css = { fontSize: '150px', letterSpacing: '-3px' }; meteoD.css = { fontSize: '34px' };
logos.allineaOra(oraD, meteoD, { clockStyle: 'thin', clockSide: 'right' });
assert.equal(oraD.style.marginLeft, '');
assert.ok(Math.abs(parseFloat(oraD.style.marginRight) - -(logos.RIENTRO_DX.thin[7] * 150 - 3)) < 1e-9, oraD.style.marginRight);
assert.ok(Math.abs(parseFloat(meteoD.style.marginRight) - -(logos.RIENTRO_DX.deg * 34)) < 1e-9, meteoD.style.marginRight);
var pm = finto('PM'); pm.css = { fontSize: '52px', letterSpacing: '1.04px' };
var oraP = finto('9:41PM', pm);
logos.allineaOra(oraP, finto(''), { clockStyle: 'classic', clockSide: 'right' });
assert.ok(Math.abs(parseFloat(oraP.style.marginRight) - -(logos.RIENTRO_DX.classic[10] * 52 + 1.04)) < 1e-9, oraP.style.marginRight);
assert.ok(homeHtml.indexOf('#ora { font-size: 150px; font-weight: 200; line-height: 1; letter-spacing: -.02em; }') !== -1, 'the default clock rule is unchanged');
['classic', 'mono', 'rounded', 'digital'].forEach(function (n) {
  var f = path.join(__dirname, '..', 'app', 'clock', n + '.woff2');
  assert.equal(fs.readFileSync(f).slice(0, 4).toString(), 'wOF2', n);
  assert.ok(/SIL Open Font License, Version 1\.1/.test(fs.readFileSync(path.join(__dirname, '..', 'app', 'clock', 'OFL-' + n + '.txt'), 'utf8')), n + ' licence');
  assert.ok(homeHtml.indexOf('url(clock/' + n + '.woff2)') !== -1, n + ' in the Home');
});
assert.equal(logos.logoDi({ id: 'web.k3x9', title: 'Netflix', url: 'https://a.it' }, 'icon'), '');
assert.deepEqual(JSON.parse(JSON.stringify(logos.apertura({ id: 'web.k3x9', url: 'https://a.it/' }, 'com.webos.app.browser'))),
  { id: 'com.webos.app.browser', params: { target: 'https://a.it/' } });
assert.deepEqual(JSON.parse(JSON.stringify(logos.apertura({ id: 'netflix' }, 'com.webos.app.browser'))), { id: 'netflix' });
 // not free everywhere on Commons: the TV's icon
assert.equal(logos.logoDi({ id: 'com.tvweb.dashboard', title: 'Glasshouse' }, 'logo'), 'glasshouse');
assert.equal(logos.logoDi({ id: 'space.nuvio.webos', title: 'Nuvio TV' }, 'logo'), ''); // GPL-3.0 logo, not taken: the TV's icon
// Live TV shows the TV unless a device is picked; every device, TV and media player
// included (issue #4), can be picked, has a picture, and is one the server accepts.
assert.equal(logos.logoDi({ id: 'com.webos.app.livetv', title: 'Live TV', device: 'hdmi' }, 'logo'), 'hdmi');
assert.equal(logos.logoDi({ id: 'com.webos.app.hdmi1', title: 'Antenna', device: 'tv' }, 'logo'), 'tv');
assert.equal(logos.logoDi({ id: 'com.webos.app.hdmi1', title: 'Decoder Sky' }, 'logo'), 'media');
assert.equal(logos.apparecchioAuto({ id: 'com.webos.app.livetv', title: 'Live TV' }), 'tv');
assert.equal(logos.apparecchioAuto({ id: 'com.webos.app.hdmi2', title: 'HDMI 2' }), 'hdmi');
assert.equal(logos.indovinaApparecchio('Xbox One'), 'xbox'); // not a "box"
logos.APPARECCHI.forEach(function (a) {
  assert.ok(logos.SIMPLE_ICONS[a.logo] || logos.IMMAGINI[a.logo] || logos.ICONE[a.logo], 'a picture for ' + a.id);
});
assert.deepEqual(s.DEVICES.slice().sort(), logos.APPARECCHI.map(function (a) { return a.id; }).sort());
assert.deepEqual(s.validate({ tiles: [{ id: 'com.webos.app.livetv', title: 'Live TV', device: 'tv' }] }, keys),
  { tiles: [{ id: 'com.webos.app.livetv', title: 'Live TV', device: 'tv' }] });
assert.equal(s.validate({ tiles: [{ id: 'netflix', title: 'Netflix', device: 'tv' }] }, keys), 'tiles');

// Guards.
assert.ok(s.isLocal('192.168.0.20') && s.isLocal('::ffff:10.1.2.3') && s.isLocal('127.0.0.1') && s.isLocal('fe80::1'));
assert.ok(!s.isLocal('8.8.8.8') && !s.isLocal('172.32.0.1') && !s.isLocal('2001:db8::1'));
assert.ok(s.hostOk({ headers: { host: '192.168.1.50:8090' } }) && s.hostOk({ headers: { host: 'localhost:8090' } }));
assert.ok(!s.hostOk({ headers: { host: 'evil.example:8090' } }) && !s.hostOk({ headers: {} }));

// A JPEG's size from its frame header; anything else is not one.
var jpeg = fs.readFileSync(path.join(__dirname, '..', 'app', 'backgrounds', 'godrevy.jpg'));
var thumbJpeg = fs.readFileSync(path.join(__dirname, '..', 'app', 'backgrounds', 'thumbs', 'night.jpg'));
var mineA, mine3 = []; // ids of pictures uploaded in the checks
// A logo of yours: Sky Q's white picture is a PNG with transparency, 647 × 236.
var logoPng = fs.readFileSync(path.join(__dirname, '..', 'app', 'logos', 'skyq.png')), logoA;
function pngWith(at, value) { var b = Buffer.from ? Buffer.from(logoPng) : new Buffer(logoPng); b.writeUInt32BE(value, at); return b; }
function png(b) { return { headers: { 'Content-Type': 'image/png' }, body: b }; }
function upload(file, cb) {
  req('POST', '/api/background', { headers: { 'Content-Type': 'image/jpeg' }, body: fs.readFileSync(path.join(__dirname, '..', 'app', 'backgrounds', file)) }, cb);
}
assert.deepEqual(s.jpegSize(jpeg), { width: 1920, height: 1080 });
assert.equal(s.jpegSize(fs.readFileSync(path.join(__dirname, '..', 'app', 'icon.png'))), null);

// Keys this TV's filters name.
assert.deepEqual(s.keysOnTv().map(function (k) { return k.key; }), ['netflix', 'amazon', 'info', 'red', 'green', 'yellow', 'blue']);

var mapFile = path.join(env.LIGHTKEEPER_TVWEB, 'remotekeys.json');
fs.writeFileSync(mapFile, JSON.stringify({ keys: { netflix: 'cdp-30' }, starting: '' }));

s.applyKey('home', function (state) {
  // No filter in the chain yet: GlassHouse is restarted to put it there.
  assert.equal(state, 'pending');
  var j = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
  assert.equal(j.home, 'io.github.chiotas.lightkeeper');
  assert.deepEqual(j.keys, { netflix: 'cdp-30' }); // GlassHouse's own key left alone
  fs.writeFileSync(path.join(FAKE, 'chain-has-filter'), '');
  s.applyKey('red', function (state2) {
    assert.equal(state2, 'active');
    var j2 = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
    assert.equal(j2.home, undefined);
    assert.deepEqual(j2.keys, { netflix: 'cdp-30', red: 'io.github.chiotas.lightkeeper' });
    var log = fs.readFileSync(path.join(FAKE, 'calls.log'), 'utf8');
    assert.ok(log.indexOf('"red":"io.github.chiotas.lightkeeper"') !== -1, 'configd written');
    s.applyKey('none', function (state3) {
      assert.equal(state3, 'off');
      assert.deepEqual(JSON.parse(fs.readFileSync(mapFile, 'utf8')).keys, { netflix: 'cdp-30' });
      httpChecks();
    });
  });
});

function req(method, p, opts, cb) {
  opts = opts || {};
  var port = opts.port || 18090;
  var headers = { Host: opts.host || '127.0.0.1:' + port };
  Object.keys(opts.headers || {}).forEach(function (k) { headers[k] = opts.headers[k]; });
  var r = http.request({ host: '127.0.0.1', port: port, method: method, path: p, headers: headers }, function (res) {
    var parts = [];
    res.on('data', function (d) { parts.push(d); });
    res.on('end', function () {
      var raw = Buffer.concat(parts), j = null;
      try { j = JSON.parse(raw.toString()); } catch (e) {}
      cb(res.statusCode, j, res.headers, raw);
    });
  });
  if (opts.body) r.write(opts.body);
  r.end();
}

function json(o) { return { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o) }; }

function httpChecks() {
  var child = spawn(process.execPath, [path.join(__dirname, '..', 'app', 'service', 'server.js')], { env: process.env, stdio: 'inherit' });
  var steps = [
    function (next) { req('GET', '/api/config', {}, function (st, j, h) {
      assert.equal(st, 200); assert.equal(h['access-control-allow-origin'], '*');
      assert.equal(j.pin, undefined); assert.equal(j.pinSet, false); next(); }); },
    function (next) { setTimeout(next, 600); }, // the first start picks the tiles
    function (next) { req('GET', '/api/config', {}, function (st, j) {
      assert.deepEqual(j.tiles.map(function (t) { return t.id; }), ['netflix', 'amazon', 'youtube.leanback.v4', 'cdp-30', 'spotify-beehive']); next(); }); },
    function (next) { req('GET', '/api/config', { host: 'evil.example:18090' }, function (st) { assert.equal(st, 403); next(); }); },
    function (next) { req('POST', '/api/config', { headers: { 'Content-Type': 'text/plain' }, body: '{"clock":"12"}' }, function (st) { assert.equal(st, 415); next(); }); },
    function (next) { var o = json({ clock: '12' }); o.headers.Origin = 'http://evil.example'; req('POST', '/api/config', o, function (st) { assert.equal(st, 415); next(); }); },
    function (next) { req('POST', '/api/config', json({ clock: '12', veil: 60 }), function (st, j) { assert.equal(st, 200); assert.equal(j.config.clock, '12'); next(); }); },
    function (next) { req('POST', '/api/config', json({ run: 'rm -rf /' }), function (st, j) { assert.equal(st, 400); assert.equal(j.error, 'invalid: run'); next(); }); },
    function (next) { req('GET', '/api/tv', {}, function (st, j) {
      assert.equal(st, 200);
      assert.deepEqual(j.inputs.map(function (i) { return i.title; }), ['HDMI 1', 'HDMI 2', 'Game console', 'Live TV']);
      assert.ok(j.apps.every(function (a) { return a.id !== 'io.github.chiotas.lightkeeper' && !/hdmi/.test(a.id); })); next(); }); },
    function (next) { req('GET', '/icon?id=netflix', {}, function (st, j, h) { assert.equal(st, 200); assert.equal(h['content-type'], 'image/png'); next(); }); },
    function (next) { req('GET', '/icon?id=..%2F..%2Fetc', {}, function (st) { assert.equal(st, 400); next(); }); },
    function (next) { req('GET', '/backgrounds/index.json', {}, function (st, j) { assert.equal(st, 200); assert.equal(j[0].id, 'godrevy'); next(); }); },
    function (next) { req('GET', '/backgrounds/..%2Fappinfo.json', {}, function (st) { assert.equal(st, 404); next(); }); },
    function (next) { req('GET', '/backgrounds/thumbs/night.jpg', {}, function (st, j, h) { assert.equal(st, 200); assert.equal(h['content-type'], 'image/jpeg'); next(); }); },
    function (next) { req('POST', '/api/background', { headers: { 'Content-Type': 'image/jpeg' }, body: 'GIF89a not a jpeg' }, function (st) { assert.equal(st, 400); next(); }); },
    // A picture of yours: added, chosen at once, kept under its own id with a small copy.
    function (next) { req('POST', '/api/background', { headers: { 'Content-Type': 'image/jpeg' }, body: jpeg }, function (st, j) {
      assert.equal(st, 200); assert.ok(/^my-[0-9a-f]{8}$/.test(j.id), j.id);
      assert.deepEqual(j.config.background, { custom: true, id: j.id, rev: 1 }); assert.deepEqual(j.config.mine, [j.id]);
      mineA = j.id;
      req('POST', '/api/background/thumb?id=' + mineA, { headers: { 'Content-Type': 'image/jpeg' }, body: thumbJpeg }, function (st2) {
        assert.equal(st2, 200);
        req('GET', '/mine/' + mineA + '-thumb.jpg', {}, function (st3, j3, h3, raw3) {
          assert.equal(st3, 200); assert.equal(raw3.length, thumbJpeg.length);
          req('GET', '/background.jpg', {}, function (st4, j4, h4, raw4) { assert.equal(raw4.length, jpeg.length); next(); });
        });
      });
    }); },
    function (next) { req('POST', '/api/background/thumb?id=my-00000000', { headers: { 'Content-Type': 'image/jpeg' }, body: thumbJpeg }, function (st) { assert.equal(st, 404); next(); }); },
    function (next) { req('POST', '/api/background/thumb?id=' + mineA, { headers: { 'Content-Type': 'image/jpeg' }, body: jpeg }, function (st) { assert.equal(st, 400); next(); }); },
    // Choosing one of the app's backgrounds leaves the picture in the list; taking it away removes both files.
    function (next) { req('POST', '/api/config', json({ preset: 'night' }), function (st, j) {
      assert.equal(st, 200); assert.equal(j.config.preset, 'night'); assert.equal(j.config.background.custom, false);
      assert.deepEqual(j.config.mine, [mineA]); assert.ok(fs.existsSync(path.join(env.LIGHTKEEPER_DATA, 'backgrounds', mineA + '.jpg')));
      req('DELETE', '/api/background?id=' + mineA, {}, function (st2, j2) {
        assert.equal(st2, 200); assert.deepEqual(j2.config.mine, []); assert.equal(j2.config.preset, 'night');
        assert.deepEqual(fs.readdirSync(path.join(env.LIGHTKEEPER_DATA, 'backgrounds')), []);
        req('GET', '/mine/' + mineA + '.jpg', {}, function (st3) { assert.equal(st3, 404); next(); });
      });
    }); },
    // A random background for each time the TV is on: off, nothing changes.
    function (next) { req('GET', '/api/config', {}, function (st, j) { assert.equal(j.backgroundNow, null); assert.equal(j.preset, 'night'); next(); }); },
    function (next) {
      fs.writeFileSync(env.LIGHTKEEPER_SESSION, 's0\n');
      req('POST', '/api/config', json({ randomBackground: true }), function (st, j) {
        assert.equal(st, 200); assert.ok(BACKGROUNDS.indexOf(j.config.backgroundNow) !== -1, j.config.backgroundNow);
        var first = j.config.backgroundNow, seen = [first];
        req('GET', '/api/config', {}, function (st2, j2) {
          assert.equal(j2.backgroundNow, first, 'the same while the TV stays on');
          (function next1(n) {
            if (n === 12) { assert.ok(seen.length > 3); return next(); }
            fs.writeFileSync(env.LIGHTKEEPER_SESSION, 's' + (n + 1) + '\n');
            req('GET', '/api/config', {}, function (st3, j3) {
              assert.notEqual(j3.backgroundNow, seen[seen.length - 1], 'never twice in a row');
              assert.equal(JSON.parse(fs.readFileSync(path.join(env.LIGHTKEEPER_DATA, 'background-session.json'), 'utf8')).now, j3.backgroundNow);
              seen.push(j3.backgroundNow);
              next1(n + 1);
            });
          })(0);
        });
      });
    },
    // Two ticked: one, then the other; one or none ticked: the chosen background, as when off.
    function (next) {
      req('POST', '/api/config', json({ backgroundPool: ['night', 'dawn'] }), function (st, j) {
        var a = j.config.backgroundNow;
        assert.ok(a === 'night' || a === 'dawn', a);
        fs.writeFileSync(env.LIGHTKEEPER_SESSION, 'pair\n');
        req('GET', '/api/config', {}, function (st2, j2) {
          assert.equal(j2.backgroundNow, a === 'night' ? 'dawn' : 'night');
          req('POST', '/api/config', json({ backgroundPool: ['night'] }), function (st3, j3) {
            assert.equal(j3.config.backgroundNow, null);
            req('POST', '/api/config', json({ backgroundPool: [] }), function (st4, j4) {
              assert.equal(j4.config.backgroundNow, null);
              req('POST', '/api/config', json({ backgroundPool: null, randomBackground: false }), function (st5, j5) {
                assert.equal(j5.config.backgroundNow, null); assert.equal(j5.config.preset, 'night'); next();
              });
            });
          });
        });
      });
    },
    // Short of space: refused, nothing written, and the page told how much is kept free.
    function (next) {
      fs.writeFileSync(path.join(tmp, 'df-free'), String(64 * 1024 + 100)); // 100 KB over the margin
      upload('godrevy.jpg', function (st, j) {
        assert.equal(st, 507); assert.equal(j.error, 'space'); assert.equal(j.keepFree, 64 * 1024 * 1024);
        assert.deepEqual(fs.readdirSync(path.join(env.LIGHTKEEPER_DATA, 'backgrounds')), []);
        fs.writeFileSync(path.join(tmp, 'df-free'), '10485760');
        next();
      });
    },
    // Three pictures, no limit on how many: each chosen as it comes; any can be chosen again; sizes and free space listed.
    function (next) {
      (function more(files) {
        if (!files.length) return next();
        upload(files[0], function (st, j) {
          assert.equal(st, 200); mine3.push(j.id);
          assert.deepEqual(j.config.mine, mine3); assert.equal(j.config.background.id, j.id);
          more(files.slice(1));
        });
      })(['godrevy.jpg', 'night.jpg', 'dawn.jpg']);
    },
    function (next) { req('GET', '/api/backgrounds', {}, function (st, j) {
      assert.equal(st, 200); assert.deepEqual(j.mine.map(function (m) { return m.id; }), mine3);
      assert.deepEqual(j.mine.map(function (m) { return m.bytes; }), ['godrevy.jpg', 'night.jpg', 'dawn.jpg'].map(function (f) {
        return fs.statSync(path.join(__dirname, '..', 'app', 'backgrounds', f)).size; }));
      assert.equal(j.free, 10485760 * 1024); next(); }); },
    function (next) { req('POST', '/api/config', json({ preset: mine3[1] }), function (st, j) {
      assert.equal(st, 200); assert.equal(j.config.background.id, mine3[1]); assert.equal(j.config.preset, 'night');
      req('GET', '/background.jpg', {}, function (st2, j2, h2, raw) {
        assert.equal(raw.length, fs.statSync(path.join(__dirname, '..', 'app', 'backgrounds', 'night.jpg')).size);
        req('POST', '/api/config', json({ preset: 'my-00000000' }), function (st3) { assert.equal(st3, 400); next(); });
      });
    }); },
    // The random pick with pictures of yours: two ticked alternate; one taken away leaves too few.
    function (next) { req('POST', '/api/config', json({ randomBackground: true, backgroundPool: [mine3[0], mine3[2]] }), function (st, j) {
      assert.equal(st, 200);
      var a = j.config.backgroundNow;
      assert.ok(a === mine3[0] || a === mine3[2], a);
      fs.writeFileSync(env.LIGHTKEEPER_SESSION, 'mine\n');
      req('GET', '/api/config', {}, function (st2, j2) {
        assert.equal(j2.backgroundNow, a === mine3[0] ? mine3[2] : mine3[0]);
        req('GET', '/mine/' + j2.backgroundNow + '.jpg', {}, function (st3) {
          assert.equal(st3, 200);
          req('DELETE', '/api/background?id=' + mine3[2], {}, function (st4, j4) {
            assert.deepEqual(j4.config.backgroundPool, [mine3[0]]); assert.equal(j4.config.backgroundNow, null);
            assert.deepEqual(j4.config.mine, [mine3[0], mine3[1]]); assert.equal(j4.config.background.id, mine3[1], 'the chosen one stays');
            req('POST', '/api/config', json({ randomBackground: false, backgroundPool: null }), function () { next(); });
          });
        });
      });
    }); },
    // Open apps: off by default, and then the TV is not even asked.
    // Logos of yours: only a PNG with transparency up to 2000 × 240, under a name the server picks.
    function (next) { req('POST', '/api/logo', png(jpeg), function (st) { assert.equal(st, 400); next(); }); },
    function (next) { req('POST', '/api/logo', { headers: { 'Content-Type': 'application/json' }, body: logoPng }, function (st) { assert.equal(st, 415); next(); }); },
    function (next) { req('POST', '/api/logo', png(logoPng.slice(0, logoPng.length - 12)), function (st) { assert.equal(st, 400); next(); }); }, // no IEND
    function (next) { req('POST', '/api/logo', png(pngWith(20, 241)), function (st) { assert.equal(st, 400); next(); }); }, // 241 tall
    function (next) { req('POST', '/api/logo', png(pngWith(16, 2001)), function (st) { assert.equal(st, 400); next(); }); }, // 2001 wide
    function (next) { var b = pngWith(16, 647); b[25] = 2; req('POST', '/api/logo', png(b), function (st) { assert.equal(st, 400); next(); }); }, // no alpha
    function (next) { var big = Buffer.concat([logoPng, Buffer.alloc ? Buffer.alloc(1024 * 1024) : new Buffer(1024 * 1024)]);
      req('POST', '/api/logo', png(big), function (st) { assert.equal(st, 413); next(); }); },
    function (next) { req('POST', '/api/config', json({ myLogos: { 'up-00000000': [10, 10] } }), function (st, j) { assert.equal(st, 400); assert.equal(j.error, 'invalid: myLogos'); next(); }); },
    function (next) { req('POST', '/api/logo', png(logoPng), function (st, j) {
      assert.equal(st, 200); assert.ok(/^up-[0-9a-f]{8}$/.test(j.id), j.id);
      assert.deepEqual(j.config.myLogos, (function () { var o = {}; o[j.id] = [647, 236]; return o; })());
      logoA = j.id;
      assert.deepEqual(fs.readdirSync(path.join(env.LIGHTKEEPER_DATA, 'logos')), [logoA + '.png']);
      req('GET', '/mylogos/' + logoA + '.png', {}, function (st2, j2, h2, raw2) {
        assert.equal(st2, 200); assert.equal(h2['content-type'], 'image/png'); assert.equal(raw2.length, logoPng.length);
        req('GET', '/mylogos/..%2Fconfig.json', {}, function (st3) { assert.equal(st3, 404); next(); });
      }); }); },
    // Chosen for a tile, an input too; an id it does not have is refused.
    function (next) { req('GET', '/api/config', {}, function (st, j) {
      var tiles = j.tiles.slice(0, 2).concat([{ id: 'com.webos.app.hdmi1', title: 'HDMI 1' }]);
      tiles[0].logo = logoA; tiles[2].logo = logoA;
      req('POST', '/api/config', json({ tiles: [{ id: 'netflix', title: 'Netflix', logo: 'up-00000000' }] }), function (st2) {
        assert.equal(st2, 400);
        req('POST', '/api/config', json({ tiles: tiles }), function (st3, j3) {
          assert.equal(st3, 200); assert.equal(j3.config.tiles[0].logo, logoA); assert.equal(j3.config.tiles[2].logo, logoA); next();
        });
      }); }); },
    // Taken away: the tiles go back to their own logo, and the file is gone.
    function (next) { req('DELETE', '/api/logo?id=bad', {}, function (st) { assert.equal(st, 400); next(); }); },
    function (next) { req('DELETE', '/api/logo?id=' + logoA, {}, function (st, j) {
      assert.equal(st, 200); assert.deepEqual(j.config.myLogos, {});
      assert.ok(j.config.tiles.every(function (t) { return t.logo === undefined; }));
      assert.deepEqual(fs.readdirSync(path.join(env.LIGHTKEEPER_DATA, 'logos')), []);
      req('GET', '/mylogos/' + logoA + '.png', {}, function (st2) { assert.equal(st2, 404); next(); }); }); },
    function (next) {
      fs.writeFileSync(RUNNING, 'netflix\n');
      req('GET', '/api/open', { headers: { Origin: 'null' } }, function (st, j) {
        assert.equal(st, 200); assert.deepEqual(j.apps, []);
        assert.ok(!/applicationManager\/running/.test(fs.readFileSync(path.join(FAKE, 'calls.log'), 'utf8')), 'running not asked');
        var o = json({ all: true }); o.headers.Origin = 'null';
        req('POST', '/api/close', o, function (st2) { assert.equal(st2, 409); next(); });
      });
    },
    function (next) { req('POST', '/api/config', json({ openApps: 'yes' }), function (st, j) { assert.equal(st, 400); assert.equal(j.error, 'invalid: openApps'); next(); }); },
    function (next) { req('POST', '/api/config', json({ openApps: true }), function (st, j) { assert.equal(st, 200); assert.equal(j.config.openApps, true); next(); }); },
    // On, from the Home's file:// page.
    function (next) {
      fs.writeFileSync(RUNNING, 'netflix\ncom.webos.app.home\nio.github.chiotas.lightkeeper\ncom.webos.app.hdmi1\nyoutube.leanback.v4\n');
      req('GET', '/api/open', { headers: { Origin: 'null' } }, function (st, j, h) {
        assert.equal(st, 200); assert.equal(h['access-control-allow-origin'], 'null');
        assert.deepEqual(j.apps.map(function (a) { return a.id; }), ['netflix', 'youtube.leanback.v4']); next(); }); },
    function (next) { req('GET', '/api/open', { headers: { Origin: 'http://evil.example' } }, function (st) { assert.equal(st, 403); next(); }); },
    function (next) { req('OPTIONS', '/api/close', { headers: { Origin: 'null', 'Access-Control-Request-Method': 'POST' } }, function (st, j, h) {
      assert.equal(st, 204); assert.equal(h['access-control-allow-origin'], 'null'); assert.equal(h['access-control-allow-headers'], 'Content-Type'); next(); }); },
    function (next) { req('POST', '/api/close', { headers: { Origin: 'null', 'Content-Type': 'text/plain' }, body: '{"all":true}' }, function (st) { assert.equal(st, 415); next(); }); },
    function (next) { var o = json({ id: 'com.webos.app.hdmi1' }); o.headers.Origin = 'null'; req('POST', '/api/close', o, function (st, j) {
      assert.equal(st, 200); assert.deepEqual(j.closed, []); assert.equal(j.apps.length, 2); next(); }); },
    function (next) { var o = json({ id: 'netflix' }); o.headers.Origin = 'null'; req('POST', '/api/close', o, function (st, j) {
      assert.deepEqual(j.closed, ['netflix']); assert.deepEqual(j.apps.map(function (a) { return a.id; }), ['youtube.leanback.v4']); next(); }); },
    function (next) { var o = json({ all: true }); o.headers.Origin = 'null'; req('POST', '/api/close', o, function (st, j) {
      assert.deepEqual(j.closed, ['youtube.leanback.v4']); assert.deepEqual(j.apps, []);
      var calls = fs.readFileSync(path.join(FAKE, 'calls.log'), 'utf8').split('\n').filter(function (l) { return /closeByAppId/.test(l); });
      assert.deepEqual(calls, ['luna://com.webos.applicationManager/closeByAppId {"id":"netflix"}', 'luna://com.webos.applicationManager/closeByAppId {"id":"youtube.leanback.v4"}']);
      assert.equal(fs.readFileSync(RUNNING, 'utf8'), 'com.webos.app.home\nio.github.chiotas.lightkeeper\ncom.webos.app.hdmi1\n');
      fs.unlinkSync(RUNNING);
      next(); }); },
    function (next) { req('POST', '/api/pin', json({ pin: '12' }), function (st) { assert.equal(st, 400); next(); }); },
    function (next) { req('POST', '/api/pin', json({ pin: '2468' }), function (st) { assert.equal(st, 200); next(); }); },
    function (next) { req('GET', '/api/tv', {}, function (st) { assert.equal(st, 401); next(); }); },
    function (next) { req('GET', '/api/tv', { headers: { 'X-Lightkeeper-Pin': '2468' } }, function (st) { assert.equal(st, 200); next(); }); },
    function (next) {
      var n = 0;
      (function wrong() {
        req('GET', '/api/tv', { headers: { 'X-Lightkeeper-Pin': '0000' } }, function (st, j) {
          if (++n < 5) return wrong();
          req('GET', '/api/tv', { headers: { 'X-Lightkeeper-Pin': '2468' } }, function (st2, j2) {
            assert.equal(st2, 401); assert.equal(j2.error, 'locked'); next(); // even the right PIN waits a minute
          });
        });
      })();
    },
    function (next) {
      var saved = JSON.parse(fs.readFileSync(path.join(env.LIGHTKEEPER_DATA, 'config.json'), 'utf8'));
      assert.ok(/^[0-9a-f]{64}$/.test(saved.pin.hash) && JSON.stringify(saved).indexOf('2468') === -1, 'the PIN is kept hashed');
      next();
    },
    // The Home has no PIN: its open apps answer even while the page is locked.
    function (next) { req('GET', '/api/open', { headers: { Origin: 'null' } }, function (st, j) { assert.equal(st, 200); assert.deepEqual(j.apps, []); next(); }); }
  ];
  function run(i) {
    if (i === steps.length) {
      child.removeAllListeners('exit');
      child.kill();
      return portChecks(function () { updateChecks(function () { migrationChecks(function () { console.log('check: all good'); }); }); });
    }
    steps[i](function () { run(i + 1); });
  }
  child.on('exit', function (code) { if (code) { console.error('server exited ' + code); process.exit(1); } });
  setTimeout(function () { run(0); }, 700); // a moment to start listening
}

// Another program on the port: the server takes the next one and says so, moves
// when asked, refuses a port in use, and --port sets the next start's.
function portChecks(done) {
  var server = path.join(__dirname, '..', 'app', 'service', 'server.js');
  var penv = {};
  Object.keys(process.env).forEach(function (k) { penv[k] = process.env[k]; });
  penv.LIGHTKEEPER_PORT = '18190';
  penv.LIGHTKEEPER_DATA = path.join(tmp, 'data-port');
  penv.LIGHTKEEPER_PORT_FILE = path.join(tmp, 'port-2');
  var blocker = http.createServer().listen(18190, '0.0.0.0', function () {
    var out = '';
    var child = spawn(process.execPath, [server], { env: penv });
    child.stdout.on('data', function (d) { out += d; });
    child.on('exit', function (code) { if (code) { console.error('server exited ' + code + '\n' + out); process.exit(1); } });
    (function wait(n) {
      if (!fs.existsSync(penv.LIGHTKEEPER_PORT_FILE) && n) return setTimeout(function () { wait(n - 1); }, 100);
      assert.equal(fs.readFileSync(penv.LIGHTKEEPER_PORT_FILE, 'utf8').trim(), '18191');
      assert.ok(out.indexOf('on port 18191, as another program has port 18190') !== -1, out);
      req('GET', '/api/config', { port: 18191 }, function (st, j) {
        assert.equal(st, 200); assert.equal(j.port, 18191); assert.equal(j.portTaken, 18190);
        req('POST', '/api/config', { port: 18191, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ port: 18190 }) }, function (st2, j2) {
          assert.equal(st2, 409); assert.ok(/in use/.test(j2.error));
          req('POST', '/api/config', { port: 18191, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ port: 18195 }) }, function (st3, j3) {
            assert.equal(st3, 200); assert.equal(j3.config.port, 18195); assert.equal(j3.config.portTaken, 0);
            assert.equal(fs.readFileSync(penv.LIGHTKEEPER_PORT_FILE, 'utf8').trim(), '18195');
            assert.equal(JSON.parse(fs.readFileSync(path.join(penv.LIGHTKEEPER_DATA, 'config.json'), 'utf8')).port, 18195);
            req('GET', '/api/config', { port: 18195 }, function (st4) {
              assert.equal(st4, 200);
              req('GET', '/api/config', { port: 18191 }, function (st5) {
                assert.equal(st5, 200); // the old port, for a minute
                req('POST', '/api/config', { port: 18195, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ port: 18191 }) }, function (st6, j6) {
                assert.equal(st6, 200, 'back to the port just left'); assert.equal(j6.config.port, 18191);
                child.removeAllListeners('exit');
                child.kill();
                blocker.close();
                var bad = spawn(process.execPath, [server, '--port', '80'], { env: penv });
                bad.on('exit', function (code) {
                  assert.equal(code, 2);
                  spawn(process.execPath, [server, '--port', '18196'], { env: penv }).on('exit', function (code2) {
                    assert.equal(code2, 0);
                    assert.equal(JSON.parse(fs.readFileSync(path.join(penv.LIGHTKEEPER_DATA, 'config.json'), 'utf8')).port, 18196);
                    done();
                  });
                });
                });
              });
            });
          });
        });
      });
    })(40);
  });
}

// The update, end to end against a manifest and a package served as files: a manifest
// that cannot be read, no downgrade, a package whose sha256 does not match (nothing is
// installed), then the right one, handed to the updater with its version.
function updateChecks(done) {
  var server = path.join(__dirname, '..', 'app', 'service', 'server.js');
  var dir = path.join(tmp, 'release'), data = path.join(tmp, 'data-update'), work = path.join(tmp, 'update-work');
  [dir, data, work].forEach(function (d) { fs.mkdirSync(d); });
  var marker = path.join(tmp, 'updater-ran');
  var updater = path.join(tmp, 'fake-updater.sh');
  fs.writeFileSync(updater, 'echo "$1 $2" > ' + marker + '\n');
  var ipk = path.join(dir, 'io.github.chiotas.lightkeeper_99.0.0_all.ipk');
  fs.writeFileSync(ipk, 'a package');
  var sha = require('crypto').createHash('sha256').update('a package').digest('hex');
  var manifestFile = path.join(dir, 'lightkeeper.manifest.json');
  function manifest(o) { fs.writeFileSync(manifestFile, typeof o === 'string' ? o : JSON.stringify(o)); }
  var good = { version: '99.0.0', ipkUrl: 'file://' + ipk, ipkHash: { sha256: sha }, ipkSize: 9 };
  fs.writeFileSync(path.join(data, 'update-test.json'), JSON.stringify({ manifest: 'file://' + manifestFile }));
  var uenv = {};
  Object.keys(process.env).forEach(function (k) { uenv[k] = process.env[k]; });
  uenv.LIGHTKEEPER_PORT = '18390';
  uenv.LIGHTKEEPER_DATA = data;
  uenv.LIGHTKEEPER_PORT_FILE = path.join(tmp, 'port-3');
  uenv.LIGHTKEEPER_UPDATE_DIR = work;
  uenv.LIGHTKEEPER_UPDATER = updater;
  uenv.LIGHTKEEPER_CURL = '/usr/bin/curl';
  var post = { port: 18390, headers: { 'Content-Type': 'application/json' }, body: '{}' };
  manifest('<html>not a manifest</html>');
  var child = spawn(process.execPath, [server], { env: uenv });
  child.on('exit', function (code) { if (code) { console.error('update server exited ' + code); process.exit(1); } });
  setTimeout(function () {
    req('GET', '/api/update', { port: 18390 }, function (st, j) {
      assert.equal(st, 200); assert.equal(j.test, true); assert.equal(j.available, false); assert.ok(/not readable/.test(j.error), j.error);
      manifest({ version: '0.0.1', ipkUrl: 'file://' + ipk, ipkHash: { sha256: sha }, ipkSize: 9 });
      req('POST', '/api/update', post, function (st2, j2) {
        assert.equal(st2, 409); assert.ok(/already the latest/.test(j2.error), j2.error);
        manifest({ version: '99.0.0', ipkUrl: 'file://' + ipk, ipkHash: { sha256: new Array(65).join('c') }, ipkSize: 9 });
        req('POST', '/api/update', post, function (st3, j3) {
          assert.equal(st3, 409); assert.ok(/sha256/.test(j3.error), j3.error);
          assert.ok(!fs.existsSync(marker), 'nothing installed');
          assert.equal(JSON.parse(fs.readFileSync(path.join(data, 'update.json'), 'utf8')).state, 'failed');
          manifest(good);
          req('POST', '/api/update', post, function (st4, j4) {
            assert.equal(st4, 200); assert.equal(j4.installing, '99.0.0');
            setTimeout(function () {
              assert.equal(fs.readFileSync(marker, 'utf8').trim(), path.join(work, 'lightkeeper-update.ipk') + ' 99.0.0');
              assert.equal(fs.readFileSync(path.join(work, 'lightkeeper-update.ipk'), 'utf8'), 'a package');
              req('GET', '/api/update', { port: 18390 }, function (st5, j5) {
                assert.equal(j5.status.state, 'installing'); assert.equal(j5.status.version, '99.0.0');
                // Another manifest to read: not the one kept from before.
                var other = path.join(dir, 'other.manifest.json');
                fs.writeFileSync(other, JSON.stringify({ version: '98.0.0', ipkUrl: 'file://' + ipk, ipkHash: { sha256: sha }, ipkSize: 9 }));
                fs.writeFileSync(path.join(data, 'update-test.json'), JSON.stringify({ manifest: 'file://' + other }));
                req('GET', '/api/update', { port: 18390 }, function (st6, j6) {
                  assert.equal(j6.latest, '98.0.0');
                  // A web page tile saved with its address.
                  var tiles = { tiles: [{ id: 'web.k3x9', title: 'Meteo', url: 'https://www.meteo.it/' }] };
                  req('POST', '/api/config', { port: 18390, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tiles) }, function (st7) {
                  assert.equal(st7, 200);
                  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(data, 'config.json'), 'utf8')).tiles, tiles.tiles);
                  child.removeAllListeners('exit');
                  child.kill();
                  done();
                  });
                });
              });
            }, 500);
          });
        });
      });
    });
  }, 700);
}

// 1.0.7's one picture, background.jpg, chosen: at start it becomes the first of the
// list, still chosen, the same bytes under /background.jpg, the old file gone.
function migrationChecks(done) {
  var server = path.join(__dirname, '..', 'app', 'service', 'server.js');
  var data = path.join(tmp, 'data-migration');
  fs.mkdirSync(data);
  fs.writeFileSync(path.join(data, 'background.jpg'), jpeg);
  fs.writeFileSync(path.join(data, 'config.json'), JSON.stringify({ preset: 'night', background: { custom: true, rev: 3 }, tiles: [] }, null, 2));
  var menv = {};
  Object.keys(process.env).forEach(function (k) { menv[k] = process.env[k]; });
  menv.LIGHTKEEPER_PORT = '18490';
  menv.LIGHTKEEPER_DATA = data;
  menv.LIGHTKEEPER_PORT_FILE = path.join(tmp, 'port-4');
  var child = spawn(process.execPath, [server], { env: menv });
  child.on('exit', function (code) { if (code) { console.error('migration server exited ' + code); process.exit(1); } });
  setTimeout(function () {
    req('GET', '/api/config', { port: 18490 }, function (st, j) {
      assert.equal(st, 200);
      assert.equal(j.mine.length, 1); assert.ok(/^my-[0-9a-f]{8}$/.test(j.mine[0]));
      assert.deepEqual(j.background, { custom: true, id: j.mine[0], rev: 3 }); assert.equal(j.preset, 'night');
      assert.ok(!fs.existsSync(path.join(data, 'background.jpg')));
      assert.deepEqual(fs.readFileSync(path.join(data, 'backgrounds', j.mine[0] + '.jpg')), jpeg);
      req('GET', '/background.jpg', { port: 18490 }, function (st2, j2, h2, raw) {
        assert.deepEqual(raw, jpeg);
        child.removeAllListeners('exit');
        child.kill();
        done();
      });
    });
  }, 700);
}

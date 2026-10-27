/*
 * Lightkeeper settings server.
 *
 * Serves the settings page and the config the Home reads, on port 8090 or the
 * one chosen in the settings, to the TV itself and its local network only.
 * Started and kept running by the boot hook (lightkeeper-init). It runs no
 * command it is sent: the only programs it starts are luna-send, with calls
 * written here, GlassHouse's tvwebctl, curl for the newest release's manifest
 * and package, and update.sh to install that package.
 *
 *   node server.js              serve
 *   node server.js --uninstall  put the remote keys back, remove the hook,
 *                               the settings and the app
 *   node server.js --port 8091  the port from the next start, for when the
 *                               settings page cannot be opened
 *
 * Strict ES5: it runs on the TV's own node, which is 0.12 on webOS 4.
 */
'use strict';
var http = require('http');
var fs = require('fs');
var path = require('path');
var os = require('os');
var net = require('net');
var crypto = require('crypto');
var vm = require('vm');
var execFile = require('child_process').execFile;
var spawn = require('child_process').spawn;

var VERSION = '1.0.9';
var APP_ID = 'io.github.chiotas.lightkeeper';
var HERE = __dirname;
var APP_DIR = path.dirname(HERE);
// Each path can be moved by an environment variable, which only the tests set.
var DATA = process.env.LIGHTKEEPER_DATA || '/var/lib/lightkeeper';
var TVWEB = process.env.LIGHTKEEPER_TVWEB || '/var/lib/tvweb';
var HOOK = process.env.LIGHTKEEPER_HOOK || '/var/lib/webosbrew/init.d/60-lightkeeper';
var LUNA_SEND = process.env.LIGHTKEEPER_LUNA_SEND || '/usr/bin/luna-send';
var KEY_FILTERS = process.env.LIGHTKEEPER_KEY_FILTERS || '/usr/lib/qt5/qml/KeyFilters';
// The port in use, for the Home to find when it is not where it was.
var PORT_FILE = process.env.LIGHTKEEPER_PORT_FILE || '/tmp/lightkeeper.port';
var DEFAULT_PORT = +process.env.LIGHTKEEPER_PORT || 8090;
var CONFIG = path.join(DATA, 'config.json');
// The pictures uploaded, as <id>.jpg, each with <id>-thumb.jpg for the settings page.
// Up to 1.0.7 there was one, background.jpg, moved into the list at start (migrate).
var MINE = path.join(DATA, 'backgrounds');
var MINE_ID = /^my-[0-9a-f]{8}$/;
// Left free where DATA is after a picture is saved, for what else the TV keeps there,
// its database, logs and settings. On a C1 with webOS 6.5.3 (26/10) /var/lib/lightkeeper
// is on an overlay of 739536 KB, 391944 KB free: 64 MB keeps 9% of it, and leaves about
// 319 MB for pictures. Lightkeeper's own updates download to /tmp, not here. Where LG
// downloads its firmware has not been checked. MB are 1024 × 1024 bytes, here and in
// the settings page.
var MIN_FREE = 64 * 1024 * 1024;
var DF = process.env.LIGHTKEEPER_DF || 'df';
var MAX_THUMB = 512 * 1024;
// The logos uploaded for tiles, as <id>.png: white on transparency, at most 2000 × 240,
// trimmed and sized by the settings page. Kept beside the config, so a new install keeps them.
var MY_LOGOS = path.join(DATA, 'logos');
var LOGO_ID = /^up-[0-9a-f]{8}$/;
var MAX_LOGO = 1024 * 1024;
var MAX_LOGOS = 50;
// A new mark each time the TV comes on, written by the boot hook; the background picked for it.
var SESSION_FILE = process.env.LIGHTKEEPER_SESSION || '/tmp/lightkeeper.session';
var BG_SESSION = path.join(DATA, 'background-session.json');
// The backgrounds the app carries, by id, from backgrounds/index.json.
var PRESETS = (function () {
  try { return JSON.parse(fs.readFileSync(path.join(APP_DIR, 'backgrounds', 'index.json'), 'utf8')).map(function (b) { return b.id; }); }
  catch (e) { return ['godrevy']; }
})();

var MAX_JSON = 64 * 1024;
// When this server started: the Home asks again for what failed while it was down.
var STARTED = Date.now();
var MAX_IMAGE = 12 * 1024 * 1024;
// A ceiling against absurd configs; the Home loads icons only as they come into view.
var MAX_TILES = 50;

// GlassHouse's key filter (lib/remotekeys.js): what each key opens is the
// configd value glasshouse.remoteKeys, kept in remotekeys.json beside it.
var REMOTE_KEYS = path.join(TVWEB, 'remotekeys.json');
var REMOTE_KEYS_VALUE = 'glasshouse.remoteKeys';
var FILTER_FILE = path.join(TVWEB, 'remotekeys-filter.js');
var CHAIN = 'com.webos.surfacemanager.keyFilters';
// The keys GlassHouse's JavaScript filter can change, offered where this TV's
// own filter files name them. Home is GlassHouse's `home` entry.
var KEYS = [
  { key: 'netflix', symbol: 'Key_webOS_Netflix', title: 'Netflix' },
  { key: 'amazon', symbol: 'Key_webOS_Amazon', title: 'Prime Video' },
  { key: 'disneyplus', symbol: 'Key_webOS_Disneyplus', title: 'Disney+' },
  { key: 'lgchannels', symbol: 'Key_webOS_LGChannels', title: 'LG Channels' },
  { key: 'rakutentv', symbol: 'Key_webOS_RakutenTV', title: 'Rakuten TV' },
  { key: 'apps', symbol: 'Key_webOS_Apps', title: 'Apps' },
  { key: 'guide', symbol: 'Key_webOS_TVGuide', title: 'Guide' },
  { key: 'input', symbol: 'Key_webOS_InputSource', title: 'Input' },
  { key: 'livetv', symbol: 'Key_webOS_InputTV', title: 'TV' },
  { key: 'info', symbol: 'Key_webOS_Info', title: 'Info' },
  { key: 'red', symbol: 'Key_webOS_Red', title: 'Red' },
  { key: 'green', symbol: 'Key_webOS_Green', title: 'Green' },
  { key: 'yellow', symbol: 'Key_webOS_Yellow', title: 'Yellow' },
  { key: 'blue', symbol: 'Key_webOS_Blue', title: 'Blue' }
];

// The tiles a first start picks, those of them this TV has, in this order.
var USUAL_APPS = ['netflix', 'amazon', 'youtube.leanback.v4', 'com.disney.disneyplus-prod',
  'cdp-30', 'spotify-beehive', 'com.apple.appletv'];

// The clock's typefaces and sizes; thin and medium are how it has always looked.
var CLOCK_STYLES = ['thin', 'classic', 'bold', 'mono', 'rounded', 'digital'];
var CLOCK_SIZES = ['small', 'medium', 'large'];

var DEFAULTS = {
  clock: '24',
  clockStyle: 'thin',
  clockSize: 'medium',
  clockSide: 'left',
  units: 'c',
  weather: null,
  tiles: null,
  tileStyle: 'text',
  labels: 'all',
  // Two rows, off as before 1.0.10; the break is kept when they are turned off.
  twoRows: false,
  rowBreak: null,
  openApps: false,
  startTile: 'last',
  hideGear: false,
  preset: 'godrevy',
  background: { custom: false, rev: 0 },
  mine: [],
  // The logos uploaded, by id: [width, height].
  myLogos: {},
  randomBackground: false,
  backgroundPool: null,
  veil: 80,
  key: 'home',
  openAtPowerOn: true,
  port: DEFAULT_PORT,
  pin: null
};

/* ---------- small helpers ---------- */

function log(text) { console.log(new Date().toISOString() + ' ' + text); }

function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

function copy(v) { return JSON.parse(JSON.stringify(v)); }

// Written beside and renamed into place, so a power cut never leaves half a file.
function writeAtomic(file, data, mode) {
  var tmp = file + '.tmp';
  fs.writeFileSync(tmp, data, { mode: mode || 384 });
  fs.renameSync(tmp, file);
}

function rmrf(p) {
  var st;
  try { st = fs.lstatSync(p); } catch (e) { return; }
  if (st.isDirectory()) {
    fs.readdirSync(p).forEach(function (f) { rmrf(path.join(p, f)); });
    fs.rmdirSync(p);
  } else {
    fs.unlinkSync(p);
  }
}

/* ---------- luna ---------- */

// One call at a time: node 0.12 has frozen with several luna-send children
// starting together (GlassHouse, lib/luna.js). cb(reply) with null on failure.
var lunaQueue = [];
function luna(uri, params, cb) {
  lunaQueue.push({ uri: uri, params: params, cb: cb || function () {}, retried: false });
  if (lunaQueue.length === 1) lunaNext();
}

function lunaNext() {
  var job = lunaQueue[0];
  if (!job) return;
  execFile(LUNA_SEND, ['-n', '1', '-w', '8000', 'luna://' + job.uri, JSON.stringify(job.params)],
    { timeout: 10000, maxBuffer: 4 * 1024 * 1024 }, function (err, stdout) {
      // A child killed by a signal nobody sent died before reaching luna-send
      // (seen with node 8 on webOS 6.5): safe to run once more.
      if (err && err.signal && !err.killed && !job.retried) {
        job.retried = true;
        return lunaNext();
      }
      lunaQueue.shift();
      var r = null;
      try { r = JSON.parse(String(stdout)); } catch (e) {}
      lunaNext();
      job.cb(r && r.returnValue !== false ? r : null);
    });
}

/* ---------- config ---------- */

var config = null;

function loadConfig() {
  var c = copy(DEFAULTS);
  try {
    var saved = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
    Object.keys(DEFAULTS).forEach(function (k) { if (has(saved, k)) c[k] = saved[k]; });
  } catch (e) {}
  if (typeof validate({ port: c.port }, []) === 'string') c.port = DEFAULT_PORT; // edited by hand
  return c;
}

// Pretty-printed: the boot hook reads "openAtPowerOn": true and "key": "home" with grep.
function saveConfig() {
  if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, 448);
  writeAtomic(CONFIG, JSON.stringify(config, null, 2) + '\n');
}

// What the Home and the page see: everything but the PIN.
function publicConfig() {
  var c = copy(config);
  delete c.pin;
  c.pinSet = !!config.pin;
  c.version = VERSION;
  c.address = lanAddress();
  c.port = PORT;
  c.portTaken = portTaken;
  c.saverPausedUntil = saverUntil > Date.now() ? saverUntil : 0;
  c.started = STARTED;
  c.backgroundNow = sessionBackground();
  return c;
}

/*
 * A background for each time the TV comes on, at random among those ticked: kept until
 * the TV goes off and on again, and never the one of the time before. The boot hook
 * writes a new mark in SESSION_FILE then, and at a cold start; an update of the app
 * keeps it. Null when off, or with fewer than two to pick from: the Home shows the chosen one.
 */
function bgPool() {
  var all = PRESETS.concat(mineIds());
  return config.backgroundPool ? all.filter(function (b) { return config.backgroundPool.indexOf(b) !== -1; }) : all;
}

/* ---------- the pictures uploaded ---------- */

function minePath(id, thumb) { return path.join(MINE, id + (thumb ? '-thumb' : '') + '.jpg'); }

// Those in the list that are there, in the order they came.
function mineIds() {
  return ((config && config.mine) || []).filter(function (id) { return MINE_ID.test(id) && fs.existsSync(minePath(id)); });
}

function newMineId() {
  var id;
  do { id = 'my-' + crypto.randomBytes(4).toString('hex'); } while (fs.existsSync(minePath(id)));
  return id;
}

// The background chosen: an uploaded picture while it is there, else one the app carries.
function chosenFile() {
  var b = config.background;
  if (b.custom && MINE_ID.test(b.id || '') && fs.existsSync(minePath(b.id))) return minePath(b.id);
  return path.join(APP_DIR, 'backgrounds', (PRESETS.indexOf(config.preset) !== -1 ? config.preset : PRESETS[0]) + '.jpg');
}

// Up to 1.0.7, one picture as background.jpg: now the first of the list, chosen as it was.
function migrate() {
  var old = path.join(DATA, 'background.jpg');
  if (!fs.existsSync(old)) return;
  if (!fs.existsSync(MINE)) fs.mkdirSync(MINE, 448);
  var id = newMineId();
  fs.renameSync(old, minePath(id));
  config.mine = [id].concat(config.mine || []);
  if (config.background.custom) config.background = { custom: true, id: id, rev: config.background.rev || 0 };
  saveConfig();
  log('background.jpg is now backgrounds/' + id + '.jpg');
}

// Bytes free where DATA is, from df: node has no statfs before 18. cb(null) when it cannot tell.
function freeSpace(cb) {
  var dir = DATA;
  while (!fs.existsSync(dir) && path.dirname(dir) !== dir) dir = path.dirname(dir);
  execFile(DF, ['-k', dir], { timeout: 5000 }, function (err, out) {
    // After the header, wrapped or not: filesystem, size, used, available.
    var w = String(out || '').split('\n').slice(1).join(' ').trim().split(/\s+/), kb = parseInt(w[3], 10);
    cb(!err && kb >= 0 ? kb * 1024 : null);
  });
}

function mineSizes() {
  return mineIds().map(function (id) {
    var n = 0;
    [false, true].forEach(function (t) { try { n += fs.statSync(minePath(id, t)).size; } catch (e) {} });
    return { id: id, bytes: n };
  });
}

/* ---------- the logos uploaded ---------- */

function logoPath(id) { return path.join(MY_LOGOS, id + '.png'); }

// Those in the config that are there.
function myLogos() {
  var all = (config && config.myLogos) || {}, out = {};
  Object.keys(all).forEach(function (id) { if (LOGO_ID.test(id) && fs.existsSync(logoPath(id))) out[id] = all[id]; });
  return out;
}

function newLogoId() {
  var id;
  do { id = 'up-' + crypto.randomBytes(4).toString('hex'); } while (fs.existsSync(logoPath(id)));
  return id;
}

function pickBackground(pool, last, rnd) {
  if (pool.length < 2) return null;
  var others = pool.filter(function (b) { return b !== last; });
  return others[Math.floor((rnd || Math.random)() * others.length)];
}

var bgSession = null; // {mark, now}
function sessionBackground() {
  if (!config.randomBackground) return null;
  var pool = bgPool();
  if (pool.length < 2) return null;
  if (!bgSession) {
    try { bgSession = JSON.parse(fs.readFileSync(BG_SESSION, 'utf8')); } catch (e) { bgSession = {}; }
  }
  var mark = '';
  try { mark = fs.readFileSync(SESSION_FILE, 'utf8').trim(); } catch (e) {}
  if (mark === bgSession.mark && pool.indexOf(bgSession.now) !== -1) return bgSession.now;
  bgSession = { mark: mark, now: pickBackground(pool, bgSession.now) };
  try { writeAtomic(BG_SESSION, JSON.stringify(bgSession) + '\n'); } catch (e) {}
  log('background for this time the TV is on: ' + bgSession.now);
  return bgSession.now;
}

/*
 * The screen saver paused for a while: the TV asks every client registered
 * with registerScreenSaverRequest before it starts the screen saver, and one
 * answering ack false keeps it off. Until saverUntil, then LG's again. Held in
 * memory only, so a restart of the TV ends it too: an OLED should not show a
 * still picture for long.
 */
var saverUntil = 0, saverChild = null, saverTimer = null;

function pauseSaver(ms) {
  saverUntil = ms ? Date.now() + ms : 0;
  clearTimeout(saverTimer);
  if (!ms) {
    if (saverChild) saverChild.kill();
    return;
  }
  saverTimer = setTimeout(function () { pauseSaver(0); }, ms);
  // A screen saver already on goes away too: it takes the first key it gets, so a
  // Back sent only while it shows reaches nothing behind it (as GlassHouse does).
  luna('com.webos.service.tvpower/power/getPowerState', {}, function (r) {
    if (r && r.state === 'Screen Saver') luna('com.webos.service.networkinput/test/sendKeyCode', { keyCode: 412 });
  });
  if (saverChild) return;
  var child = saverChild = spawn(LUNA_SEND, ['-i', 'luna://com.webos.service.tvpower/power/registerScreenSaverRequest',
    JSON.stringify({ subscribe: true, clientName: APP_ID })], { stdio: ['ignore', 'pipe', 'ignore'] });
  var rest = '';
  child.stdout.on('data', function (d) {
    var lines = (rest + d).split('\n');
    rest = lines.pop();
    lines.forEach(function (l) {
      var ts = /"timestamp"\s*:\s*(\d+)/.exec(l);
      if (ts) {
        luna('com.webos.service.tvpower/power/responseScreenSaverRequest',
          { clientName: APP_ID, ack: Date.now() >= saverUntil, timestamp: +ts[1] });
      }
    });
  });
  child.on('exit', function () {
    if (saverChild === child) saverChild = null;
    if (Date.now() < saverUntil) setTimeout(function () { if (!saverChild && Date.now() < saverUntil) pauseSaver(saverUntil - Date.now()); }, 5000);
  });
}

var ID_RE = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,127}$/;
// The devices an HDMI input can be set to, as in logos.js.
var DEVICES = ['ps5', 'ps4', 'xboxseries', 'xbox', 'switch2', 'switch', 'wii', 'steamdeck', 'appletv', 'shield', 'chromecast', 'googletv', 'firetv', 'roku', 'console', 'player', 'tv', 'hdmi'];

function str(v, max) {
  return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').replace(/^\s+|\s+$/g, '').slice(0, max) : '';
}

function num(v, min, max) { return typeof v === 'number' && isFinite(v) && v >= min && v <= max; }

/*
 * Checks a change to the config, field by field: an unknown field or a value
 * out of range refuses the whole change. Returns the cleaned change, or a
 * string saying what is wrong.
 */
function validate(body, keyNames) {
  var out = {};
  var fields = Object.keys(body);
  for (var i = 0; i < fields.length; i++) {
    var k = fields[i], v = body[k];
    if (k === 'clock') { if (v !== '24' && v !== '12') return 'clock'; out[k] = v; }
    else if (k === 'clockStyle') { if (CLOCK_STYLES.indexOf(v) === -1) return 'clockStyle'; out[k] = v; }
    else if (k === 'clockSize') { if (CLOCK_SIZES.indexOf(v) === -1) return 'clockSize'; out[k] = v; }
    // The clock and weather on the left, as always, or on the right.
    else if (k === 'clockSide') { if (v !== 'left' && v !== 'right') return 'clockSide'; out[k] = v; }
    else if (k === 'units') { if (v !== 'c' && v !== 'f') return 'units'; out[k] = v; }
    else if (k === 'tileStyle') { if (['text', 'logo', 'icon'].indexOf(v) === -1) return 'tileStyle'; out[k] = v; }
    // Names under logos and icons: all of them, the selected one's only, or none.
    else if (k === 'labels') { if (['all', 'selected', 'none'].indexOf(v) === -1) return 'labels'; out[k] = v; }
    else if (k === 'twoRows') { if (typeof v !== 'boolean') return 'twoRows'; out[k] = v; }
    // Where the lower row starts among the tiles: one number, so never a third row.
    else if (k === 'rowBreak') { if (v !== null && (typeof v !== 'number' || v % 1 || v < 0 || v > MAX_TILES)) return 'rowBreak'; out[k] = v; }
    else if (k === 'veil') { if (!num(v, 0, 100)) return 'veil'; out[k] = Math.round(v); }
    else if (k === 'openAtPowerOn') { if (typeof v !== 'boolean') return 'openAtPowerOn'; out[k] = v; }
    // The Home's open apps button; off, as before 1.0.7, and then the TV is not even asked.
    else if (k === 'openApps') { if (typeof v !== 'boolean') return 'openApps'; out[k] = v; }
    // The tile selected when the Home opens: the last one opened, as up to 1.0.8, or the first.
    else if (k === 'startTile') { if (v !== 'last' && v !== 'first') return 'startTile'; out[k] = v; }
    // The gear at the end of the row; the settings stay at the TV's address from a phone.
    else if (k === 'hideGear') { if (typeof v !== 'boolean') return 'hideGear'; out[k] = v; }
    else if (k === 'port') { if (typeof v !== 'number' || v % 1 || v < 1024 || v > 65535) return 'port'; out[k] = v; }
    // One the app carries, or a picture uploaded.
    else if (k === 'preset') { if (PRESETS.indexOf(v) === -1 && mineIds().indexOf(v) === -1) return 'preset'; out[k] = v; }
    else if (k === 'randomBackground') { if (typeof v !== 'boolean') return 'randomBackground'; out[k] = v; }
    // The backgrounds a random pick may use, each once: the app's own and the pictures uploaded.
    else if (k === 'backgroundPool') {
      var ids = PRESETS.concat(mineIds());
      if (v !== null && (!Array.isArray(v) || v.length > ids.length || v.some(function (b, j) {
        return ids.indexOf(b) === -1 || v.indexOf(b) !== j;
      }))) return 'backgroundPool';
      out[k] = v;
    }
    else if (k === 'key') {
      if (v !== 'none' && v !== 'home' && keyNames.indexOf(v) === -1) return 'key';
      out[k] = v;
    } else if (k === 'weather') {
      if (v === null) { out[k] = null; continue; }
      if (!v || typeof v !== 'object' || !num(v.lat, -90, 90) || !num(v.lon, -180, 180) || !str(v.name, 80)) return 'weather';
      out[k] = { name: str(v.name, 80), lat: v.lat, lon: v.lon };
    } else if (k === 'tiles') {
      if (Object.prototype.toString.call(v) !== '[object Array]' || v.length > MAX_TILES) return 'tiles';
      var tiles = [], seen = {};
      for (var j = 0; j < v.length; j++) {
        var t = v[j];
        if (!t || typeof t !== 'object' || typeof t.id !== 'string' || !ID_RE.test(t.id) || seen[t.id] || !str(t.title, 40)) return 'tiles';
        seen[t.id] = true;
        var tile = { id: t.id, title: str(t.title, 40) };
        if (t.device !== undefined) {
          if (!isInput(t.id) || DEVICES.indexOf(t.device) === -1) return 'tiles';
          tile.device = t.device;
        }
        if (isWeb(t.id) || t.url !== undefined) {
          if (!isWeb(t.id) || !webUrl(t.url)) return 'tiles';
          tile.url = t.url;
        }
        // A logo or icon chosen for the tile; without one, Lightkeeper picks it.
        if (t.logo !== undefined) {
          if (typeof t.logo !== 'string' || !(has(CATALOG, t.logo) || has(myLogos(), t.logo))) return 'tiles';
          tile.logo = t.logo;
        }
        tiles.push(tile);
      }
      out[k] = tiles;
    } else {
      return k;
    }
  }
  return out;
}

/* ---------- PIN ---------- */

function pinHash(pin, salt) { return crypto.createHash('sha256').update(salt + ':' + pin).digest('hex'); }

// Compared in time that depends only on the length: node 0.12 has no timingSafeEqual.
function same(a, b) {
  var diff = a.length ^ b.length;
  for (var i = 0; i < b.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Five wrong PINs in a row lock the page for a minute, for everyone.
var pinFails = 0, pinLockedUntil = 0;

function pinOk(req) {
  if (!config.pin) return true;
  if (Date.now() < pinLockedUntil) return false;
  var given = String(req.headers['x-lightkeeper-pin'] || '');
  if (given && same(pinHash(given, config.pin.salt), config.pin.hash)) { pinFails = 0; return true; }
  if (given && ++pinFails >= 5) { pinFails = 0; pinLockedUntil = Date.now() + 60000; }
  return false;
}

/* ---------- what the TV has ---------- */

var appsCache = null, appsAt = 0;

function listApps(cb) {
  if (appsCache && Date.now() - appsAt < 60000) return cb(appsCache);
  luna('com.webos.applicationManager/listApps', {}, function (r) {
    if (r && r.apps && r.apps.length) { appsCache = r.apps; appsAt = Date.now(); }
    cb(r && r.apps && r.apps.length ? r.apps : appsCache);
  });
}

function isInput(id) { return /^com\.webos\.app\.(hdmi|livetv$)/.test(id); }

// The logos and icons Lightkeeper draws, by name, from logos.js itself: a tile may pick one.
var CATALOG = (function () {
  var names = {}, ctx = {};
  try {
    vm.runInNewContext(fs.readFileSync(path.join(APP_DIR, 'logos.js'), 'utf8'), ctx);
    [ctx.SIMPLE_ICONS, ctx.IMMAGINI, ctx.ICONE].forEach(function (t) { Object.keys(t || {}).forEach(function (k) { names[k] = true; }); });
  } catch (e) { console.log('logos.js: ' + e.message); }
  return names;
})();

// A tile that opens a web page in the TV's browser: an id of its own, and an http or
// https address, as logos.js's indirizzoWeb checks it for the page.
function isWeb(id) { return /^web\.[a-z0-9]{1,16}$/.test(id); }
function webUrl(u) {
  return typeof u === 'string' && u.length <= 500 &&
    /^https?:\/\/([A-Za-z0-9.-]+|\[[0-9A-Fa-f:.]+\])(:\d{1,5})?([\/?#][^\s<>"'\\]*)?$/.test(u);
}

// The apps a tile can open: those on the Home screen, by title.
function appChoices(apps) {
  return (apps || []).filter(function (a) {
    return a && ID_RE.test(a.id || '') && a.visible !== false && a.id !== APP_ID &&
      !isInput(a.id) && !/^com\.webos\.app\.container/.test(a.id);
  }).map(function (a) { return { id: a.id, title: a.title || a.id }; })
    .sort(function (x, y) { return x.title.toLowerCase() < y.title.toLowerCase() ? -1 : 1; });
}

// The HDMI inputs by the names given them on the TV, then Live TV.
function inputChoices(apps, cb) {
  luna('com.webos.service.eim/getAllInputStatus', {}, function (r) {
    var out = [];
    ((r && r.devices) || []).forEach(function (d) {
      var id = d.appId || ('com.webos.app.' + String(d.id || '').toLowerCase().replace(/_/g, ''));
      if (/^com\.webos\.app\.hdmi\d$/.test(id)) out.push({ id: id, title: str(d.label, 40) || String(d.id) });
    });
    if (!out.length) {
      (apps || []).forEach(function (a) { if (/^com\.webos\.app\.hdmi\d$/.test(a.id)) out.push({ id: a.id, title: a.title || a.id }); });
    }
    out.sort(function (x, y) { return x.id < y.id ? -1 : 1; });
    (apps || []).forEach(function (a) { if (a.id === 'com.webos.app.livetv') out.push({ id: a.id, title: a.title || 'Live TV' }); });
    cb(out);
  });
}

// The keys of KEYS this TV's own key filters name.
var tvKeys = null;
function keysOnTv() {
  if (tvKeys) return tvKeys;
  var src = '';
  try {
    fs.readdirSync(KEY_FILTERS).forEach(function (f) {
      if (/\.js$/.test(f)) src += fs.readFileSync(path.join(KEY_FILTERS, f), 'utf8');
    });
  } catch (e) { return []; }
  tvKeys = KEYS.filter(function (k) { return src.indexOf(k.symbol) !== -1; });
  return tvKeys;
}

function keyNames() { return keysOnTv().map(function (k) { return k.key; }); }

// The file an app's icon is in, from listApps only, so no other path is ever read.
// The largest first: on our C1, extraLargeIcon is 192 px where an app lists it, largeIcon
// 130 (96 for LG's own apps). Made white from the 192 px one, the edges come out cleaner.
function iconFile(apps, id) {
  var a = null;
  (apps || []).forEach(function (x) { if (x.id === id) a = x; });
  if (!a) return null;
  var names = [a.extraLargeIcon, a.largeIcon, a.icon].filter(function (n) { return typeof n === 'string' && n; });
  for (var i = 0; i < names.length; i++) {
    var n = names[i].charAt(0) === '$' ? names[i].slice(1) : names[i];
    var tries = n.charAt(0) === '/' ? [n] : [path.join(a.folderPath || '', n), path.join(a.folderPath || '', 'hd1080', n)];
    for (var j = 0; j < tries.length; j++) {
      if (/\.(png|jpe?g|webp)$/i.test(tries[j]) && fs.existsSync(tries[j])) return tries[j];
    }
  }
  return null;
}

// The wired or Wi-Fi address before any other (a TV may also have Wi-Fi Direct up).
function lanAddress() {
  var nets = os.networkInterfaces(), found = '';
  var rank = function (n) { return /^eth/.test(n) ? 0 : /^wlan/.test(n) ? 1 : 2; };
  Object.keys(nets).sort(function (a, b) { return rank(a) - rank(b); }).forEach(function (name) {
    (nets[name] || []).forEach(function (a) {
      if (!found && !a.internal && (a.family === 'IPv4' || a.family === 4)) found = a.address;
    });
  });
  return found;
}

/* ---------- the remote key, through GlassHouse ---------- */

function readRemoteKeys() {
  try {
    var j = JSON.parse(fs.readFileSync(REMOTE_KEYS, 'utf8'));
    return j && typeof j === 'object' ? j : {};
  } catch (e) { return {}; }
}

/*
 * Points the chosen key at Lightkeeper, and takes it off any other key, leaving
 * every key GlassHouse set alone. The map file is GlassHouse's, rewritten as it
 * writes it; the configd value is what its filter reads, so a change applies at
 * once where the filter is in the compositor's chain. Where it is not yet (no
 * key ever set in GlassHouse), GlassHouse is restarted, and puts it there a
 * minute later. cb(state): 'off', 'active', 'pending', 'noglasshouse', 'unsupported' or 'failed'.
 */
function applyKey(key, cb) {
  if (!fs.existsSync(path.join(TVWEB, 'tvweb.js'))) return cb(key === 'none' ? 'off' : 'noglasshouse');
  // No LG key filters, as on webOS 3: nothing would read the key map (issue #3),
  // and an entry an earlier version wrote there is taken out.
  if (key !== 'none' && !fs.existsSync(KEY_FILTERS)) return applyKey('none', function () { cb('unsupported'); });
  var j = readRemoteKeys();
  var keys = j.keys && typeof j.keys === 'object' ? j.keys : {};
  var before = JSON.stringify([keys, j.home || '']);
  Object.keys(keys).forEach(function (k) { if (keys[k] === APP_ID) delete keys[k]; });
  var home = j.home === APP_ID ? '' : (typeof j.home === 'string' ? j.home : '');
  if (key === 'home') home = APP_ID;
  else if (key !== 'none') keys[key] = APP_ID;
  if (JSON.stringify([keys, home]) !== before) {
    var starting = typeof j.starting === 'string' ? j.starting : '';
    try {
      if (!Object.keys(keys).length && !home && !starting) {
        try { fs.unlinkSync(REMOTE_KEYS); } catch (e) {}
      } else {
        var out = { keys: keys, updated: new Date().toISOString() };
        if (home) out.home = home;
        if (starting) out.starting = starting;
        writeAtomic(REMOTE_KEYS, JSON.stringify(out, null, 2) + '\n', 420);
      }
    } catch (e) {
      log('remote keys: ' + e.message);
      return cb('failed');
    }
    var value = { keys: keys };
    if (home) value.home = home;
    if (starting) value.starting = starting;
    var configs = {};
    configs[REMOTE_KEYS_VALUE] = value;
    return luna('com.webos.service.config/setConfigs', { configs: configs }, function () { keyState(key, true, cb); });
  }
  keyState(key, false, cb);
}

function keyState(key, changed, cb) {
  if (key === 'none') return cb('off');
  luna('com.webos.service.config/getConfigs', { configNames: [CHAIN] }, function (r) {
    var list = (r && r.configs && r.configs[CHAIN]) || [];
    var inChain = list.some ? list.some(function (e) { return e && e.file === FILTER_FILE; }) : false;
    if (inChain) return cb('active');
    if (!r) return cb('failed');
    if (changed) execFile(path.join(TVWEB, 'tvwebctl'), ['restart'], { timeout: 30000 }, function () {});
    cb('pending');
  });
}

/* ---------- updates ---------- */

// The newest release, from an address that does not change, and the only place
// packages are taken from. For a test, a file update-test.json in DATA,
// {"manifest": "<url>"}, points to another manifest, and packages are then taken
// from beside it. It is not in the settings; the log says when it is in use.
var MANIFEST = 'https://github.com/chiotas/lightkeeper/releases/latest/download/lightkeeper.manifest.json';
var RELEASES = 'https://github.com/chiotas/lightkeeper/releases/';
var UPDATE_TEST = path.join(DATA, 'update-test.json');
// What update.sh last did: {state: installing, installed or failed, version, error, at}.
var UPDATE_STATUS = path.join(DATA, 'update.json');
var UPDATE_DIR = process.env.LIGHTKEEPER_UPDATE_DIR || '/tmp';
var CURL = process.env.LIGHTKEEPER_CURL || '/usr/bin/curl';
var UPDATER = process.env.LIGHTKEEPER_UPDATER || path.join(HERE, 'update.sh');
var MAX_IPK = 50 * 1024 * 1024;

// True when version b is newer than a: 1.0.10 after 1.0.9.
function newer(a, b) {
  var x = String(a).split('.'), y = String(b).split('.');
  for (var i = 0; i < Math.max(x.length, y.length); i++) {
    var p = +x[i] || 0, q = +y[i] || 0;
    if (p !== q) return q > p;
  }
  return false;
}

function updateSource() {
  var t = null;
  try { t = JSON.parse(fs.readFileSync(UPDATE_TEST, 'utf8')); } catch (e) {}
  if (t && typeof t.manifest === 'string' && /^(https?|file):\/\//.test(t.manifest)) {
    return { manifest: t.manifest, base: t.manifest.replace(/[^\/]*$/, ''), test: true };
  }
  return { manifest: MANIFEST, base: RELEASES, test: false };
}

// The manifest's text, checked: {version, url, sha256, size}, or what is wrong with it.
function readManifest(text, base) {
  var m = null;
  try { m = JSON.parse(text); } catch (e) {}
  if (!m || typeof m !== 'object') return 'the manifest of the latest version is not readable';
  if (typeof m.version !== 'string' || !/^\d+(\.\d+){0,3}$/.test(m.version)) return 'the manifest has no version';
  var url = m.ipkUrl, sha = m.ipkHash && m.ipkHash.sha256, size = m.ipkSize;
  if (typeof url !== 'string' || url.indexOf(base) !== 0 || url.indexOf('..') !== -1) return 'the package is not from ' + base;
  if (typeof sha !== 'string' || !/^[0-9a-f]{64}$/.test(sha)) return 'the manifest has no sha256';
  if (typeof size !== 'number' || size < 1 || size > MAX_IPK) return 'the manifest has no size';
  return { version: m.version, url: url, sha256: sha, size: size };
}

// The package as downloaded against the manifest: null when it matches, else why not.
function verifyIpk(file, m) {
  var b;
  try { b = fs.readFileSync(file); } catch (e) { return 'the package could not be read'; }
  if (b.length !== m.size) return 'the package is ' + b.length + ' bytes, the manifest says ' + m.size;
  if (crypto.createHash('sha256').update(b).digest('hex') !== m.sha256) return 'the package does not match the manifest\'s sha256';
  return null;
}

function curl(args, cb) {
  if (!fs.existsSync(CURL)) return cb(new Error('this TV has no curl'));
  execFile(CURL, ['-fsSL', '--max-time', '180'].concat(args), { maxBuffer: 1024 * 1024 }, cb);
}

// The latest version, asked at most every ten minutes unless an update needs it
// fresh, or the manifest to read has changed (update-test.json added or removed).
var latest = null, latestAt = 0, latestFrom = '';
function checkUpdate(fresh, cb) {
  var src = updateSource();
  if (!fresh && latest && src.manifest === latestFrom && Date.now() - latestAt < 600000) return cb(latest);
  if (src.test) log('update: test manifest ' + src.manifest);
  curl([src.manifest], function (err, out) {
    var r = err ? 'the latest version could not be read: ' + String(err.message).split('\n')[0] : readManifest(out, src.base);
    latest = typeof r === 'string' ? { error: r } : r;
    latestAt = Date.now();
    latestFrom = src.manifest;
    cb(latest);
  });
}

function updateState() {
  try { return JSON.parse(fs.readFileSync(UPDATE_STATUS, 'utf8')); } catch (e) { return null; }
}

function setUpdateState(state, version, error) {
  try {
    if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, 448);
    writeAtomic(UPDATE_STATUS, JSON.stringify({ state: state, version: version, error: error || '', at: Date.now() }) + '\n');
  } catch (e) { log('update: ' + e.message); }
}

/*
 * Downloads the newest package, checks its size and sha256 against the manifest,
 * and hands it to update.sh, detached: installing restarts this server, which must
 * not be what runs the install. update.sh runs from a copy outside the app, which
 * the install replaces. cb(error text) or cb(null, version).
 */
var updating = false;
function startUpdate(cb) {
  if (updating) return cb('an update is already under way');
  checkUpdate(true, function (m) {
    if (m.error) return cb(m.error);
    if (!newer(VERSION, m.version)) return cb('Lightkeeper ' + VERSION + ' is already the latest version');
    updating = true;
    var ipk = path.join(UPDATE_DIR, 'lightkeeper-update.ipk');
    try { fs.unlinkSync(ipk); } catch (e) {}
    log('update: downloading ' + m.version + ' from ' + m.url);
    curl(['-o', ipk, m.url], function (err) {
      var wrong = err ? 'the package could not be downloaded: ' + String(err.message).split('\n')[0] : verifyIpk(ipk, m);
      if (wrong) {
        updating = false;
        try { fs.unlinkSync(ipk); } catch (e) {}
        log('update: ' + wrong);
        setUpdateState('failed', m.version, wrong);
        return cb(wrong);
      }
      var script = path.join(UPDATE_DIR, 'lightkeeper-update.sh');
      try { fs.writeFileSync(script, fs.readFileSync(UPDATER), { mode: 448 }); } catch (e) { updating = false; return cb('update.sh: ' + e.message); }
      setUpdateState('installing', m.version);
      log('update: ' + m.version + ' checked, installing');
      var env = {};
      Object.keys(process.env).forEach(function (k) { env[k] = process.env[k]; });
      env.LIGHTKEEPER_STATUS = UPDATE_STATUS;
      spawn('/bin/sh', [script, ipk, m.version], { detached: true, stdio: 'ignore', env: env, cwd: '/' }).unref();
      cb(null, m.version);
    });
  });
}

function updateReply() {
  return {
    ok: true, current: VERSION, latest: latest && latest.version || null, error: latest && latest.error || null,
    available: !!(latest && latest.version && newer(VERSION, latest.version)), status: updateState(), test: updateSource().test
  };
}

/* ---------- first start, uninstall ---------- */

// The first start picks the usual apps this TV has, or its first few.
function pickTiles(cb) {
  listApps(function (apps) {
    if (!apps) return cb(null);
    var choices = appChoices(apps), byId = {};
    choices.forEach(function (c) { byId[c.id] = c; });
    var tiles = USUAL_APPS.filter(function (id) { return byId[id]; }).map(function (id) { return byId[id]; });
    cb((tiles.length ? tiles : choices).slice(0, 5));
  });
}

function uninstall(removeApp, cb) {
  applyKey('none', function () {
    try { fs.unlinkSync(HOOK); } catch (e) {}
    try { rmrf(DATA); } catch (e) { log('uninstall: ' + e.message); }
    log('uninstalled');
    if (!removeApp) return cb();
    luna('com.webos.appInstallService/dev/remove', { id: APP_ID }, function () { cb(); });
  });
}

// The app removed from the TV's own menu leaves this running from memory: once
// its files have been gone for a minute (not an update, which puts them back
// within seconds), the key goes back to LG and everything else goes too.
var missing = 0;
function watchApp() {
  if (fs.existsSync(path.join(APP_DIR, 'appinfo.json'))) { missing = 0; return; }
  if (++missing < 3) return;
  log('the app is gone');
  uninstall(false, function () { process.exit(0); });
}

/* ---------- HTTP ---------- */

var TYPES = { '.html': 'text/html; charset=utf-8', '.woff2': 'font/woff2', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.js': 'text/javascript; charset=utf-8' };

function send(res, status, body, headers) {
  var h = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
  Object.keys(headers || {}).forEach(function (k) { h[k] = headers[k]; });
  if (typeof body === 'object' && !Buffer.isBuffer(body)) {
    body = JSON.stringify(body);
    h['Content-Type'] = 'application/json';
  }
  res.writeHead(status, h);
  res.end(body);
}

function sendFile(res, file, cache, extra) {
  fs.readFile(file, function (err, data) {
    if (err) return send(res, 404, { ok: false, error: 'not found' });
    var h = { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' };
    if (cache) h['Cache-Control'] = cache;
    Object.keys(extra || {}).forEach(function (k) { h[k] = extra[k]; });
    send(res, 200, data, h);
  });
}

/*
 * The apps open on the TV that the Home offers to close: those a tile could open, which
 * LG's launcher shows (appChoices: not Lightkeeper, inputs, Live TV or apps kept hidden),
 * and never LG's Home. From applicationManager/running, which on a C1 with webOS 6.5.3
 * answers {running: [{id, appType, defaultWindowType, processid, webprocessid}]}, listing
 * LG's Home, inputs, overlays (voice, livemenu) and AirPlay too.
 */
var LG_HOME = 'com.webos.app.home';
function openApps(running, apps) {
  var on = {};
  ((running && running.running) || []).forEach(function (r) { if (r && typeof r.id === 'string') on[r.id] = true; });
  return appChoices(apps).filter(function (a) { return on[a.id] && a.id !== LG_HOME; });
}

function listOpen(cb) {
  listApps(function (apps) {
    luna('com.webos.applicationManager/running', {}, function (r) { cb(openApps(r, apps)); });
  });
}

// Closes these apps one after the other; cb(the ones closed).
function closeApps(ids, cb) {
  var closed = [];
  (function next(i) {
    if (i === ids.length) {
      if (closed.length) log('closed from the Home: ' + closed.join(', '));
      return cb(closed);
    }
    luna('com.webos.applicationManager/closeByAppId', { id: ids[i] }, function (r) {
      if (r) closed.push(ids[i]);
      next(i + 1);
    });
  })(0);
}

/*
 * Open apps are listed and closed for the Home only: from the TV itself, by a page of
 * its own. The Home is a file:// page, whose Origin is "null"; a page on the TV's own
 * servers has a loopback one. The PIN, which the Home does not have, is not asked.
 * ponytail: a sandboxed frame in the TV's browser also sends "null"; a token read by
 * the Home through the Homebrew Channel would close that.
 */
// webOS 6 sends the Home's own file:// origin with a POST, as the TV's log showed on a C1.
function fromHome(req) {
  var a = String(req.socket.remoteAddress || '').replace(/^::ffff:/, ''), o = req.headers.origin;
  return (a === '127.0.0.1' || a === '::1') &&
    (o === undefined || o === 'null' || o === 'file://' || o === 'file://' + APP_ID + '-webos' ||
      /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(o));
}

// The TV itself and the private ranges: nothing from beyond the local network.
function isLocal(addr) {
  addr = String(addr || '').replace(/^::ffff:/, '');
  if (net.isIPv4(addr)) {
    var p = addr.split('.').map(Number);
    return p[0] === 10 || p[0] === 127 || (p[0] === 192 && p[1] === 168) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 169 && p[1] === 254);
  }
  return addr === '::1' || /^f[cd]/i.test(addr) || /^fe[89ab]/i.test(addr);
}

// An IP literal or localhost only: a name rebound to the TV's address is refused.
function hostOk(req) {
  var h = String(req.headers.host || '').toLowerCase();
  var m = /^\[([^\]]+)\](:\d+)?$/.exec(h);
  if (m) h = m[1];
  else h = h.replace(/:\d+$/, '');
  return !!net.isIP(h) || h === 'localhost';
}

// A write needs this exact type, which a page elsewhere cannot send without a
// preflight that is never approved, and an Origin, when sent, of this host.
function postOk(req, type) {
  if (String(req.headers['content-type'] || '').split(';')[0].toLowerCase() !== type) return false;
  var origin = req.headers.origin;
  return !origin || origin.replace(/^https?:\/\//, '') === req.headers.host;
}

function readBody(req, limit, cb) {
  var chunks = [], size = 0, over = false;
  req.on('data', function (d) {
    size += d.length;
    if (size > limit) { over = true; chunks = []; return; }
    if (!over) chunks.push(d);
  });
  req.on('end', function () { cb(over ? null : Buffer.concat(chunks)); });
}

function readJson(req, res, cb) {
  if (!postOk(req, 'application/json')) return send(res, 415, { ok: false, error: 'bad request' });
  readBody(req, MAX_JSON, function (b) {
    if (!b) return send(res, 413, { ok: false, error: 'too large' });
    var j = null;
    try { j = JSON.parse(b.toString('utf8')); } catch (e) {}
    if (!j || typeof j !== 'object') return send(res, 400, { ok: false, error: 'malformed JSON' });
    cb(j);
  });
}

// The size of a JPEG, from its first frame header, or null if it is not one.
function jpegSize(b) {
  if (b.length < 4 || b[0] !== 0xFF || b[1] !== 0xD8) return null;
  var i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xFF) return null;
    var m = b[i + 1];
    if (m === 0xFF) { i++; continue; }
    if (m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
      return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    }
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

/*
 * The size of a PNG with an alpha channel, grey or colour, from its header, or null
 * if it is not one: the signature, IHDR first, IEND last.
 * ponytail: the pixels are not decoded; the browser that shows it refuses a broken one.
 */
var PNG_SIG = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
function pngSize(b) {
  if (!b || b.length < 8 + 25 + 12) return null;
  for (var i = 0; i < 8; i++) if (b[i] !== PNG_SIG[i]) return null;
  if (b.readUInt32BE(8) !== 13 || b.toString('ascii', 12, 16) !== 'IHDR') return null;
  if (b.toString('ascii', b.length - 8, b.length - 4) !== 'IEND') return null;
  if (b[25] !== 4 && b[25] !== 6) return null;
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

var keyStatus = 'off';

/*
 * The key asks the TV again while it waits. The status is put as set at each
 * start, but a GlassHouse installed after Lightkeeper, or one that has only
 * now put its filter in the chain, leaves the old word here: the settings page
 * would keep saying pending or no GlassHouse over a key that works, until the
 * server restarted. Reading the settings (which the page does every few
 * seconds) asks again, at most once a minute; the read answers with what is
 * known then and the next one carries the new word. applyKey writes nothing
 * new when all is as set, and nothing at all where GlassHouse is still absent.
 */
var KEY_RECHECK_MS = +(process.env.LIGHTKEEPER_KEY_RECHECK || 60000);
var keyRecheckedAt = 0;
function recheckKey() {
  if (keyStatus !== 'pending' && keyStatus !== 'noglasshouse') return;
  if (config.key === 'none') return;
  var now = Date.now();
  if (now - keyRecheckedAt < KEY_RECHECK_MS) return;
  keyRecheckedAt = now;
  applyKey(config.key, function (state) {
    if (state !== keyStatus) { keyStatus = state; log('key: ' + state); }
  });
}

function handle(req, res) {
  if (!isLocal(req.socket.remoteAddress)) return send(res, 403, { ok: false, error: 'local network only' });
  if (!hostOk(req)) return send(res, 403, { ok: false, error: 'use the TV\'s address' });
  var u = String(req.url || '/'), q = u.indexOf('?');
  var p = q === -1 ? u : u.slice(0, q), query = q === -1 ? '' : u.slice(q + 1);
  var m = req.method;

  if (m === 'GET' && (p === '/' || p === '/settings')) {
    return sendFile(res, path.join(HERE, 'settings.html'), 'no-store', {
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: blob:; connect-src 'self' https://geocoding-api.open-meteo.com https://api.open-meteo.com; frame-ancestors 'none'",
      'X-Frame-Options': 'DENY'
    });
  }
  if (m === 'GET' && p === '/logos.js') return sendFile(res, path.join(APP_DIR, 'logos.js'), 'no-cache');
  if (m === 'GET' && /^\/logos\/[a-z0-9]+\.png$/.test(p)) return sendFile(res, path.join(APP_DIR, p.slice(1)), 'max-age=86400');
  if (m === 'GET' && /^\/jost(-[235]00)?\.woff2$/.test(p)) return sendFile(res, path.join(APP_DIR, p.slice(1)), 'max-age=86400');
  if (m === 'GET' && /^\/clock\/(classic|mono|rounded|digital)\.woff2$/.test(p)) return sendFile(res, path.join(APP_DIR, p.slice(1)), 'max-age=86400');
  if (m === 'GET' && /^\/backgrounds\/((thumbs\/)?[a-z0-9-]+\.jpg|index\.json)$/.test(p)) {
    // The list changes with an update of the app; the pictures under a name never do.
    return sendFile(res, path.join(APP_DIR, p.slice(1)), /\.json$/.test(p) ? 'no-cache' : 'max-age=86400');
  }
  // The background in use: the picture uploaded, or the one chosen among those the app carries.
  if (m === 'GET' && p === '/background.jpg') return sendFile(res, chosenFile(), 'max-age=31536000');
  // A picture uploaded, never changed under its id; its small copy, or itself when it has none.
  var mp = /^\/mine\/(my-[0-9a-f]{8})(-thumb)?\.jpg$/.exec(p);
  if (m === 'GET' && mp) {
    var thumb = mp[2] && fs.existsSync(minePath(mp[1], true));
    // Not kept by the browser when the small copy is still on its way.
    return sendFile(res, minePath(mp[1], thumb), mp[2] && !thumb ? 'no-store' : 'max-age=31536000');
  }
  // A logo uploaded, never changed under its id.
  var lp = /^\/mylogos\/(up-[0-9a-f]{8})\.png$/.exec(p);
  if (m === 'GET' && lp) return sendFile(res, logoPath(lp[1]), 'max-age=31536000', { 'Content-Security-Policy': "default-src 'none'" });
  if (m === 'GET' && p === '/icon') {
    var id = decodeURIComponent((/(?:^|&)id=([^&]*)/.exec(query) || [])[1] || '');
    if (!ID_RE.test(id)) return send(res, 400, { ok: false, error: 'bad id' });
    return listApps(function (apps) {
      var f = iconFile(apps, id);
      if (!f) return send(res, 404, { ok: false, error: 'no icon' });
      // As data for a page that turns it white: a canvas may always read a data: picture.
      if (/(?:^|&)data=1(?:&|$)/.test(query)) {
        return fs.readFile(f, function (err, data) {
          if (err) return send(res, 404, { ok: false, error: 'no icon' });
          send(res, 200, { ok: true, src: 'data:' + (TYPES[path.extname(f).toLowerCase()] || 'image/png') + ';base64,' + data.toString('base64') },
            { 'Access-Control-Allow-Origin': '*' });
        });
      }
      sendFile(res, f, 'max-age=86400', { 'Content-Security-Policy': "default-src 'none'" });
    });
  }
  // The Home reads this from its own file:// page, so any origin may read it;
  // it holds nothing secret.
  if (m === 'GET' && p === '/api/config') {
    var c = publicConfig();
    recheckKey();
    c.keyStatus = keyStatus;
    return send(res, 200, c, { 'Access-Control-Allow-Origin': '*' });
  }

  if (p === '/api/open' || p === '/api/close') {
    if (!fromHome(req)) {
      log('open apps refused: ' + req.socket.remoteAddress + ', origin ' + req.headers.origin);
      return send(res, 403, { ok: false, error: 'the Home only' });
    }
    var cors = req.headers.origin ? { 'Access-Control-Allow-Origin': req.headers.origin, 'Vary': 'Origin' } : {};
    if (m === 'GET' && p === '/api/open' && !config.openApps) return send(res, 200, { ok: true, apps: [] }, cors);
    if (m === 'GET' && p === '/api/open') return listOpen(function (open) { send(res, 200, { ok: true, apps: open }, cors); });
    if (m === 'OPTIONS' && p === '/api/close') {
      cors['Access-Control-Allow-Methods'] = 'POST';
      cors['Access-Control-Allow-Headers'] = 'Content-Type';
      cors['Access-Control-Max-Age'] = '600';
      return send(res, 204, '', cors);
    }
    // JSON only: from a page elsewhere, that type needs a preflight, which fromHome refuses.
    if (m === 'POST' && p === '/api/close') {
      if (!config.openApps) return send(res, 409, { ok: false, error: 'the open apps button is off' }, cors);
      if (String(req.headers['content-type'] || '').split(';')[0].toLowerCase() !== 'application/json') return send(res, 415, { ok: false, error: 'bad request' }, cors);
      return readBody(req, MAX_JSON, function (b) {
        var body = null;
        try { body = JSON.parse(String(b)); } catch (e) {}
        if (!body || !(body.all === true || (typeof body.id === 'string' && ID_RE.test(body.id)))) return send(res, 400, { ok: false, error: 'id or all expected' }, cors);
        // Only what the Home would list: never Lightkeeper, an input or LG's Home.
        listOpen(function (open) {
          var ids = open.map(function (a) { return a.id; }).filter(function (id) { return body.all || id === body.id; });
          closeApps(ids, function (closed) {
            send(res, 200, { ok: true, closed: closed, apps: open.filter(function (a) { return closed.indexOf(a.id) === -1; }) }, cors);
          });
        });
      });
    }
    return send(res, 405, { ok: false, error: 'not allowed' }, cors);
  }
  if (p.indexOf('/api/') !== 0) return send(res, 404, { ok: false, error: 'not found' });
  if (!pinOk(req)) {
    return send(res, 401, { ok: false, error: Date.now() < pinLockedUntil ? 'locked' : 'pin' });
  }

  if (m === 'GET' && p === '/api/tv') {
    return listApps(function (apps) {
      inputChoices(apps, function (inputs) {
        send(res, 200, {
          ok: true, apps: appChoices(apps), inputs: inputs, keyStatus: keyStatus,
          keys: keysOnTv().map(function (k) { return { key: k.key, title: k.title }; }),
          glasshouse: fs.existsSync(path.join(TVWEB, 'tvweb.js'))
        });
      });
    });
  }
  if (m === 'POST' && p === '/api/config') {
    return readJson(req, res, function (body) {
      var change = validate(body, keyNames());
      if (typeof change === 'string') return send(res, 400, { ok: false, error: 'invalid: ' + change });
      movePort(change.port, function (err) {
        if (err) return send(res, 409, { ok: false, error: err });
        // A picture uploaded is chosen as such; one the app carries leaves the pictures in the list.
        var mine = has(change, 'preset') && MINE_ID.test(change.preset) ? change.preset : null;
        if (mine) delete change.preset;
        Object.keys(change).forEach(function (k) { config[k] = change[k]; });
        if (mine) config.background = { custom: true, id: mine, rev: (config.background.rev || 0) + 1 };
        else if (has(change, 'preset') && config.background.custom) config.background = { custom: false, rev: (config.background.rev || 0) + 1 };
        try { saveConfig(); } catch (e) { return send(res, 500, { ok: false, error: e.message }); }
        if (!has(change, 'key')) return send(res, 200, { ok: true, config: publicConfig(), keyStatus: keyStatus });
        applyKey(config.key, function (state) {
          keyStatus = state;
          send(res, 200, { ok: true, config: publicConfig(), keyStatus: keyStatus });
        });
      });
    });
  }
  // The pictures uploaded: how many bytes each, and the room left where they are kept.
  if (m === 'GET' && p === '/api/backgrounds') {
    return freeSpace(function (free) { send(res, 200, { ok: true, mine: mineSizes(), free: free, keepFree: MIN_FREE }); });
  }
  // One more picture, chosen at once; refused when it would leave less than MIN_FREE free.
  if (m === 'POST' && p === '/api/background') {
    if (!postOk(req, 'image/jpeg')) return send(res, 415, { ok: false, error: 'a JPEG is expected' });
    return readBody(req, MAX_IMAGE, function (b) {
      if (!b) return send(res, 413, { ok: false, error: 'too large' });
      var size = jpegSize(b);
      if (!size || size.width < 640 || size.width > 3840 || size.height > 2160) {
        return send(res, 400, { ok: false, error: 'a JPEG up to 3840 × 2160 is expected' });
      }
      freeSpace(function (free) {
        if (free === null || free - b.length < MIN_FREE) {
          log('picture refused: ' + (free === null ? 'free space unknown' : free + ' bytes free'));
          return send(res, 507, { ok: false, error: 'space', free: free, keepFree: MIN_FREE });
        }
        var id = newMineId();
        try {
          if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, 448);
          if (!fs.existsSync(MINE)) fs.mkdirSync(MINE, 448);
          writeAtomic(minePath(id), b, 420);
          config.mine = mineIds().concat([id]);
          config.background = { custom: true, id: id, rev: (config.background.rev || 0) + 1 };
          saveConfig();
        } catch (e) { return send(res, 500, { ok: false, error: e.message }); }
        send(res, 200, { ok: true, id: id, config: publicConfig() });
      });
    });
  }
  // Its small copy, made by the page that sent it.
  var tid = (/(?:^|&)id=(my-[0-9a-f]{8})(?:&|$)/.exec(query) || [])[1];
  if (m === 'POST' && p === '/api/background/thumb') {
    if (!postOk(req, 'image/jpeg')) return send(res, 415, { ok: false, error: 'a JPEG is expected' });
    if (!tid || mineIds().indexOf(tid) === -1) return send(res, 404, { ok: false, error: 'no such picture' });
    return readBody(req, MAX_THUMB, function (b) {
      var size = b && jpegSize(b);
      if (!size || size.width > 640) return send(res, 400, { ok: false, error: 'a JPEG up to 640 wide is expected' });
      try { writeAtomic(minePath(tid, true), b, 420); } catch (e) { return send(res, 500, { ok: false, error: e.message }); }
      send(res, 200, { ok: true });
    });
  }
  // A picture taken away, with its small copy: the chosen one without an id, as up to 1.0.7.
  if (m === 'DELETE' && p === '/api/background') {
    var gone = tid || (config.background.custom ? config.background.id : null);
    if (gone) {
      [false, true].forEach(function (t) { try { fs.unlinkSync(minePath(gone, t)); } catch (e) {} });
      config.mine = mineIds();
      if (config.backgroundPool) config.backgroundPool = config.backgroundPool.filter(function (b) { return b !== gone; });
    }
    if (config.background.custom && (!gone || config.background.id === gone)) config.background = { custom: false, rev: (config.background.rev || 0) + 1 };
    saveConfig();
    return send(res, 200, { ok: true, config: publicConfig() });
  }
  // A logo of yours for tiles, chosen by the page for one; refused when it would leave less than MIN_FREE free.
  if (m === 'POST' && p === '/api/logo') {
    if (!postOk(req, 'image/png')) return send(res, 415, { ok: false, error: 'a PNG is expected' });
    return readBody(req, MAX_LOGO, function (b) {
      if (!b) return send(res, 413, { ok: false, error: 'too large' });
      var size = pngSize(b);
      if (!size || !size.width || !size.height || size.width > 2000 || size.height > 240) {
        return send(res, 400, { ok: false, error: 'a PNG with transparency up to 2000 × 240 is expected' });
      }
      if (Object.keys(myLogos()).length >= MAX_LOGOS) return send(res, 409, { ok: false, error: 'logos', max: MAX_LOGOS });
      freeSpace(function (free) {
        if (free === null || free - b.length < MIN_FREE) return send(res, 507, { ok: false, error: 'space', free: free, keepFree: MIN_FREE });
        var id = newLogoId();
        try {
          if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, 448);
          if (!fs.existsSync(MY_LOGOS)) fs.mkdirSync(MY_LOGOS, 448);
          writeAtomic(logoPath(id), b, 420);
          config.myLogos = myLogos();
          config.myLogos[id] = [size.width, size.height];
          saveConfig();
        } catch (e) { return send(res, 500, { ok: false, error: e.message }); }
        send(res, 200, { ok: true, id: id, config: publicConfig() });
      });
    });
  }
  // A logo taken away: the tiles that showed it go back to their own.
  var lid = (/(?:^|&)id=(up-[0-9a-f]{8})(?:&|$)/.exec(query) || [])[1];
  if (m === 'DELETE' && p === '/api/logo') {
    if (!lid) return send(res, 400, { ok: false, error: 'bad id' });
    try { fs.unlinkSync(logoPath(lid)); } catch (e) {}
    config.myLogos = myLogos();
    (config.tiles || []).forEach(function (t) { if (t.logo === lid) delete t.logo; });
    saveConfig();
    return send(res, 200, { ok: true, config: publicConfig() });
  }
  if (m === 'POST' && p === '/api/screensaver') {
    return readJson(req, res, function (body) {
      if (typeof body.pause !== 'boolean') return send(res, 400, { ok: false, error: 'pause expected' });
      pauseSaver(body.pause ? 3600000 : 0);
      send(res, 200, { ok: true, config: publicConfig() });
    });
  }
  if (m === 'POST' && p === '/api/pin') {
    return readJson(req, res, function (body) {
      var pin = body.pin;
      if (pin === '') config.pin = null;
      else if (typeof pin === 'string' && /^\d{4,8}$/.test(pin)) {
        var salt = crypto.randomBytes(16).toString('hex');
        config.pin = { salt: salt, hash: pinHash(pin, salt) };
      } else return send(res, 400, { ok: false, error: 'a PIN is 4 to 8 digits' });
      saveConfig();
      send(res, 200, { ok: true, config: publicConfig() });
    });
  }
  if (m === 'GET' && p === '/api/update') {
    return checkUpdate(false, function () { send(res, 200, updateReply()); });
  }
  if (m === 'POST' && p === '/api/update') {
    return readJson(req, res, function () {
      startUpdate(function (err, version) {
        if (err) return send(res, 409, { ok: false, error: err });
        send(res, 200, { ok: true, installing: version });
      });
    });
  }
  if (m === 'POST' && p === '/api/uninstall') {
    return readJson(req, res, function (body) {
      if (body.confirm !== true) return send(res, 400, { ok: false, error: 'confirm expected' });
      send(res, 200, { ok: true });
      setTimeout(function () { uninstall(true, function () { process.exit(0); }); }, 500);
    });
  }
  send(res, 404, { ok: false, error: 'not found' });
}

/* ---------- the port ---------- */

var PORT = 0;       // in use
var portTaken = 0;  // the port in the config, while another program has it
var listening = null;

function serveSafely(req, res) {
  try { handle(req, res); } catch (e) {
    log('error: ' + (e && e.stack || e));
    try { send(res, 500, { ok: false, error: 'server error' }); } catch (e2) {}
  }
}

// cb(error, server, port) on the first free port from `port` to `last`.
function listen(port, last, cb) {
  var server = http.createServer(serveSafely);
  var busy = function (e) {
    if (e.code !== 'EADDRINUSE' || port >= last) return cb(e);
    log('port ' + port + ' is in use by another program');
    listen(port + 1, last, cb);
  };
  server.once('error', busy);
  server.listen(port, '0.0.0.0', function () {
    server.removeListener('error', busy);
    server.on('error', function (e) { log('server: ' + e.message); });
    cb(null, server, port);
  });
}

function serving(server, port) {
  listening = server;
  PORT = port;
  portTaken = port === config.port ? 0 : config.port;
  try { fs.writeFileSync(PORT_FILE, port + '\n'); } catch (e) { log('port file: ' + e.message); }
}

// A port chosen in the settings: open before it is saved, and the old one kept
// a minute for the Home and the page to move over. cb(error text) or cb().
var leaving = null; // that old one: { server, port, timer }
function movePort(port, cb) {
  if (port === undefined) return cb();
  if (port === PORT) { portTaken = 0; return cb(); }
  var moved = function (server) {
    var old = listening, was = PORT, going = { server: old, port: was };
    serving(server, port);
    portTaken = 0;
    going.timer = setTimeout(function () { old.close(); if (leaving === going) leaving = null; }, 60000);
    leaving = going;
    log('now on port ' + port + '; port ' + was + ' closes in a minute');
    cb();
  };
  // Back to the port just left: it is still this server's.
  if (leaving && leaving.port === port) { clearTimeout(leaving.timer); return moved(leaving.server); }
  listen(port, port, function (e, server) {
    if (e) return cb(e.code === 'EADDRINUSE' ? 'port ' + port + ' is in use by another program' : e.message);
    moved(server);
  });
}

function start() {
  config = loadConfig();
  try { migrate(); } catch (e) { log('background.jpg: ' + e.message); }
  // While another program has the port, the next free one of the ten after it.
  listen(config.port, Math.min(config.port + 10, 65535), function (e, server, port) {
    if (e) {
      log('server: ' + e.message + (e.code === 'EADDRINUSE' ? ': ports ' + config.port + ' to ' + Math.min(config.port + 10, 65535) +
        ' are all in use. Choose another one with: sh ' + HERE + '/setup.sh --port <port>' : ''));
      process.exit(1);
    }
    serving(server, port);
    log('Lightkeeper ' + VERSION + ' on port ' + port + (portTaken ? ', as another program has port ' + portTaken +
      '. Choose a port in the settings, or with: sh ' + HERE + '/setup.sh --port <port>' : ''));
  });

  // The key is put back as set at each start: GlassHouse may have been
  // reinstalled, or configd reset. Luna can be slow to come up after a boot.
  (function firstRun(tries) {
    var go = function () {
      applyKey(config.key, function (state) {
        keyStatus = state;
        if (state === 'failed' && tries < 10) setTimeout(function () { firstRun(tries + 1); }, 15000);
      });
    };
    if (config.tiles) return go();
    if (tries > 40) return;
    pickTiles(function (tiles) {
      if (!tiles) return setTimeout(function () { firstRun(tries + 1); }, 15000);
      config.tiles = tiles;
      try { saveConfig(); } catch (e) { log('config: ' + e.message); }
      go();
    });
  })(0);
  setInterval(watchApp, 30000);
  // Stopped by the boot hook (an update, a new start): the screen saver watch goes too.
  process.on('SIGTERM', function () { process.exit(0); });
  process.on('exit', function () { if (saverChild) saverChild.kill(); });
}

module.exports = { DEVICES: DEVICES, DEFAULTS: DEFAULTS, CATALOG: CATALOG, webUrl: webUrl, newer: newer, readManifest: readManifest, verifyIpk: verifyIpk, validate: validate, jpegSize: jpegSize, pngSize: pngSize, isLocal: isLocal, hostOk: hostOk,
  applyKey: applyKey, iconFile: iconFile, pickBackground: pickBackground, appChoices: appChoices, openApps: openApps, fromHome: fromHome, keysOnTv: keysOnTv,
  pinHash: pinHash, same: same };

if (require.main === module) {
  if (process.argv[2] === '--uninstall') {
    uninstall(true, function () { process.exit(0); });
  } else if (process.argv[2] === '--port') {
    config = loadConfig();
    var change = validate({ port: +process.argv[3] }, []);
    if (typeof change === 'string') { console.error('A port is a number from 1024 to 65535.'); process.exit(2); }
    config.port = change.port;
    saveConfig();
    console.error('Lightkeeper takes port ' + config.port + ' from its next start.');
  } else {
    start();
  }
}

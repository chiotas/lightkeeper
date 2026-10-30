/*
 * A stand-in Home Assistant, for test/check.js and local previews: the REST calls
 * Lightkeeper makes, with the token checked as HA checks it.
 *
 *   node test/fake-tv/ha.js [port] [token] [host]   http://127.0.0.1:8123, token "fake-token-for-lightkeeper";
 *                                                   host 0.0.0.0 for a TV on the network
 *
 * From check.js: require('./fake-tv/ha.js')(port, token, tls) gives the server, with
 * .states to change, .calls made to it, and .hang to stop answering.
 */
'use strict';
var http = require('http');
var https = require('https');

module.exports = function (port, token, tls, host) {
  var states = {
    'sensor.patio': { state: '21.5', attributes: { unit_of_measurement: '°C', friendly_name: 'Patio' } },
    'light.sala': { state: 'off', attributes: { friendly_name: 'Luce sala' } },
    'switch.presa': { state: 'on', attributes: { friendly_name: 'Presa' } },
    'scene.sera': { state: '2026-10-30T20:00:00+00:00', attributes: { friendly_name: 'Sera' } },
    'binary_sensor.porta': { state: 'unavailable', attributes: { friendly_name: 'Porta' } }
  };
  function handle(req, res) {
    if (server.hang) return; // connects, never answers
    var body = '';
    req.on('data', function (d) { body += d; });
    req.on('end', function () {
      server.calls.push({ method: req.method, url: req.url, auth: req.headers.authorization, body: body });
      var reply = function (code, o) {
        res.writeHead(code, { 'Content-Type': typeof o === 'string' ? 'text/plain' : 'application/json' });
        res.end(typeof o === 'string' ? o : JSON.stringify(o));
      };
      if (req.headers.authorization !== 'Bearer ' + token) return reply(401, '401: Unauthorized');
      var m = /^\/api\/(states(?:\/([a-z0-9_.]+))?|services\/([a-z0-9_]+)\/([a-z0-9_]+))?\/?$/.exec(req.url);
      if (!m) return reply(404, '404: Not Found');
      var all = Object.keys(states).map(function (id) { return { entity_id: id, state: states[id].state, attributes: states[id].attributes }; });
      if (req.method === 'GET' && !m[1]) return reply(200, { message: 'API running.' });
      if (req.method === 'GET' && m[1] === 'states') return reply(200, all);
      if (req.method === 'GET' && m[2]) {
        var e = states[m[2]];
        return e ? reply(200, { entity_id: m[2], state: e.state, attributes: e.attributes }) : reply(404, { message: 'Entity not found.' });
      }
      if (req.method === 'POST' && m[3]) {
        var id = (JSON.parse(body || '{}')).entity_id, s = states[id];
        if (!s) return reply(400, { message: 'Entity not found.' });
        if (m[4] === 'toggle') s.state = s.state === 'on' ? 'off' : 'on';
        return reply(200, [{ entity_id: id, state: s.state, attributes: s.attributes }]);
      }
      reply(405, '405: Method Not Allowed');
    });
  }
  var server = tls ? https.createServer(tls, handle) : http.createServer(handle);
  server.states = states;
  server.calls = [];
  server.hang = false;
  server.listen(port, host || '127.0.0.1');
  return server;
};

if (require.main === module) {
  var port = +process.argv[2] || 8123;
  module.exports(port, process.argv[3] || 'fake-token-for-lightkeeper', null, process.argv[4]);
  console.log('fake Home Assistant on http://' + (process.argv[4] || '127.0.0.1') + ':' + port);
}

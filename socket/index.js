// socket/index.js

// private
var debug = require('debug')
var debugWebRDP = require('debug')('WebRDP')
var rdp = require('node-rdpjs');
var termCols, termRows

// public
module.exports = function socket (socket) {
  // if websocket connection arrives without an express session, kill it
  if (!socket.request.session) {
    socket.emit('401 UNAUTHORIZED')
    debugWebRDP('SOCKET: No Express Session / REJECTED')
    socket.disconnect(true)
    return
  }
  socket.on('connection', function(client) {
    var rdpClient = null;
    client.on('infos', function (infos) {
      if (rdpClient) {
        // clean older connection
        rdpClient.close();
      };
      rdpClient = rdp.createClient({
        domain : 'f5lab',
        userName : 'administrator',
        password : 'pass@word1',
        enablePerf : true,
        autoLogin : true,
        screen : infos.screen,
        locale : infos.locale,
        logLevel : process.argv[2] || 'INFO'
      }).on('connect', function () {
        client.emit('rdp-connect');
      }).on('bitmap', function(bitmap) {
        client.emit('rdp-bitmap', bitmap);
      }).on('close', function() {
        client.emit('rdp-close');
      }).on('error', function(err) {
        client.emit('rdp-error', err);
      }).connect(infos.ip, infos.port);
    }).on('mouse', function (x, y, button, isPressed) {
      if (!rdpClient)  return;

      rdpClient.sendPointerEvent(x, y, button, isPressed);
    }).on('wheel', function (x, y, step, isNegative, isHorizontal) {
      if (!rdpClient) {
        return;
      }
      rdpClient.sendWheelEvent(x, y, step, isNegative, isHorizontal);
    }).on('scancode', function (code, isPressed) {
      if (!rdpClient) return;

      rdpClient.sendKeyEventScancode(code, isPressed);
    }).on('unicode', function (code, isPressed) {
      if (!rdpClient) return;

      rdpClient.sendKeyEventUnicode(code, isPressed);
    }).on('disconnect', function() {
      if(!rdpClient) return;

      rdpClient.close();
    });
  });
}
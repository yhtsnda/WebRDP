var rdp = require('node-rdpjs')
var fs = require('fs')
var base64Img = require('base64-img')
var rle = require('rle')
var rdprle = require('../rle.js')

  /**
   * decompress bitmap from RLE algorithm
   * @param bitmap  {object} bitmap object of bitmap event of node-rdpjs
   */
  function decompress (bitmap) {
    var fName = null;
    switch (bitmap.bitsPerPixel) {
    case 15:
      fName = 'bitmap_decompress_15';
      break;
    case 16:
      fName = 'bitmap_decompress_16';
      break;
    case 24:
      fName = 'bitmap_decompress_24';
      break;
    case 32:
      fName = 'bitmap_decompress_32';
      break;
    default:
      throw 'invalid bitmap data format';
    }

    var input = new Uint8Array(bitmap.data);
    var inputPtr = rdprle._malloc(input.length);
    var inputHeap = new Uint8Array(rdprle.HEAPU8.buffer, inputPtr, input.length);
    inputHeap.set(input);

    var output_width = bitmap.destRight - bitmap.destLeft + 1;
    var output_height = bitmap.destBottom - bitmap.destTop + 1;
    var ouputSize = output_width * output_height * 4;
    var outputPtr = rdprle._malloc(ouputSize);

    var outputHeap = new Uint8Array(rdprle.HEAPU8.buffer, outputPtr, ouputSize);

    var res = rdprle.ccall(fName,
      'number',
      ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
      [outputHeap.byteOffset, output_width, output_height, bitmap.width, bitmap.height, inputHeap.byteOffset, input.length]
    );

    var output = new Uint8ClampedArray(outputHeap.buffer, outputHeap.byteOffset, ouputSize);

    rdprle._free(inputPtr);
    rdprle._free(outputPtr);

    return { width : output_width, height : output_height, data : output };
  }

  /**
   * Un compress bitmap are reverse in y axis
   */
  function reverse (bitmap) {
    return { width : bitmap.width, height : bitmap.height, data : new Uint8ClampedArray(bitmap.data) };
  }


/**
 * Create proxy between rdp layer and socket io
 * @param server {http(s).Server} http server
 */
module.exports = function (socket) {
  // if websocket connection arrives without an express session, kill it
  if (!socket.request.session) {
    socket.emit('401 UNAUTHORIZED')
    console.log('SOCKET: No Express Session / REJECTED')
    socket.disconnect(true)
    return
  }
  var rdpClient = null
  var screenBuff = null

  socket.on('infos', function (infos) {
    if (rdpClient) {
        // clean older connection
      rdpClient.close()
    }

    rdpClient = rdp.createClient({
      domain: socket.request.session.rdpdomain,
      userName: socket.request.session.username,
      password: socket.request.session.userpassword,
      enablePerf: true,
      autoLogin: true,
      screen: infos.screen,
      locale: infos.locale,
      logLevel: process.argv[2] || 'INFO'
    }).on('connect', function () {
      socket.emit('rdp-connect')
    }).on('bitmap', function (bitmap) {
      screenBuff = bitmap
      socket.emit('rdp-bitmap', bitmap)
    }).on('close', function () {
      socket.emit('rdp-close')
    }).on('error', function (err) {
      socket.emit('rdp-error', err)
    }).connect(socket.request.session.host, 3389)
  }).on('mouse', function (x, y, button, isPressed) {
    if (!rdpClient) return
    if(isPressed) {
      //console.log(screenBuff);
      var rleDecomp = decompress(screenBuff)
      var base64Encoded = new Buffer(new Uint8Array(rleDecomp)).toString('base64');
      //console.log(base64Encoded)
      //var screenshot = fs.writeFile('./tesfile.png', base64Encoded, function (error) { })
      socket.emit('screencap')
    }
    rdpClient.sendPointerEvent(x, y, button, isPressed)
  }).on('savescreen', function (screen) {
    if (!rdpClient) return
      var newDate = new Date();
      var screenCapDate = parseInt(newDate.getMonth()+1)+'-'+newDate.getDate()+'-'+newDate.getFullYear()+'-'+newDate.getTime()
      //var screenshot = fs.writeFile('./' + screenCapDate + '-' + socket.request.session.username + '.jpg', screen, function (error) { })
      var screenCapDate = base64Img.img(screen, './', screenCapDate + '-' + socket.request.session.username, function(err, filepath) {})
  }).on('wheel', function (x, y, step, isNegative, isHorizontal) {
    if (!rdpClient) {
      return
    }
    rdpClient.sendWheelEvent(x, y, step, isNegative, isHorizontal)
  }).on('scancode', function (code, isPressed) {
    if (!rdpClient) return
    rdpClient.sendKeyEventScancode(code, isPressed)
  }).on('unicode', function (code, isPressed) {
    if (!rdpClient) return

    rdpClient.sendKeyEventUnicode(code, isPressed)
  }).on('disconnect', function () {
    if (!rdpClient) return

    rdpClient.close()
  })
}

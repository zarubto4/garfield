
const path = require("path");
const becki = require(path.resolve('/home/grayfoox/garfield/dist/communication/serial/beckiHandler.js'));


const serial = require('serialport');

const connectBtn = document.getElementById('connect-serial');
const disconnectBtn = document.getElementById('disconnect-serial');
const pingBtn = document.getElementById('ping-serial');
const websocketBtn = document.getElementById('websocket-start');

let myBecki = new becki.beckiCom();

connectBtn.addEventListener('click', function () { });
disconnectBtn.addEventListener('click', function () { });
pingBtn.addEventListener('click', function () {
  myBecki.sendWebSocketMessage({
    message_id: "kkk",
    message_channel: "garfield",
    message_type: "string"
  })
});
websocketBtn.addEventListener('click', () => { myBecki.connectWebSocket() });
serial.list((err, ports) => {

  console.log('ports', ports);
})

const path = require("path");
const becki = require(path.resolve('/home/grayfoox/garfield/dist/communication/beckiHandler.js')); //TODO bude třeba přepsat
const usbhand = require(path.resolve('/home/grayfoox/garfield/dist/communication/usbHandler.js')); //TODO bude třeba přepsat

const serial = require('serialport');

const connectBtn = document.getElementById('connect-serial');
const disconnectBtn = document.getElementById('disconnect-serial');
const pingBtn = document.getElementById('ping-serial');
const websocketBtn = document.getElementById('websocket-start');

let myBecki = new becki.beckiCom();
let usb = new usbhand.usbHander();

connectBtn.addEventListener('click', function () { 
usb.refresh();

});
disconnectBtn.addEventListener('click', function () { });
pingBtn.addEventListener('click', function () {

  myBecki.sendWebSocketMessage(new becki.wsMesseageDeviceConnect("karel"));

  myBecki.sendWebSocketMessage(new becki.wsMesseageDeviceDisconnect("kaprisone"));
});
websocketBtn.addEventListener('click', () => { myBecki.connectWebSocket() });
serial.list((err, ports) => {

  console.log('ports', ports);
})
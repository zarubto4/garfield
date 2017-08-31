
import { Serial } from '../communication/serial/SerialHandler';

const serial = require('serialport');

const connectBtn = document.getElementById('connect-serial');
const disconnectBtn = document.getElementById('disconnect-serial');
const pingBtn = document.getElementById('ping-serial');

connectBtn.addEventListener('click', Serial.connect);
disconnectBtn.addEventListener('click', Serial.disconnect);
pingBtn.addEventListener('click', Serial.ping);


serial.list((err, ports) => {

  console.log('ports', ports);
})
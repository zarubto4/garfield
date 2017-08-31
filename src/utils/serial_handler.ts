
import { SerialMessage } from './SerialMessage'


const serial = require('serialport')
require('./serial_handler.js');

var connect_serial = document.getElementById('connect-serial');
var disconnect_serial = document.getElementById('disconnect-serial');
var ping_serial = document.getElementById('ping-serial');

var connection_id;
var message_buffer = "";

var message_map = new Map();


// ###################################
// ######## SERIAL HANDLER ###########
// ###################################

connect_serial.addEventListener('click', connect);
disconnect_serial.addEventListener('click', disconnect);
ping_serial.addEventListener('click', ping);

function uploadBinary() {

    // Tady bude náhrátí souboru přes USB
}

// Tady přijmu odpověď
chrome.serial.onReceive.addListener(function (data) {
    console.log("Message received - connectionId: " + data.connectionId + " data: " + JSON.stringify(data.data));
    console.log(data.data);

    var msg = convertArrayBufferToString(data.data);

    console.log("Parsed message = " + msg);

    message_buffer += msg;

    console.log("Message buffer = " + message_buffer);

    if (message_buffer.indexOf("\r\n") !== -1) { // if \r\n is present

        console.log("Message is complete");

        var message = message_buffer.substring(0, message_buffer.indexOf("\r\n")); // retrieving message before CRLF

        message_buffer = message_buffer.substring(message_buffer.indexOf("\r\n") + 2); // + 2 because "\r\n" are two chars which have to be excluded 

        console.log("Message buffer after message extraction = " + message_buffer);

        onMessage(data.connectionId, message);
    }
});

function onMessage(connectionId, message) {

    console.log("Doing something on message = " + message);

    // Every action for incoming messages should be here
    switch (message) {
        case "ping": connection_id = connectionId; break;
        default: console.error("Unknown message = " + message); break;
    }
}

function send(message) {
    send(connection_id, message);
}

function send(connectionId, msg) {

    console.log("Sending message = " + msg);

    chrome.serial.send(connectionId, convertStringToArrayBuffer(msg + "\r\n"), function (sendInfo) {
        console.log(sendInfo.bytesSent + " byte(s) sent");

        var message;
        var message_type = messageType(msg);

        if (message_map.has(message_type)) {
            message = message_map.get(message_type);
            message.retries = message.retries() - 1;

            message_map.delete(message_type)

            if (message.retries > 0) {
                message_map.set(message_type, message);
            }
        } else {
            message = new SerialMessage(msg, 3);
            message_map.set(message_type, message);
        }        
    });
}

function messageType(message) {
    if (message.indexOf("=") !== -1) {
        message = message.substring(0, message.indexOf("="));
    }

    console.log(message);

    return message;
}

// Vezme string znak po znaku a přidá ho do ArrayBufferu
function convertStringToArrayBuffer(str) {
    var buf = new ArrayBuffer(str.length);
    var bufView = new Uint8Array(buf);
    for (var i = 0; i < str.length; i++) {
        bufView[i] = str.charCodeAt(i);
        console.log("Converting string char = " + str[i] + " - " + str.charCodeAt(i));
    }
    return buf;
}

function convertArrayBufferToString(buf) {
    return String.fromCharCode.apply(null, new Uint8Array(buf));
}

// Vytvoří sériové spojení
function connect() {

    console.log("Connecting - getting all devices")

    chrome.serial.getDevices(function (serial_devices) {

        for (var i = 0; i < serial_devices.length; i++) {

            console.log("Connecting - trying to connect to device = " + JSON.stringify(serial_devices[i]));

            if (connection_id) break;

            // path je například COM4 (Win)
            chrome.serial.connect(serial_devices[i].path, {}, function (connectionInfo) {

                if (!chrome.runtime.lastError) {

                    console.log("Connected - info = " + JSON.stringify(connectionInfo));

                    setTimeout(function(){
                        send(connectionInfo.connectionId, "ping");
                    }, 2000); // Waits 2s for proper connection initialization

                } else {

                    console.warn("Cannot connect - " + chrome.runtime.lastError.message);
                }
            });
        }
    });
}

// Odpojí zařízení
function disconnect() {
    chrome.serial.disconnect(connection_id, function (result) {

        if (result) {
            console.log("Connection " + connection_id + " closed ");
            connection_id = null;
        } else {
            console.log("Connection " + connection_id + " failed to close ");
        }

    });
}

function ping() {

    if (connection_id) {
        send("ping");
    }
}
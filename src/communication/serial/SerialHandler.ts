import { Logger, LoggerManager, LoggerLevel, LoggerFileTarget } from 'logger'
import { SerialMessage } from './SerialMessage'
import * as SerialPort from 'serialport'
import { EventEmitter } from 'events'

//let connection :SerialPort
let message_buffer :string

var message_map = new Map()

//const serial = require('serialport/test')

//const MockBinding = serial.Binding

export class Serial extends EventEmitter {

    private connection :SerialPort = null
    private parser :SerialPort.parsers.Readline

    constructor(callback){
        super()
        this.connect(callback)
    }
    
    public connect(callback){

        //MockBinding.createPort('COM1', { echo: true, record: true })

        let opened_connections :SerialPort[] = [] // Reference for all opened connections

        SerialPort.list((err, ports) => {

            Logger.info("Connecting - Getting all devices")

            if (err) {
                Logger.error(err)
                callback(err)
            }

            console.log('ports', ports)

            ports.forEach((port :any) => {
                
                Logger.info("Connecting - Trying port = " + JSON.stringify(port))
                
                let temp_connection :SerialPort = new SerialPort(port.comName, {baudRate: 115200, rtscts: true}, (err :any) => {
                    if (err) {
                        Logger.error(err)
                        callback(err)
                    } else {
                        Logger.info("Connected to " + temp_connection.path)
                        opened_connections.push(temp_connection)
                        setTimeout(() => {
                            Logger.info("Sending ping to " + temp_connection.path)
                            temp_connection.flush()
                            temp_connection.write("ping\r\n")
                        }, 1500)
                    }
                })

                let temp_parser = temp_connection.pipe(new SerialPort.parsers.Readline({ delimiter: '\n' })) // parser which emits data, when the delimiter is received

                temp_parser.on('data', (data: any) => { // temporary listener for connecting

                    let message :string = data.toString() 

                    Logger.info("Received data = " + message + " from " + temp_connection.path)

                    if (message === "ping=ok") {
                        Logger.info("Found Yoda - keeping connection on " + temp_connection.path)
                        temp_connection.removeAllListeners('data') // removing temporary listener
                        this.connection = temp_connection
                        this.parser = this.connection.pipe(new SerialPort.parsers.Readline({ delimiter: '\n' }))
                        this.parser.on('data', (data) => {
                            if (!data.startsWith("*")){
                                this.emit("message", data)
                            }
                        })
                        opened_connections.forEach((conn) => { // closing unnecesary connections
                            if (conn.path !== this.connection.path) {
                                conn.close(() => {
                                    Logger.info("Disconnected wrong device on " + conn.path)
                                    opened_connections.splice(conn)
                                })
                            }
                        })
                        callback()
                    }
                })
            })
        })
    }

    public disconnect(callback){

        Logger.info("Disconnecting Yoda")

        this.connection.close(() => {
            Logger.info("Yoda disconnected")
            this.connection = null
            callback()
        })

    }

    public send(message :string){
        Logger.info("Sending message = " + message)
        if (this.connection) {
            this.connection.write(message + "\r\n")
        }    
    }
        

    public ping(){
        Logger.info("Sending ping")
        this.send("ping")
    }

    public isOpen() :boolean{
        return this.connection != null && this.connection.isOpen
    }

    public static getMessageType(message: string): string {
        if (message.includes("=")) {
            return message.substring(0, message.indexOf("="))
        }
        return message;
    }

    public static getMessageValue(message: string): string {
        if (message.includes("=")) {
            return message.substring(message.indexOf("=") + 1)
        }
        return message;
    }
}

/*
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

function send(message :string) :void {
    send(connection_id, message);
}

function send(connectionId :number, msg :string) :void {

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
*/
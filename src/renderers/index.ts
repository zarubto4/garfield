// import { ipcRenderer } from 'electron'
import { BeckiCom, WsMessageDeviceConnect, WsMessageDeviceDisconnect } from '../communication/beckiHandler';
import { ipcRenderer }  from 'electron';

const pingBtn = document.getElementById('ping');
const websocketBtn = document.getElementById('websocket-start');

let myBecki = new BeckiCom();

document.getElementById('link-configuration').addEventListener('click', () => {
    ipcRenderer.send('window', 'configuration');
});

pingBtn.addEventListener('click', function () {

    myBecki.sendWebSocketMessage(new WsMessageDeviceConnect('karel'));

    myBecki.sendWebSocketMessage(new WsMessageDeviceDisconnect('kaprisone'));
});
websocketBtn.addEventListener('click', () => { myBecki.connectWebSocket(); });

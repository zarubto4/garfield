// import { ipcRenderer } from 'electron'
import { Becki, WsMessageDeviceConnect, WsMessageDeviceDisconnect } from '../communication/Becki';
import { ipcRenderer }  from 'electron';

const pingBtn = document.getElementById('ping');
const websocketBtn = document.getElementById('websocket-start');

let myBecki = new Becki(ipcRenderer.sendSync('requestData'));

document.getElementById('link-configuration').addEventListener('click', () => {
    ipcRenderer.send('window', 'configuration');
});

pingBtn.addEventListener('click', function () {

    myBecki.sendWebSocketMessage(new WsMessageDeviceConnect('karel'));

    myBecki.sendWebSocketMessage(new WsMessageDeviceDisconnect('kaprisone'));
});
websocketBtn.addEventListener('click', () => { myBecki.connectWebSocket(); });

// import { ipcRenderer } from 'electron'

const { ipcRenderer } = require('electron');

document.getElementById('link-configuration').addEventListener('click', () => {
    ipcRenderer.send('window', 'configuration');
});

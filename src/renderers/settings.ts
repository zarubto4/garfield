import { ipcRenderer } from 'electron';

const editor: HTMLTextAreaElement = <HTMLTextAreaElement>document.getElementById('editor');
const settings: HTMLFormElement = <HTMLFormElement>document.getElementById('settings');
const reset: HTMLButtonElement = <HTMLButtonElement>document.getElementById('reset');

editor.value = ipcRenderer.sendSync('get_settings');

editor.addEventListener('submit', function(event) {
    event.preventDefault();
    return false;
});

clear.addEventListener('click', (event) => {
    event.preventDefault();
    output.value = '';
});

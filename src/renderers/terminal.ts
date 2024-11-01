import { ipcRenderer } from 'electron';

const terminal_input: HTMLInputElement = <HTMLInputElement>document.getElementById('terminal_input');
const output: HTMLTextAreaElement = <HTMLTextAreaElement>document.getElementById('output');
const terminal: HTMLElement = <HTMLElement>document.getElementById('terminal');
const clear: HTMLButtonElement = <HTMLButtonElement>document.getElementById('clear');

let autoScroll: boolean = true;

terminal.addEventListener('submit', function(event) {
    event.preventDefault();
    let input = terminal_input.value;
    if (input) {
        ipcRenderer.send('terminal', input);
        if (!output.value) {
            output.value = '';
        }
        output.value += input + '\n';
    }
    return false;
});

clear.addEventListener('click', (event) => {
    event.preventDefault();
    output.value = '';
});

output.addEventListener('scroll', (event) => {
    autoScroll = output.scrollHeight - output.scrollTop < output.clientHeight + 20;
});

ipcRenderer.on('terminal', (event, line) => {
    if (!output.value) {
        output.value = '';
    }
    output.value += '=> ' + line + '\n';
    if (autoScroll) {
        output.scrollTop = output.scrollHeight;
    }
});

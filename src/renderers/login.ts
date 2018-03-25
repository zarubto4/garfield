// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.

const request = require('request');
import { ipcRenderer } from 'electron';

const form: HTMLElement = document.getElementById('login');

let email: string;
let password: string;
let remember: boolean;

form.addEventListener('submit', function(event) {

    event.preventDefault();

    email = (<HTMLInputElement>document.getElementById('mail')).value;
    password = (<HTMLInputElement>document.getElementById('password')).value;
    remember = true;

    if (email || password) {

        let senderBody = {
            email: email,
            password: password
        };

        request({
            method: 'POST',
            uri: ipcRenderer.sendSync('tyrionUrl') + '/login',
            body: senderBody,
            json: true,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'garfield-app'
            }
        }, function(error, response, body) {

            if (error) {

            } else {

                if (response.statusCode !== 200) {
                    alert('Error: status = ' + body.code + ' response = ' + body.message);
                } else {
                    ipcRenderer.send(remember ? 'login_remember' : 'login', body.auth_token);
                }
            }
        });
    }

    return false;
});

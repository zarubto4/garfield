// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.

import { Logger, LoggerManager, LoggerLevel, LoggerFileTarget } from 'logger'

const request = require('request')
const {ipcRenderer} = require('electron')

const form :HTMLElement = document.getElementById('login')

let mail :string
let password :string

form.addEventListener('submit', function(event){

  event.preventDefault()

  mail = (<HTMLInputElement>document.getElementById('mail')).value
  password = (<HTMLInputElement>document.getElementById('password')).value
	
	if (mail || password) {

  		let body = {
   		  mail: mail,
     	  password: password
    	}

      request({
        method: 'POST',
        uri: ipcRenderer.sendSync('tyrionUrl') + '/login',
        body: body,
        json: true,
        headers: { 
          'Content-Type': 'application/json',
          'User-Agent': 'garfield-app'
        }
      }, function(error, response, body){

        if(error) {

        } else {

          if (response.statusCode !== 200) {
            alert('Error: status = ' + body.code + ' response = ' + body.message)
          } else {
            ipcRenderer.send('login', body.authToken)
          }
        }
        
        console.log(body)
      })
	}

	return false
})
import { DeviceConfigurator } from '../utils/DeviceConfigurator'
import { Logger } from 'logger'
const { ipcRenderer } = require('electron')

const connectBtn :HTMLButtonElement = <HTMLButtonElement>document.getElementById('connect');
const pingBtn = document.getElementById('ping');
const sendMsg = document.getElementById('send-message')
const sendBtn = document.getElementById('send')
const configureBtn = document.getElementById('configure')
const output :HTMLInputElement = <HTMLInputElement>document.getElementById('output')

let connected :boolean = false

let configurator :DeviceConfigurator

connectBtn.addEventListener('click', () => {

	if (!configurator) {
		configurator = new DeviceConfigurator()
		configurator.connect((err) => {

			if (err) {
				output.value += err.message + "\n"
				configurator = null
			} else {
				connectBtn.innerText = "Disconnect"
				toggleButtonDisable(false)
			}

		}, (message) => {
			output.value += message + "\n"
		})
	} else if (configurator.connection.isOpen()) {
		configurator.disconnect(() => {
			configurator = null
			connectBtn.innerText = "Connect"
			toggleButtonDisable(true)
		})
	}
})

configureBtn.addEventListener('click', () => {
	configurator.beginConfiguration(() => {
		output.value += "Configuration is complete"
	})
})

pingBtn.addEventListener('click', () => {
	configurator.ping()
});

sendMsg.addEventListener('submit', (event) => {
	event.preventDefault()

	if (configurator && configurator.connection.isOpen()) {
		configurator.send((<HTMLInputElement>document.getElementById('message')).value)
	}

	return false
})

document.getElementById('clear').addEventListener('click', () => {
	output.value = ""
})

document.getElementById('link-index').addEventListener('click', () => {
	ipcRenderer.send('window','home')
})

function toggleButtonDisable(disabled :boolean) {
	if (disabled) {
		pingBtn.setAttribute('disabled', 'disabled')
		sendBtn.setAttribute('disabled', 'disabled')
		configureBtn.setAttribute('disabled', 'disabled')
	} else {
		pingBtn.removeAttribute('disabled')
		sendBtn.removeAttribute('disabled')
		configureBtn.removeAttribute('disabled')
	}
}


import { Serial } from '../communication/serial/SerialHandler'
import { Logger } from 'logger'
import { EventEmitter } from 'events'
import { Queue } from './Queue'

export class DeviceConfigurator extends EventEmitter {

	public connection :Serial
	public messageCallback :any
	public queue :Queue<string>

	private config :any = {
		normal_mqtt_hostname: "dummy_host",
		normal_mqtt_port: "80",
		normal_mqtt_username: "dummy_username",
		normal_mqtt_password: "dummy_password",
		backup_mqtt_hostname: "dummy_b_host",
		backup_mqtt_port: "8080",
		backup_mqtt_username: "dummy_b_username",
		backup_mqtt_password: "dummy_b_password"
	}

	public connect(connectionCallback, messageCallback) {
		this.connection = new Serial((err) => {

			if (err) {
				connectionCallback(err)
			}

			Logger.info("Device is connected")
			this.connection.on('message', (message) => {
				Logger.info("DeviceConfigurator got this message = " + message)
				messageCallback(message)
			})
			connectionCallback()
		})
	}

	public beginConfiguration(callback) {
		if (this.connection) {

			this.queue = new Queue<string>()

			for (const key of Object.keys(this.config)) {
				this.queue.push(key)
			}

			this.configure(this.queue.getTop())

			this.connection.on('message', (message) => {
				Logger.info("DeviceConfigurator got response on configure = " + message)
				
				let type: string = Serial.getMessageType(message)
				let value: string = Serial.getMessageValue(message)

				if (this.config[type] !== value) {
					this.configure(this.queue.getTop())
				} else {
					this.queue.pop()
					if (this.queue.isEmpty()) {
						callback()
					}
					this.configure(this.queue.getTop())
				}
			})
		}
	}

	private configure(property: string) {
		this.send(property + "=" + this.config[property])
	}

	public send(message :string) {
		if (this.connection) {
			this.connection.send(message)
		}
	}

	public disconnect(callback) {
		if (this.connection) {
			this.connection.disconnect(callback)
		}
	}

	public ping(){
		if (this.connection) {
			this.connection.ping()
		}
	}
}
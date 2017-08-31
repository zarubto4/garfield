
export class SerialMessage {

	constructor(message, retries){
		this.message = message;
		this.retries = retries;
	}

	get message(){
		return this.message;
	}

	get retries(){
		return this.retries;
	}

	get response(){
		return this.response;
	}
}
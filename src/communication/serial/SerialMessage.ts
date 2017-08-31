
export class SerialMessage {

	constructor(message :string, retries :number){
		this.messageInstance = message;
		this.retriesInstance = retries;
	}

	get message() :string{
		return this.messageInstance;
	}

	get retries(){
		return this.retriesInstance;
	}

	get response(){
		return this.response;
	}

	protected messageInstance :string;
	protected retriesInstance :number;
	protected responseInstance :string;
}
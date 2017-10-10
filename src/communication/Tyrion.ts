import * as rp from 'request-promise';

export class Tyrion {

	constructor(token: string, protocol: string, host: string) {
		this.token = token;
		this.protocol = protocol;
		this.host = host;
	}

	public get(path: string) {
		return rp({
			method: 'GET',
			uri: this.protocol + this.host + path,
			json: true,
			headers: {
				'X-AUTH-TOKEN': this.token,
				'User-Agent': 'garfield-app'
			}
		});
	}

	private protocol: string;
	private host: string;
	private token: string;
}
// harmony api
import { Logger } from "homebridge";
export class AnekolHarmonyApi {

    private readonly host: string
    private readonly log: Logger
    private readonly port: string
    private axios = require('axios')

    constructor(log: Logger, host: string, port: string) {
        this.log = log
        this.host = host;
        this.port = port;
    }

    // get
    public async get(suffix: string) {
        return await this._axios('get', suffix)
    }

    // put
    public async put(suffix: string, repeat: number = 1) {
        let n = repeat
        while (0 < n) {
            await this._axios('put', suffix)
            n = n - 1
        }
    }

    //post
    public async post(suffix: string, repeat: number = 1) {
        let n = repeat
        while (0 < n) {
            await this._axios('post', suffix)
            n = n - 1
        }
    }

    async _axios(method: string, suffix: string) {
        let url: string = 'http://' + this.host + ":" + this.port + "/hubs/" + suffix
        try {
            this.log.debug("Axios: method: " + method + " url: " + url)
            let resp = await this.axios({ method: method, url: url });
            return resp.data
        } catch (error) {
            this.log.error("HarmonyApi url: " + url + " : " + error);
            return { data: {} }
        }
    }
}
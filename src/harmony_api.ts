// harmony api
import { Logger } from "homebridge";
export class AnekolHarmonyApi {

    private readonly host: string
    private readonly log: Logger
    private readonly port: string
    private readonly verboseLog: boolean
    private axios = require('axios')

    constructor(log: Logger, host: string, port: string, verboseLog: boolean) {
        this.log = log
        this.host = host;
        this.port = port;
        this.verboseLog = verboseLog
    }

    // get
    public async get(suffix: string) {
        return await this._axios('get', suffix)
    }

    // put
    public async put(suffix: string, repeat = 1) {
        let n = repeat
        while (0 < n) {
            await this._axios('put', suffix)
            n = n - 1
        }
    }

    //post
    public async post(suffix: string, repeat = 1) {
        let n = repeat
        while (0 < n) {
            await this._axios('post', suffix)
            n = n - 1
        }
    }

    private async _axios(method: string, suffix: string) {
        const url: string = 'http://' + this.host + ":" + this.port + "/hubs/" + suffix
        try {
            if (this.verboseLog)
                this.log.info("Axios: method: " + method + " url: " + url)
            const resp = await this.axios({ method: method, url: url });
            return resp.data
        } catch (error) {
            this.log.error("HarmonyApi url: " + url + " : " + error);
            return { data: {} }
        }
    }
}
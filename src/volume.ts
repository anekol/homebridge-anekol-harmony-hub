// class to provide a Harmony Hub volume accessory helper
import { CharacteristicGetCallback, CharacteristicSetCallback, CharacteristicValue, HAP, HAPStatus, Logger, PlatformAccessory, Service } from "homebridge";
import { AnekolHarmonyApi } from "./harmony_api"
import { AnekolHarmonyHub, Hub } from "./index"

const VOLUME_COMMAND_REPEAT_FACTOR = 5
const VOLUME_TURNOFF_DELAY = 30000 // 30sec
const DEFAULT_VOLUME = 50

export class AnekolHarmonyHubVolumeHelper {
	private hap: HAP
	private log: Logger
	private off = 0

	// constructor
	constructor(
		private readonly platform: AnekolHarmonyHub,
		private readonly accessory: PlatformAccessory,
		private readonly harmony_api: AnekolHarmonyApi,
		private readonly hub: Hub,
		private readonly verboseLog: boolean
	) {
		this.hap = this.platform.api.hap
		this.log = this.platform.log

		// configure the information service
		accessory.getService(this.hap.Service.AccessoryInformation) ||
			accessory.addService(this.hap.Service.AccessoryInformation)
				.setCharacteristic(this.hap.Characteristic.Manufacturer, 'Anekol')
				.setCharacteristic(this.hap.Characteristic.Model, 'HarmonyHub')

		// configure the lightbulb/volume service
		const service = this.accessory.getService(this.hap.Service.Lightbulb) ||
			this.accessory.addService(this.hap.Service.Lightbulb)
		service.getCharacteristic(this.hap.Characteristic.On)
			.on('get', this.getVolumeOn.bind(this))
			.on('set', this.setVolumeOn.bind(this, this.hub.slug))
		service.getCharacteristic(this.hap.Characteristic.Brightness)
			.on('get', this.getVolume.bind(this, this.hub.slug))
			.on('set', this.setVolume.bind(this, this.hub.slug, service))


		this.platform.api.updatePlatformAccessories([accessory])
	}

	// get mute
	private getMute(callback: CharacteristicGetCallback) {
		callback(HAPStatus.SUCCESS, false);
	}

	// set mute
	private setMute(value: CharacteristicValue, callback: CharacteristicSetCallback) {
		callback(HAPStatus.SUCCESS);
	}
	// get volume on
	private async getVolumeOn(callback: CharacteristicGetCallback) {
		if (this.verboseLog)
			this.log.info('Get Volume On: ' + false);
		callback(HAPStatus.SUCCESS, false);
	}

	// // set volume on
	private async setVolumeOn(hub_slug: string, on: CharacteristicValue, callback: CharacteristicSetCallback) {
		const data = await this.status(hub_slug)
		if (data.off) {
			if (this.verboseLog)
				this.log.info('Set Volume On: not allowed - hub is off');
			callback(HAPStatus.READ_ONLY_CHARACTERISTIC)
		} else {
			if (this.verboseLog)
				this.log.info('Set Volume On: ' + on);
			callback(HAPStatus.SUCCESS);
		}
	}

	// get volume
	private async getVolume(hub_slug: string, callback: CharacteristicGetCallback) {
		const data = await this.status(hub_slug)
		const vol = data.off ? 0 : DEFAULT_VOLUME
		if (this.verboseLog)
			this.log.info('Get Volume: ' + vol);
		callback(HAPStatus.SUCCESS, vol);
	}

	// set volume
	private async setVolume(hub_slug: string, service: Service, target_volume: CharacteristicValue, callback: CharacteristicSetCallback) {
		const data = await this.status(hub_slug)
		if (data.off) {
			if (this.verboseLog)
				this.log.info('Set Volume: not allowed - hub is off');
			callback(HAPStatus.READ_ONLY_CHARACTERISTIC)
		} else {

			// if value is 0 the lightbulb will be turned off, but on next "setOn true" a value of 100 will be called for
			// in that case ignore the condition and wait for setOn to set a reasonable target
			const volume = DEFAULT_VOLUME
			const diff = target_volume as number - volume
			const command = (0 < diff) ? "volume-up" : "volume-down"
			const repeat = Math.abs(Math.round(diff / VOLUME_COMMAND_REPEAT_FACTOR))
			if (this.verboseLog)
				this.log.info('Set Volume: target: ' + target_volume + " current: " + volume + " command: " + command + " repeat: " + repeat)
			if (0 < repeat) {
				this.harmony_api.post(hub_slug + "/commands/" + command, repeat)
			}

			// update to default volume
			setTimeout((service) => {
				if (this.verboseLog)
					this.log.info('Set Volume: schedule set to default of: ' + DEFAULT_VOLUME)
				service.updateCharacteristic(this.hap.Characteristic.Brightness, DEFAULT_VOLUME);
			}, 200, service);

			// if target_volume is 0 the lightbulb will be turned off, so turn back on
			if (target_volume == 0) {
				setTimeout((service) => {
					if (this.verboseLog)
						this.log.info('Set Volume On: schedule on')
					service.updateCharacteristic(this.hap.Characteristic.On, true);
				}, 200, service);
			}

			// turn off after awhile
			this.off = new Date().getTime() + VOLUME_TURNOFF_DELAY
			setTimeout((service) => {
				const now = new Date().getTime()
				if (this.verboseLog)
					this.log.info('Set Volume On: schedule off: ' + this.off + " now: " + now)
				if (this.off < now)
					service.updateCharacteristic(this.hap.Characteristic.On, false);
			}, VOLUME_TURNOFF_DELAY, service);
			callback(HAPStatus.SUCCESS)
		}
	}
	// status
	private async status(hub_slug: string) {
		const data = await this.harmony_api.get(hub_slug + "/status")
		if (data) {
			return { off: data.off, current_activity: data.current_activity }
		} else {
			return { off: true, current_activity: 0 }
		}
	}
}
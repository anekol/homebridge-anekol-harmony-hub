// class to provide a Harmony Hub volume accessory helper

import { CharacteristicGetCallback, CharacteristicSetCallback, CharacteristicValue, HAP, Logger, PlatformAccessory, Service } from "homebridge";
import { AnekolHarmonyApi } from "./harmony_api"
import { AnekolHarmonyHub, Hub } from "./index"


const VOLUME_COMMAND_REPEAT_FACTOR = 5
const VOLUME_TURNOFF_DELAY = 30000 // 30sec
const DEFAULT_VOLUME = 50
const NO_ERRORS = null

export class AnekolHarmonyHubVolumeHelper {
	private hap: HAP
	private log: Logger
	private off: number = 0

	// constructor
	constructor(
		private readonly platform: AnekolHarmonyHub,
		private readonly accessory: PlatformAccessory,
		private readonly harmony_api: AnekolHarmonyApi,
		private readonly hub: Hub
	) {
		this.hap = this.platform.api.hap
		this.log = this.platform.log

		// configure the information service
		accessory.getService(this.hap.Service.AccessoryInformation)!
			.setCharacteristic(this.hap.Characteristic.Manufacturer, 'Anekol')
			.setCharacteristic(this.hap.Characteristic.Model, 'HarmonyHub')

		// configure the lightbulb/volume service
		let service = this.accessory.getService(this.hap.Service.Lightbulb) ||
			this.accessory.addService(this.hap.Service.Lightbulb)
		service.getCharacteristic(this.hap.Characteristic.On)
			.on('get', this.getVolumeOn.bind(this))
			.on('set', this.setVolumeOn.bind(this))
		service.getCharacteristic(this.hap.Characteristic.Brightness)
			.on('get', this.getVolume.bind(this))
			.on('set', this.setVolume.bind(this, this.hub.slug, service))

		this.platform.api.updatePlatformAccessories([accessory])
	}

	// get volume on
	private getVolumeOn(callback: CharacteristicGetCallback) {
		this.log.debug('Get Volume On: ' + false);
		callback(NO_ERRORS, false);
	}

	// set volume on
	private setVolumeOn(on: CharacteristicValue, callback: CharacteristicSetCallback) {
		this.log.debug('Set Volume On: ' + on)
		callback(NO_ERRORS);
	}

	// get volume
	private getVolume(callback: CharacteristicGetCallback) {
		this.log.debug('Get Volume: ' + DEFAULT_VOLUME);
		callback(NO_ERRORS, DEFAULT_VOLUME);
	}

	// set volume
	private async setVolume(hub_slug: string, service: Service, target_volume: CharacteristicValue, callback: CharacteristicSetCallback) {
		let data = await this.harmony_api.get(hub_slug + "/status")
		if (!data.off) { // hub is turned on

			// if value is 0 the lightbulb will be turned off, but on next "setOn true" a value of 100 will be called for
			// in that case ignore the condition and wait for setOn to set a reasonable target
			let volume = DEFAULT_VOLUME
			let diff = target_volume as number - volume
			let command = (0 < diff) ? "volume-up" : "volume-down"
			let repeat = Math.abs(Math.round(diff / VOLUME_COMMAND_REPEAT_FACTOR))
			this.log.debug('Set Volume: target: ' + target_volume + " current: " + volume + " command: " + command + " repeat: " + repeat)
			if (0 < repeat) {
				this.harmony_api.post(hub_slug + "/commands/" + command, repeat)
			}
		}

		// update to default volume
		setTimeout((service) => {
			this.log.debug('Set Volume: schedule set to default of: ' + DEFAULT_VOLUME)
			service.updateCharacteristic(this.hap.Characteristic.Brightness, DEFAULT_VOLUME);
		}, 200, service);

		// if target_volume is 0 the lightbulb will be turned off, so turn back on
		if (target_volume == 0) {
			setTimeout((service) => {
				this.log.debug('Set Volume On: schedule on')
				service.updateCharacteristic(this.hap.Characteristic.On, true);
			}, 200, service);
		}

		// turn off after awhile
		this.off = new Date().getTime() + VOLUME_TURNOFF_DELAY
		setTimeout((accessory, service) => {
			const now = new Date().getTime()
			this.log.debug('Set Volume On: schedule off: ' + this.off + " now: " + now)
			if (this.off < now)
				service.updateCharacteristic(this.hap.Characteristic.On, false);
		}, VOLUME_TURNOFF_DELAY, service);
		callback(NO_ERRORS);
	}
}
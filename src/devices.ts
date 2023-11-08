// class to provide a Harmony Hub devices accessory helper
import { CharacteristicGetCallback, CharacteristicSetCallback, CharacteristicValue, HAP, HAPStatus, Logger, PlatformAccessory, Service } from "homebridge";
import { AnekolHarmonyApi } from "./harmony_api"
import { AnekolHarmonyHub, Hub } from "./index"

export class AnekolHarmonyHubDevicesHelper {
	private hap: HAP
	private log: Logger

	// constructor
	constructor(
		private readonly platform: AnekolHarmonyHub,
		private readonly accessory: PlatformAccessory,
		private readonly harmony_api: AnekolHarmonyApi,
		private readonly hub: Hub,
		private readonly config_devices: string[],
		private readonly verboseLog: boolean
	) {
		this.hap = this.platform.api.hap
		this.log = this.platform.log

		// configure the information service
		this.accessory.getService(this.hap.Service.AccessoryInformation) ||
			this.accessory.addService(this.hap.Service.AccessoryInformation)
				.setCharacteristic(this.hap.Characteristic.Manufacturer, 'Anekol')
				.setCharacteristic(this.hap.Characteristic.Model, 'HarmonyHub')

		// remove any existing device services
		for (const s of accessory.services.filter(s => s.UUID == this.hap.Service.Switch.UUID))
			this.accessory.removeService(s)

		// add device service if no config provided or if in config list
		for (const device of this.hub.devices) {
			if (this.config_devices == null || config_devices.length == 0 ||
				config_devices.find(config_device => device.label == config_device)) {

				if (!hub.power_on.includes(device.slug) || !hub.power_off.includes(device.slug)) {
					if (this.verboseLog)
						this.log.info("Adding Device: " + device.label)
					const service = new this.hap.Service.Switch(device.label, device.slug);
					service.getCharacteristic(this.hap.Characteristic.On)
						.on('get', this.getOn.bind(this, this.hub.slug))
						.on('set', this.setOn.bind(this, this.hub.slug, service))
					this.accessory.addService(service)
					this.platform.api.updatePlatformAccessories([this.accessory])
				} else {
					if (this.verboseLog)
						this.log.info("Not Adding Device: " + device.label)
				}
			}
		}
		this.platform.api.updatePlatformAccessories([accessory])
	}

	// get on 
	private getOn(device_slug: string, callback: CharacteristicGetCallback) {
		this.log.debug('Get On: ' + device_slug);
		callback(HAPStatus.SUCCESS, false); ``
	}

	// set on
	private setOn(hub_slug: string, service: Service, value: CharacteristicValue, callback: CharacteristicSetCallback) {
		this.log.debug('Set On: ' + service.subtype + ": value: " + value);
		this.harmony_api.post(hub_slug + "/devices/" + service.subtype + "/commands/power-toggle")

		// simulate toggle by turning off in a bit
		setTimeout((service) => {
			service.updateCharacteristic(this.hap.Characteristic.On, false);
		}, 500, service);
		callback(HAPStatus.SUCCESS);
	}
}
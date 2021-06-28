// class to provide a Harmony Hub accessory helper

import { CharacteristicGetCallback, CharacteristicSetCallback, CharacteristicValue, HAP, Logger, PlatformAccessory, Service } from "homebridge";
import { AnekolHarmonyApi } from "./harmony_api";
import { AnekolHarmonyHub, Activity, Hub } from "./index"

const pollingtoevent = require("polling-to-event");
const NO_ERRORS = null
const POLL_INTERVAL = 5000
const STATE_CHANGE_SETTLE_TIME_INTERVAL = 10000

export class AnekolHarmonyHubHelper {
	private hap: HAP
	private log: Logger
	private state_change_started: number = 0

	// constructor
	constructor(
		private readonly platform: AnekolHarmonyHub,
		private readonly accessory: PlatformAccessory,
		private readonly harmony_api: AnekolHarmonyApi,
		private readonly hub: Hub,
	) {
		this.hap = this.platform.api.hap
		this.log = this.platform.log

		// configure the information service
		accessory.getService(this.hap.Service.AccessoryInformation)!
			.setCharacteristic(this.hap.Characteristic.Manufacturer, 'Anekol')
			.setCharacteristic(this.hap.Characteristic.Model, 'HarmonyHub')

		// configure the tv service
		const service = (this.accessory.getService(this.hap.Service.Television) ||
			this.accessory.addService(this.hap.Service.Television))
			.setCharacteristic(this.hap.Characteristic.SleepDiscoveryMode, this.hap.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE)
			.setCharacteristic(this.hap.Characteristic.PowerModeSelection, this.hap.Characteristic.PowerModeSelection.HIDE)
			.setCharacteristic(this.hap.Characteristic.RemoteKey, this.hap.Characteristic.RemoteKey.PLAY_PAUSE)

		// remove existing activity services
		for (var s of accessory.services.filter(s => s.UUID == this.hap.Service.InputSource.UUID)) {
			service.removeLinkedService(s)
			accessory.removeService(s)
		}

		// add activity as input source service
		for (var a of this.hub.activities) {
			if (a.isAVActivity) {
				this.log.info("Adding Activity: " + a.label)
				let is = this.new_input_source_service(a.label, a.id, a.slug)
				accessory.addService(is)
				service.addLinkedService(is)
			}
		}

		// set default activity
		const active = this.find_active_activity(service)
		if (active) {
			service.setCharacteristic(this.hap.Characteristic.ActiveIdentifier, parseInt(active.subtype as string))
		}

		// configure event handlers
		service.getCharacteristic(this.hap.Characteristic.Active)
			.on('get', this.getActive.bind(this, this.hub.slug))
			.on('set', this.setActive.bind(this, this.hub.slug, service))
		service.getCharacteristic(this.hap.Characteristic.ActiveIdentifier)
			.on('get', this.getActiveIdentifier.bind(this, this.hub.slug))
			.on('set', this.setActiveIdentifier.bind(this, this.hub.slug, service))

		// start polling the tv service
		this.startPolling(this.hub.slug, service)

		// configure the tv speaker service
		// this.log.info("Add TVS")
		// const tvs = (this.accessory.getService(this.hap.Service.TelevisionSpeaker) ||
		// 	this.accessory.addService(this.hap.Service.TelevisionSpeaker))
		// tvs.getCharacteristic(this.hap.Characteristic.Mute)
		// 	.on('get', this.getMute.bind(this))
		// 	.on('set', this.setMute.bind(this))
		// 	this.log.info("Added TVS: "+tvs.displayName)

		this.platform.api.updatePlatformAccessories([accessory])
	}


	// find activity by id
	private find_activity_by_id(service: Service, id: number) {
		for (var is of service.linkedServices) {
			if (is.UUID == this.hap.Service.InputSource.UUID)
				if (parseInt(is.subtype as string) == id)
					return is
		}
		return null
	}

	// find active activity
	private find_active_activity(service: Service) {
		let id = service.getCharacteristic(this.hap.Characteristic.ActiveIdentifier).value as number
		if (id != 0) {
			return this.find_activity_by_id(service, id)
		} else

			// not set - return first activity
			for (var is of service.linkedServices) {
				if (is.UUID == this.hap.Service.InputSource.UUID) {
					return is
				}
			}
		return null
	}

	// new input source service
	private new_input_source_service(label: string, id: string, slug: string) {
		let service = new this.hap.Service.InputSource(label, id)
		service.name = slug
		service.setCharacteristic(this.hap.Characteristic.Identifier, id)
			.setCharacteristic(this.hap.Characteristic.ConfiguredName, label)
			.setCharacteristic(this.hap.Characteristic.IsConfigured, this.hap.Characteristic.IsConfigured.CONFIGURED)
			.setCharacteristic(this.hap.Characteristic.InputSourceType, this.hap.Characteristic.InputSourceType.APPLICATION)
			.setCharacteristic(this.hap.Characteristic.CurrentVisibilityState, this.hap.Characteristic.CurrentVisibilityState.SHOWN);
		return service
	}

	// get active
	private async getActive(hub_slug: string, callback: CharacteristicGetCallback) {
		const active = (await this.status(hub_slug)).off ? 0 : 1
		this.log.debug('Get Active: ' + active);
		callback(NO_ERRORS, active);
	}

	// set active
	private async setActive(hub_slug: string, service: Service, target_active: CharacteristicValue, callback: CharacteristicSetCallback) {
		const active = (await this.status(hub_slug)).off ? 0 : 1
		this.log.debug("Set Active: target active: " + target_active + " current active: " + active)
		if (target_active != active) {
			this.state_change_started = new Date().getTime()
			if (target_active == 1) {
				const is = this.find_active_activity(service)
				if (is) this.power_on(hub_slug, is.name as string)
			} else {
				this.power_off(hub_slug)
			}
		}
		callback(NO_ERRORS);
	}

	// get active identifier
	private getActiveIdentifier(hub_slug: string, callback: CharacteristicGetCallback) {
		this.status(hub_slug).then(status => {
			const value = status.current_activity.id
			// if hub is off current activity id is reported as -1
			callback(NO_ERRORS, value < 0 ? 0 : value)
		})
	}

	// set active identifier
	private setActiveIdentifier(hub_slug: string, service: Service, value: CharacteristicValue, callback: CharacteristicSetCallback) {
		this.log.debug('Set Active Activity: ' + value);
		const is = this.find_activity_by_id(service, value as number)
		if (is) {
			this.log.info("IS: active:" + JSON.stringify(is))
			this.harmony_api.post(hub_slug + "/activities/" + is.name)
			this.state_change_started = new Date().getTime()
			callback(NO_ERRORS)
		} else { callback(new Error("Activity not found: value: " + value)) }
	}

	// get mute
	private getMute(callback: CharacteristicGetCallback) {
		callback(NO_ERRORS, false);
	}

	// get mute
	private setMute(value: CharacteristicValue, callback: CharacteristicSetCallback) {
		callback(NO_ERRORS);
	}

	// start status polling
	private startPolling(hub_slug: string, service: Service) {
		this.log.info('Start status polling ...')
		var emitter = pollingtoevent((poll: (error: any, service: Service, data: any) => void) => {
			this.status(hub_slug).then(status => {
				poll(null, service, status)
			})
		}, { interval: POLL_INTERVAL, eventName: service.iid })

		emitter.on(service.iid, (service: Service, status: { off: boolean, current_activity: Activity }) => {
			let now = new Date().getTime()
			let limit = this.state_change_started + STATE_CHANGE_SETTLE_TIME_INTERVAL

			// update active state if active state change is not in progress or settle time has expired
			if (this.state_change_started <= 0 || limit < now) {
				this.state_change_started = 0
				this.log.debug("Poll: status: " + JSON.stringify(status))

				const active = service.getCharacteristic(this.hap.Characteristic.Active).value;
				const target_active = status.off ? 0 : 1

				if (active != target_active) {
					this.log.debug("Poll: change active to: " + target_active)
					service.updateCharacteristic(this.hap.Characteristic.Active, target_active)
					if (target_active == 1) {
						this.log.debug("Poll: change activity to: " + status.current_activity.id)
						service.updateCharacteristic(this.hap.Characteristic.ActiveIdentifier, status.current_activity.id);
					}
				}
			} else {
				this.log.debug("Poll: state change in progress - no update")
			}
		});
	}

	// power off
	private power_off(hub_slug: string) {
		this.harmony_api.put(hub_slug + "/off")
	}

	// power on
	private power_on(hub_slug: string, activity: CharacteristicValue) {
		let command = hub_slug + "/activities/" + activity
		this.log.debug("power_on: command: " + command)
		this.harmony_api.post(command)
	}

	// status
	private async status(hub_slug: string) {
		const data = await this.harmony_api.get(hub_slug + "/status")
		if (data) {
			return { off: data.off, current_activity: data.current_activity }
		} else {
			return { off: true, current_activity: -1 }
		}
	}
}
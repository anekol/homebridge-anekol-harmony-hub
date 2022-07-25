// class to provide a Harmony Hub accessory helper
import { CharacteristicGetCallback, CharacteristicSetCallback, CharacteristicValue, HAP, HAPStatus, Logger, PlatformAccessory, Service } from "homebridge";
import { AnekolHarmonyApi } from "./harmony_api";
import { AnekolHarmonyHub, Hub } from "./index"

const POLL_INTERVAL = 5000
const STATE_CHANGE_SETTLE_TIME_INTERVAL = 15000

export class AnekolHarmonyHubHelper {
	private hap: HAP
	private log: Logger
	private state_change_started = 0

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

		// configure the tv service
		const service = (accessory.getService(this.hap.Service.Television) ||
			accessory.addService(this.hap.Service.Television))
			.setCharacteristic(this.hap.Characteristic.SleepDiscoveryMode, this.hap.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE)
			.setCharacteristic(this.hap.Characteristic.PowerModeSelection, this.hap.Characteristic.PowerModeSelection.HIDE)
			.setCharacteristic(this.hap.Characteristic.RemoteKey, this.hap.Characteristic.RemoteKey.PLAY_PAUSE)

		// remove existing activity services
		for (const s of accessory.services.filter(s => s.UUID == this.hap.Service.InputSource.UUID)) {
			service.removeLinkedService(s)
			accessory.removeService(s)
		}

		// add activity as input source service
		for (const a of this.hub.activities) {
			if (a.isAVActivity) {
				this.log.info("Adding Activity: " + a.label)
				const is = this.new_input_source_service(a.label, a.id, a.slug)
				accessory.addService(is)
				service.addLinkedService(is)
			}
		}

		// set default activity
		const active = this.find_active_activity(service)
		if (active)
			service.setCharacteristic(this.hap.Characteristic.ActiveIdentifier, parseInt(active.subtype as string))

		// configure event handlers
		service.getCharacteristic(this.hap.Characteristic.Active)
			.on('get', this.getActive.bind(this, this.hub.slug))
			.on('set', this.setActive.bind(this, this.hub, service))
		service.getCharacteristic(this.hap.Characteristic.ActiveIdentifier)
			.on('get', this.getActiveIdentifier.bind(this, this.hub.slug))
			.on('set', this.setActiveIdentifier.bind(this, this.hub.slug, service))

		// start polling the tv service
		this.startPolling(this.hub.slug, service)

		this.platform.api.updatePlatformAccessories([accessory])
	}

	// find activity by id
	private find_activity_by_id(service: Service, id: number) {
		for (const is of service.linkedServices) {
			if (is.UUID == this.hap.Service.InputSource.UUID)
				if (parseInt(is.subtype as string) == id)
					return is
		}
		return null
	}

	// find active activity
	private find_active_activity(service: Service) {
		const id = service.getCharacteristic(this.hap.Characteristic.ActiveIdentifier).value as number
		if (id != 0) {
			return this.find_activity_by_id(service, id)
		} else

			// not set - return first activity
			for (const is of service.linkedServices) {
				if (is.UUID == this.hap.Service.InputSource.UUID) {
					return is
				}
			}
		return null
	}

	// new input source service
	private new_input_source_service(label: string, id: string, slug: string) {
		const service = new this.hap.Service.InputSource(label, id)
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
		const active = (await this.status(hub_slug)).off ? this.hap.Characteristic.Active.INACTIVE : this.hap.Characteristic.Active.ACTIVE
		if (this.verboseLog)
			this.log.info('Get Active: ' + active);
		callback(HAPStatus.SUCCESS, active);
	}

	// set active
	private async setActive(hub: Hub, service: Service, target_active: CharacteristicValue, callback: CharacteristicSetCallback) {
		const active = (await this.status(hub.slug)).off ? this.hap.Characteristic.Active.INACTIVE : this.hap.Characteristic.Active.ACTIVE
		if (this.verboseLog)
			this.log.info("Set Active: target active: " + target_active + " current active: " + active)
		if (target_active != active) {
			this.state_change_started = new Date().getTime()
			if (target_active == this.hap.Characteristic.Active.ACTIVE) {
				const is = this.find_active_activity(service)
				if (is) this.power_on(hub, is.name as string)
			} else {
				this.power_off(hub)
			}
		}
		callback(HAPStatus.SUCCESS);
	}

	// get active identifier
	private getActiveIdentifier(hub_slug: string, callback: CharacteristicGetCallback) {
		this.status(hub_slug).then(status => {
			const ca_id = status.off ? 0 : status.current_activity.id
			if (this.verboseLog)
				this.log.info('Get Active Identifier: ' + ca_id);
			callback(HAPStatus.SUCCESS, ca_id);
		})
	}

	// set active identifier
	private setActiveIdentifier(hub_slug: string, service: Service, value: CharacteristicValue, callback: CharacteristicSetCallback) {
		if (this.verboseLog)
			this.log.info('Set Active Activity: ' + value);
		const is = this.find_activity_by_id(service, value as number)
		if (is) {
			this.harmony_api.post(hub_slug + "/activities/" + is.name)
			this.state_change_started = new Date().getTime()
			callback(HAPStatus.SUCCESS)
		} else { callback(new Error("Activity not found: value: " + value)) }
	}

	private startPolling(slug: string, service: Service) {
		setInterval(async (slug: string, service: Service) => {
			const now = new Date().getTime()
			const limit = this.state_change_started + STATE_CHANGE_SETTLE_TIME_INTERVAL

			// update active state if active state change is not in progress or settle time has expired
			if (this.state_change_started <= 0 || limit < now) {
				this.state_change_started = 0

				const status = await this.status(slug)
				if (this.verboseLog)
					this.log.info("Poll: status: " + JSON.stringify(status))
				if (status) {
					const active = service.getCharacteristic(this.hap.Characteristic.Active).value;
					const target_active = status.off ? this.hap.Characteristic.Active.INACTIVE : this.hap.Characteristic.Active.ACTIVE

					if (active != target_active) {
						if (this.verboseLog)
							this.log.info("Poll: change active to: " + target_active)
						service.updateCharacteristic(this.hap.Characteristic.Active, target_active)
						if (target_active == this.hap.Characteristic.Active.ACTIVE) {
							if (this.verboseLog)
								this.log.info("Poll: change activity to: " + status.current_activity.id)
							service.updateCharacteristic(this.hap.Characteristic.ActiveIdentifier, status.current_activity.id);
						}
					}
				}
			} else {
				if (this.verboseLog)
					this.log.info("Poll: state change in progress - no update")
			}
		}, POLL_INTERVAL, slug, service);
	}

	// power off
	private power_off(hub: Hub) {
		// main hub
		const command = hub.slug + "/off"
		if (this.verboseLog)
			this.log.info("power_off: command: " + command)
		this.harmony_api.put(command)

		// devices
		// wait for hub command to settle
		setTimeout(() => {
			for (const d of hub.power_off) {
				const command = hub.slug + "/devices/" + d + "/commands/power-off"
				if (this.verboseLog)
					this.log.info("power_off: command: " + command)
				this.harmony_api.post(command)
			}
		}, 10000);
	}

	// power on
	private power_on(hub: Hub, activity: CharacteristicValue) {
		//main hub
		const command = hub.slug + "/activities/" + activity
		if (this.verboseLog)
			this.log.info("power_on: command: " + command)
		this.harmony_api.post(command)

		// devices
		// wait for hub command to settle
		setTimeout(() => {
			for (const d of hub.power_on) {
				const command = hub.slug + "/devices/" + d + "/commands/power-on"
				if (this.verboseLog)
					this.log.info("power_on: command: " + command)
				this.harmony_api.post(command)
			}
		}, 10000);

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
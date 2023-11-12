// class to provide a Logitech Harmony Hub platform
import { API, DynamicPlatformPlugin, HAP, Logger, PlatformAccessory, PlatformConfig } from "homebridge";
import { AnekolHarmonyApi } from './harmony_api';
import { AnekolHarmonyHubDevicesHelper } from './devices';
import { AnekolHarmonyHubHelper } from './hub';
import { AnekolHarmonyHubVolumeHelper } from './volume';

module.exports = (api: API) => {
  api.registerPlatform(PLATFORM_NAME, AnekolHarmonyHub);
}

const PLATFORM_NAME = 'AnekolHarmonyHub';
const PLUGIN_NAME = 'homebridge-anekol-harmony-hub'; // Plugin name from package.json

export interface Activity { id: string, slug: string, label: string, isAVActivity: boolean }
export interface Device { id: string, slug: string, label: string }
export interface Hub { slug: string, activities: Activity[], devices: Device[], power_on: string[], power_off: string[], power_toggle: string[] }[]
export interface HubConfig { slug: string, label: string, devices: string[] }

export class AnekolHarmonyHub implements DynamicPlatformPlugin {
  private configured: PlatformAccessory[] = []
  private hap: HAP
  private harmony_api: AnekolHarmonyApi
  private host: string
  private hubs_config: HubConfig[]
  private port = "8282"
  private restored: PlatformAccessory[] = []
  private verboseLog = false

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.hap = api.hap

    // user config
    this.host = config.host as string || "localhost"
    this.port = config.port as string || "8282"
    this.verboseLog = config.verboseLog as boolean || false
    this.hubs_config = config.hubs || [] as HubConfig[];

    this.harmony_api = new AnekolHarmonyApi(log, this.host, this.port, this.verboseLog)

    // wait for "didFinishLaunching" 
    api.on('didFinishLaunching', () => {
      this.log.info("Finished restoring cached accessories")

      // configure the hub and it's accessories
      this.discover_hubs().then((hubs) => {

        for (const hub of hubs) {
          const hub_config = this.config_for(hub.slug)

          // ignore discovered hubs that aren't present in the plugin config
          if (hub_config) {
            let uuid, accessory
            const hub_label = hub_config.label || ""

            // configure the main hub accessory
            uuid = this.hap.uuid.generate(PLUGIN_NAME + "_" + hub.slug + "_hub")
            accessory = this.find_restored(uuid)
            if (!accessory) {
              accessory = new this.api.platformAccessory(hub_label, uuid, this.hap.Categories.TELEVISION);
              this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
              this.log.info('Added new accessory: ' + accessory.displayName);
            } else {
              if (this.verboseLog)
                this.log.info('Restored: ' + accessory.displayName);
            }
            new AnekolHarmonyHubHelper(this, accessory, this.harmony_api, hub, this.verboseLog)
            this.add_configured(accessory)

            // configure hub devices accessory
            uuid = this.hap.uuid.generate(PLUGIN_NAME + "_" + hub.slug + "_devices")
            accessory = this.find_restored(uuid)
            if (!accessory) {
              accessory = new this.api.platformAccessory(hub_label + " Devices", uuid, this.hap.Categories.SWITCH);
              this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
              this.log.info('Added new accessory: ' + accessory.displayName);
            } else {
              if (this.verboseLog)
                this.log.info('Restored: ' + accessory.displayName);
            }

            // configure the hub devices accessory
            new AnekolHarmonyHubDevicesHelper(this, accessory, this.harmony_api, hub, hub_config.devices, this.verboseLog)
            this.add_configured(accessory)

            // configure hub volume accessory
            uuid = this.hap.uuid.generate(PLUGIN_NAME + "_" + hub.slug + "_volume")
            accessory = this.find_restored(uuid)
            if (!accessory) {
              accessory = new this.api.platformAccessory(hub_label + " Volume", uuid, this.hap.Categories.SPEAKER);
              this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
              this.log.info('Added new accessory: ' + accessory.displayName);
            } else {
              if (this.verboseLog)
                this.log.info('Restored: ' + accessory.displayName);
            }

            new AnekolHarmonyHubVolumeHelper(this, accessory, this.harmony_api, hub, this.verboseLog)
            this.add_configured(accessory)
          }
        }

        // deregister any restored accessories not configured
        for (const r of this.restored) {
          if (this.verboseLog)
            this.log.info("Restored: " + r.displayName)
          if (!this.configured.find(c => c.UUID === r.UUID)) {
            this.log.info("Deregister: not configured: " + r.displayName)
            this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [r])
          }
        }

        for (const c of this.configured) {
          if (this.verboseLog)
            this.log.info("Configured: " + c.displayName)

        }
      })
    })
  }

  // discover hub configurations
  private async discover_hubs() {
    const discovered_hubs: Hub[] = []

    // find hubs
    const hd = await this.harmony_api.get("")
    const hub_slugs = hd.hubs ? hd.hubs : []

    for (const hub_slug of hub_slugs) {

      // find hub activities
      const ad = await this.harmony_api.get(hub_slug + "/activities")
      const activities: Activity[] = ad.activities ? ad.activities : []

      // find hub devices
      const dd = await this.harmony_api.get(hub_slug + "/devices")
      const devices: Device[] = dd.devices ? dd.devices : []

      // find out how hub devices are power managed
      const power_on: string[] = []
      const power_off: string[] = []
      const power_toggle: string[] = []

      for (const device of devices) {
        const commands = (await this.harmony_api.get(hub_slug + "/devices/" + device.slug + "/commands")).commands

        // determine is device has commands for power-on/power-off
        for (const c of commands) {
          if (c.slug == "power-on")
            power_on.push(device.slug)
          if (c.slug == "power-off")
            power_off.push(device.slug)
          if (c.slug == "power-toggle")
            power_toggle.push(device.slug)
        }
      }
      discovered_hubs.push({ slug: hub_slug, activities: activities, devices: devices, power_on: power_on, power_off: power_off, power_toggle: power_toggle })
    }
    if (this.verboseLog)
      this.log.info("Discovered Hubs: " + JSON.stringify(discovered_hubs))
    return discovered_hubs
  }

  // add accessory to configured list
  public add_configured(accessory: PlatformAccessory) {
    this.configured.push(accessory)
  }

  // configureAccessory will be called once for every cached accessory restored
  public configureAccessory(accessory: PlatformAccessory) {
    this.log.info("Restored: " + accessory.displayName)
    this.restored.push(accessory)
  }

  // find restored accessory
  public find_restored(uuid: string) {
    return this.restored.find(a => a.UUID === uuid)
  }

  // find config for a hub
  private config_for(slug: string) {
    for (const hub of this.hubs_config) {
      if (hub.slug == slug) {
        return hub
      }
    }
    return null
  }
}

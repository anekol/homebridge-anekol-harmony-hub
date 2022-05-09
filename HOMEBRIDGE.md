Oh, my bad, ~/.homebridge/accessories/cachedAccessories is used to persist the accessories for dynamic platform plugins.

Indeed, ~/.homebridge/persists/IdentifierCache.xxxxxxxxxxxx.json is used to persist the mapping of (long) UUIDs to (short) AIDs (for accessories) and IIDs (for services and characteristics) used in the HAP protocol. If you run DEBUG=* homebridge -D, the HAP calls are logged, including the AIDs and IIDs.

The AIDs are unique per homebridge installation (HomeKit bridge); the IIDs are unique within an accessory. Note that IID 1 is fixed for the Accessory Information service, and therefore not stored in the cache. You're supposed to see multiple lines per accessory UUID, e.g.:

    "b3dbea38-6743-4049-9f5d-70081489cc22": 4,
    "b3dbea38-6743-4049-9f5d-70081489cc22|nextIID": 16,
    "b3dbea38-6743-4049-9f5d-70081489cc22|0000003E-0000-1000-8000-0026BB765291|00000014-0000-1000-8000-0026BB765291": 2,
    "b3dbea38-6743-4049-9f5d-70081489cc22|0000003E-0000-1000-8000-0026BB765291|00000020-0000-1000-8000-0026BB765291": 3,
    "b3dbea38-6743-4049-9f5d-70081489cc22|0000003E-0000-1000-8000-0026BB765291|00000021-0000-1000-8000-0026BB765291": 4,
    "b3dbea38-6743-4049-9f5d-70081489cc22|0000003E-0000-1000-8000-0026BB765291|00000023-0000-1000-8000-0026BB765291": 5,
    "b3dbea38-6743-4049-9f5d-70081489cc22|0000003E-0000-1000-8000-0026BB765291|00000030-0000-1000-8000-0026BB765291": 6,
    "b3dbea38-6743-4049-9f5d-70081489cc22|0000003E-0000-1000-8000-0026BB765291|00000052-0000-1000-8000-0026BB765291": 7,
    "b3dbea38-6743-4049-9f5d-70081489cc22|00000043-0000-1000-8000-0026BB765291|01": 8,
    "b3dbea38-6743-4049-9f5d-70081489cc22|00000043-0000-1000-8000-0026BB765291|01|00000023-0000-1000-8000-0026BB765291": 9,
    "b3dbea38-6743-4049-9f5d-70081489cc22|00000043-0000-1000-8000-0026BB765291|01|00000025-0000-1000-8000-0026BB765291": 10,
    "b3dbea38-6743-4049-9f5d-70081489cc22|00000043-0000-1000-8000-0026BB765291|01|00000008-0000-1000-8000-0026BB765291": 11,
    "b3dbea38-6743-4049-9f5d-70081489cc22|00000043-0000-1000-8000-0026BB765291|01|00000013-0000-1000-8000-0026BB765291": 12,
    "b3dbea38-6743-4049-9f5d-70081489cc22|00000043-0000-1000-8000-0026BB765291|01|0000002F-0000-1000-8000-0026BB765291": 13,
    "b3dbea38-6743-4049-9f5d-70081489cc22|00000043-0000-1000-8000-0026BB765291|01|00000077-0000-1000-8000-0026BB765291": 14,
    "b3dbea38-6743-4049-9f5d-70081489cc22|00000043-0000-1000-8000-0026BB765291|01|00000021-0000-1000-8000-656261617577": 15,
The first two lines define the AID and the next IID to be assigned. The lines with |0000003E-0000-1000-8000-0026BB765291| define the IIDs for the characteristics of the Accessory Information service. The next line (IID 8) defines a Lightbulb service with subtype 01; the following lines define the characteristics for the Lightbulb service.

The UUIDs for services and characteristics are given by their type (see https://github.com/KhaosT/HAP-NodeJS/blob/master/lib/gen/HomeKitTypes.js for the Apple-defined types); the UUIDs for accessories are created by the plugin:

When creating a new PlatformAccessory (for platform plugins using the dynamic accessory model):
https://github.com/nfarina/homebridge/blob/422582ad34a05f7d4510fbea7549a0461b65f063/lib/platformAccessory.js#L14
Or by setting uuid_base or displayName (for accessory plugins and platform plugins using the static accessory model):
https://github.com/nfarina/homebridge/blob/422582ad34a05f7d4510fbea7549a0461b65f063/lib/server.js#L426
If the plugin provides a different UUID (or uuid_base or, lacking that, displayName), homebridge will allocate a new AID and HomeKit will think this is a new accessory, losing any assignment to rooms, scenes, automations, favourites, etc. If IdentifierCache.xxxxxxxxxxxx.json is lost or corrupted, homebridge will assign new AIDs and IIDs, probably confusing the hell out of HomeKit, which can only be remedied by deleting and re-pairing homebridge.
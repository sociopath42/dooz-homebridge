import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { DoozHomebridgePlatform, DoozGroupDef } from './platform';

import { DoozLightAccessory } from './DoozLightAccessory';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class DoozLightGroupAccessory {
  private service: Service;

  /**
   * These are just used to create a working example
   * You should implement your own code to track the state of your accessory
   */
  private lightStates = {
    On: false,
    Brightness: 100,
  };

  private lightList: Array<DoozLightAccessory> = new Array<DoozLightAccessory>();

  constructor(
    private readonly platform: DoozHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
    private readonly device: DoozGroupDef,
  ) {

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'DOOZ')
      .setCharacteristic(this.platform.Characteristic.Model, 'Dooz light group')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.unicast+'::'+device.groupType);

    // get the LightBulb service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
    this.service = this.accessory.getService(this.platform.Service.Lightbulb) || this.accessory.addService(this.platform.Service.Lightbulb);

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, device.equipmentName);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Lightbulb

    // register handlers for the On/Off Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setOn.bind(this))                // SET - bind to the `setOn` method below
      .onGet(this.getOn.bind(this));               // GET - bind to the `getOn` method below

    // register handlers for the Brightness Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.Brightness)
      .onSet(this.setBrightness.bind(this))                // SET - bind to the `setOn` method below
      .onGet(this.getBrightness.bind(this));               // GET - bind to the 'getBrightness` method below

    /**
     * Creating multiple services of the same type.
     *
     * To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
     * when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
     * this.accessory.getService('NAME') || this.accessory.addService(this.platform.Service.Lightbulb, 'NAME', 'USER_DEFINED_SUBTYPE_ID');
     *
     * The USER_DEFINED_SUBTYPE must be unique to the platform accessory (if you platform exposes multiple accessories, each accessory
     * can use the same sub type id.)
     */

    // Example: add two "motion sensor" services to the accessory
    //const motionSensorOneService = this.accessory.getService('Motion Sensor One Name') ||
    //  this.accessory.addService(this.platform.Service.MotionSensor, 'Motion Sensor One Name', 'YourUniqueIdentifier-1');

    //const motionSensorTwoService = this.accessory.getService('Motion Sensor Two Name') ||
    //  this.accessory.addService(this.platform.Service.MotionSensor, 'Motion Sensor Two Name', 'YourUniqueIdentifier-2');

    /**
     * Updating characteristics values asynchronously.
     *
     * Example showing how to update the state of a Characteristic asynchronously instead
     * of using the `on('get')` handlers.
     * Here we change update the motion sensor trigger states on and off every 10 seconds
     * the `updateCharacteristic` method.
     *
     */
    //    let motionDetected = false;
    setInterval(() => {
    //  this.platform.log.debug('accessory timer ', this.accessory.displayName);
    //      // EXAMPLE - inverse the trigger
    //      motionDetected = !motionDetected;
    //
    //      // push the new value to HomeKit
    //      motionSensorOneService.updateCharacteristic(this.platform.Characteristic.MotionDetected, motionDetected);
    //      motionSensorTwoService.updateCharacteristic(this.platform.Characteristic.MotionDetected, !motionDetected);
    //
    //      this.platform.log.debug('Triggering motionSensorOneService:', motionDetected);
    //      this.platform.log.debug('Triggering motionSensorTwoService:', !motionDetected);
    }, 10*60*1000);
  }

  addEquipement(eq: DoozLightAccessory) {
    for (let i = 0; i < this.lightList.length; i++) {
      if (eq.getUnicast() === this.lightList[i].getUnicast()) {
        return;
      }
    }
    this.lightList.push(eq);
  }

  updateState() {
    let level = 0;
    for (let i = 0; i < this.lightList.length; i++) {
      if (this.lightList[i].getInternalOn() === true) {
        this.lightStates.On = true;
        level += this.lightList[i].getInternalLevel();
      }
    }
    if (this.lightList.length > 0) {
      level /= this.lightList.length;
      this.lightStates.Brightness = level;
      this.lightStates.On = (level > 0);
      this.service.updateCharacteristic(this.platform.Characteristic.On, (level > 0));
      this.service.updateCharacteristic(this.platform.Characteristic.Brightness, level);
    }
  }

  getUnicast() {
    return this.device.unicast;
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
   */
  async setOn(value: CharacteristicValue) {
    // implement your own code to turn your device on/off
    this.lightStates.On = value as boolean;
    const state: string = value ? 'on' : 'off';
    this.platform.log.debug('Set Characteristic On ->', value);
    this.platform.webSocketClient
      .send('set', {address: this.device.unicast, level: state})
      .then((result) => {
        this.platform.log.debug('set on ok '+this.device.unicast, result);
      })
      .catch((error) => {
        this.platform.log.debug('set on fail '+this.device.unicast, error);
      });
  }

  async getOn(): Promise<CharacteristicValue> {
    // implement your own code to check if the device is on
    this.updateState();
    return this.lightStates.On;
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, changing the Brightness
   */
  async setBrightness(value: CharacteristicValue) {
    // implement your own code to set the brightness
    this.lightStates.Brightness = value as number;
    this.platform.webSocketClient
      .send('set', {address: this.device.unicast, level: value})
      .then((result) => {
        this.platform.log.debug('set '+result.level+' ok '+this.device.unicast);
        this.lightStates.Brightness = result.leve as number;
      })
      .catch((error) => {
        this.platform.log.debug('set fail '+this.device.unicast, error);
      });

    this.platform.log.debug('Set Characteristic Brightness -> ', this.lightStates.Brightness);
  }

  async getBrightness(): Promise<CharacteristicValue> {
    this.updateState();
    // if you need to return an error to show the device as "Not Responding" in the Home app:
    // throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);

    return this.lightStates.Brightness;
  }
}



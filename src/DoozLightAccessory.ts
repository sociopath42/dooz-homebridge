import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { DoozHomebridgePlatform, DoozDeviceDef } from './platform';

import { DoozLightGroupAccessory } from './DoozLightGroupAccessory';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class DoozLightAccessory {
  private service: Service;

  /**
   * These are just used to create a working example
   * You should implement your own code to track the state of your accessory
   */
  private lightStates = {
    On: false,
    Brightness: 100,
  };

  private groupList: Array<DoozLightGroupAccessory> = new Array<DoozLightGroupAccessory>();

  constructor(
    private readonly platform: DoozHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
    private readonly device: DoozDeviceDef,
  ) {

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'DOOZ')
      .setCharacteristic(this.platform.Characteristic.Model, 'Dooz light')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.uniqUuid);

    // get the LightBulb service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
    this.service = this.accessory.getService(this.platform.Service.Lightbulb) ||
                   this.accessory.addService(this.platform.Service.Lightbulb);

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name,
      device.room + ' - ' + device.equipmentName);

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

  updateState(level: number) {
    const isOn = (level > 0);
    this.lightStates.On = isOn;
    this.service.updateCharacteristic(this.platform.Characteristic.On, isOn);
    if (isOn) {
      this.lightStates.Brightness = level;
      this.service.updateCharacteristic(this.platform.Characteristic.Brightness, level);
    }
    for (let i = 0; i < this.groupList.length; i++) {
      this.groupList[i].updateState();
    }
  }

  getEquipmentName() {
    return this.device.equipmentName;
  }

  getUnicast() {
    return this.device.unicast;
  }

  addToGroup(group: DoozLightGroupAccessory) {
    if (!(this in group)) {
      this.groupList.push(group);
    }
    group.addEquipement(this);
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

  /**
   * Handle the "GET" requests from HomeKit
   * These are sent when HomeKit wants to know the current state of the accessory, for example, checking if a Light bulb is on.
   *
   * GET requests should return as fast as possbile. A long delay here will result in
   * HomeKit being unresponsive and a bad user experience in general.
   *
   * If your device takes time to respond you should update the status of your device
   * asynchronously instead using the `updateCharacteristic` method instead.

   * @example
   * this.service.updateCharacteristic(this.platform.Characteristic.On, true)
   */
  getInternalOn() {
    return this.lightStates.On;
  }

  getInternalLevel() {
    return this.lightStates.Brightness;
  }

  async getOn(): Promise<CharacteristicValue> {
    // implement your own code to check if the device is on
    let isOn = this.lightStates.On;
    this.platform.webSocketClient
      .send('get', {address: this.device.unicast})
      .then((result) => {
        //this.platform.log.debug('get '+result.result.level+' ok '+this.device.unicast);
        isOn = (result.result.level > 0);
        this.lightStates.On = isOn;
        this.lightStates.Brightness = result.result.level as number;
        this.updateState(result.result.level);
      })
      .catch((error) => {
        this.platform.log.debug('get fail '+this.device.unicast, error);
      });

    //this.platform.log.debug('Get Characteristic On ->', isOn);

    // if you need to return an error to show the device as "Not Responding" in the Home app:
    // throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);

    return isOn;
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
        //this.platform.log.debug('set '+result.level+' ok '+this.device.unicast);
        this.lightStates.Brightness = result.leve as number;
      })
      .catch((error) => {
        this.platform.log.debug('set fail '+this.device.unicast, error);
      });

    //this.platform.log.debug('Set Characteristic Brightness -> ', this.lightStates.Brightness);
  }

  async getBrightness(): Promise<CharacteristicValue> {
    // implement your own code to check if the device is on
    let brightness = this.lightStates.Brightness as number;
    this.platform.webSocketClient
      .send('get', {address: this.device.unicast})
      .then((result) => {
        //this.platform.log.debug('get '+result.result.level+' ok '+this.device.unicast);
        brightness = result.result.level as number;
        this.lightStates.On = (result.result.level > 0);
        this.lightStates.Brightness = result.result.level as number;
        this.updateState(result.result.level);
      })
      .catch((error) => {
        this.platform.log.debug('get fail '+this.device.unicast, error);
      });

    //this.platform.log.debug('Get Characteristic Brightness ->', brightness);

    // if you need to return an error to show the device as "Not Responding" in the Home app:
    // throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);

    return brightness;
  }
}



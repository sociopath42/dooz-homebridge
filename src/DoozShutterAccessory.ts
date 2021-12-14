import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { DoozHomebridgePlatform, DoozDeviceDef } from './platform';

import { DoozShutterGroupAccessory } from './DoozShutterGroupAccessory';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class DoozShutterAccessory {
  private service: Service;

  //   export declare class PositionState extends Characteristic {
  //    static readonly UUID: string;
  //    static readonly DECREASING = 0;
  //    static readonly INCREASING = 1;
  //    static readonly STOPPED = 2;
  //    constructor();
  //}
  private shutterStates = {
    state: 0,
    level: 100,
    target: 100,
  };

  private groupList: Array<DoozShutterGroupAccessory> = new Array<DoozShutterGroupAccessory>();

  constructor(
    private readonly platform: DoozHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
    private readonly device: DoozDeviceDef,
  ) {

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'DOOZ')
      .setCharacteristic(this.platform.Characteristic.Model, 'Dooz shutter')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.uniqUuid);

    // get the LightBulb service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
    this.service = this.accessory.getService(this.platform.Service.WindowCovering) ||
                   this.accessory.addService(this.platform.Service.WindowCovering);

    this.shutterStates.level = 100;
    this.shutterStates.target = this.shutterStates.level;
    this.shutterStates.state = this.platform.Characteristic.PositionState.STOPPED;
    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, device.room + ' - ' + device.equipmentName);
    // create handlers for required characteristics
    this.service.getCharacteristic(this.platform.Characteristic.CurrentPosition) // level
      .onGet(this.currentPositionGet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.PositionState)  // this.Characteristic.PositionState.DECREASING => moving?
      .onGet(this.positionStateGet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.TargetPosition) // target
      .onGet(this.targetPositionGet.bind(this))
      .onSet(this.targetPositionSet.bind(this));
  }

  updateState(level: number, target: number) {
    let state = this.platform.Characteristic.PositionState.STOPPED;
    if (target > level) {
      state = this.platform.Characteristic.PositionState.INCREASING;
    } else if (target < level) {
      state = this.platform.Characteristic.PositionState.DECREASING;
    }
    this.shutterStates.state = state;
    this.shutterStates.level = level;
    this.shutterStates.target = target;
    this.service.updateCharacteristic(this.platform.Characteristic.CurrentPosition, level);
    this.service.updateCharacteristic(this.platform.Characteristic.TargetPosition, target);
    this.service.updateCharacteristic(this.platform.Characteristic.PositionState, state);
  }


  getEquipmentName() {
    return this.device.equipmentName;
  }

  getUnicast() {
    return this.device.unicast;
  }


  addToGroup(group: DoozShutterGroupAccessory) {
    if (!(this in group)) {
      this.groupList.push(group);
    }
    group.addEquipement(this);
  }

  getInternalTarget(): number {
    return this.shutterStates.target;
  }

  getInternalLevel(): number {
    return this.shutterStates.level;
  }

  getInternalState(): number {
    return this.shutterStates.state;
  }

  async targetPositionGet(): Promise<CharacteristicValue> {
    // implement your own code to check if the device is on
    this.platform.webSocketClient
      .send('get', {address: this.device.unicast})
      .then((result) => {
        this.platform.log.debug('get '+result.result.level+' ok '+this.device.unicast);
        if (!('target' in result.result)) {
          result.result.target = result.result.level;
        }
        this.updateState(result.result.level, result.result.target);
      })
      .catch((error) => {
        this.platform.log.debug('get fail '+this.device.unicast, error);
      });

    this.platform.log.debug('Get current position level ->', this.shutterStates.level);

    return this.shutterStates.target;
  }

  async currentPositionGet(): Promise<CharacteristicValue> {
    // implement your own code to check if the device is on
    this.platform.webSocketClient
      .send('get', {address: this.device.unicast})
      .then((result) => {
        this.platform.log.debug('get '+result.result.level+' ok '+this.device.unicast);
        if (!('target' in result.result)) {
          result.result.target = result.result.level;
        }
        this.updateState(result.result.level, result.result.target);
      })
      .catch((error) => {
        this.platform.log.debug('get fail '+this.device.unicast, error);
      });

    this.platform.log.debug('Get current position level ->', this.shutterStates.level);

    return this.shutterStates.level;
  }

  async positionStateGet(): Promise<CharacteristicValue> {
    // implement your own code to check if the device is on
    this.platform.webSocketClient
      .send('get', {address: this.device.unicast})
      .then((result) => {
        if (!('target' in result.result)) {
          result.result.target = result.result.level;
        }
        this.updateState(result.result.level, result.result.target);
        this.platform.log.debug('get state '+this.shutterStates.state+' ok '+this.device.unicast);
      })
      .catch((error) => {
        this.platform.log.debug('get fail '+this.device.unicast, error);
      });

    this.platform.log.debug('Get state ->', this.shutterStates.state);

    // if you need to return an error to show the device as "Not Responding" in the Home app:
    // throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);

    return this.shutterStates.state;
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, changing the Brightness
   */
  async targetPositionSet(value: CharacteristicValue) {
    // implement your own code to set the brightness
    this.platform.webSocketClient
      .send('set', {address: this.device.unicast, level: value})
      .then((result) => {
        this.platform.log.debug('set '+result.level+' ok '+this.device.unicast);
        this.shutterStates.target = result.level as number;
      })
      .catch((error) => {
        this.platform.log.debug('set fail '+this.device.unicast, error);
      });

    this.platform.log.debug('Set target position -> ', this.shutterStates.target);
  }
}

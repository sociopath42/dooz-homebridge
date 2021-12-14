import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { DoozHomebridgePlatform, DoozGroupDef } from './platform';

import { DoozShutterAccessory } from './DoozShutterAccessory';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class DoozShutterGroupAccessory {
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

  private shutterList: Array<DoozShutterAccessory> = new Array<DoozShutterAccessory>();

  constructor(
    private readonly platform: DoozHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
    private readonly device: DoozGroupDef,
  ) {

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'DOOZ')
      .setCharacteristic(this.platform.Characteristic.Model, 'Dooz shutter group')
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

  addEquipement(eq: DoozShutterAccessory) {
    for (let i = 0; i < this.shutterList.length; i++) {
      if (eq.getUnicast() === this.shutterList[i].getUnicast()) {
        return;
      }
    }
    this.shutterList.push(eq);
  }

  updateState() {
    let state = this.platform.Characteristic.PositionState.STOPPED;
    let level = 0;
    let target = 0;
    for (let i = 0; i < this.shutterList.length; i++) {
      if (this.shutterList[i].getInternalState() !== this.platform.Characteristic.PositionState.STOPPED) {
        state = this.shutterList[i].getInternalState();
      }
      level += this.shutterList[i].getInternalLevel();
      target += this.shutterList[i].getInternalTarget();
    }
    if (this.shutterList.length > 0) {
      level /= this.shutterList.length;
      target /= this.shutterList.length;
      this.shutterStates.state = state;
      this.shutterStates.level = level;
      this.shutterStates.target = target;
      this.service.updateCharacteristic(this.platform.Characteristic.CurrentPosition, level);
      this.service.updateCharacteristic(this.platform.Characteristic.TargetPosition, target);
      this.service.updateCharacteristic(this.platform.Characteristic.PositionState, state);
    }
  }

  getUnicast() {
    return this.device.unicast;
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



  async targetPositionGet(): Promise<CharacteristicValue> {
    this.updateState();

    return this.shutterStates.target;
  }

  async currentPositionGet(): Promise<CharacteristicValue> {
    this.updateState();

    return this.shutterStates.level;
  }

  async positionStateGet(): Promise<CharacteristicValue> {
    this.updateState();

    return this.shutterStates.state;
  }


}



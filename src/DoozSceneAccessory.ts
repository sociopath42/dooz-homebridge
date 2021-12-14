import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { DoozHomebridgePlatform, DoozSceneDef } from './platform';

export class DoozSceneAccessory {
  private service: Service;

  private on = false;

  constructor(
    private readonly platform: DoozHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
    private readonly device: DoozSceneDef,
  ) {
    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'DOOZ')
      .setCharacteristic(this.platform.Characteristic.Model, 'Dooz scene')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.uniqUuid);

    this.service = this.accessory.getService(this.platform.Service.Switch) ||
     this.accessory.addService(this.platform.Service.Switch);

    this.service.setCharacteristic(this.platform.Characteristic.Name, device.equipmentName);

    // register handlers for the On/Off Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.On)
      .onGet(this.getOn.bind(this))
      .onSet(this.switchEvent.bind(this));
  }

  getUnicast() {
    return this.device.unicast;
  }

  async getOn(): Promise<CharacteristicValue> {
    return this.on;
  }

  async switchEvent() {
    this.service.updateCharacteristic(this.platform.Characteristic.On, true);
    this.on = true;

    this.platform.webSocketClient
      .send('set_scenario', {request: {command: 'start scenario', scenario_id: this.device.sceneId}})
      .then((result) => {
        this.platform.log.debug('scenario_start');
        this.platform.log.debug(result);
      })
      .catch((error) => {
        this.platform.log.error('scenario_start error');
        this.platform.log.error(error);
      });

    setTimeout(() => {
      this.service.updateCharacteristic(this.platform.Characteristic.On, false);
      this.on = false;
    }, 4000);
  }
}



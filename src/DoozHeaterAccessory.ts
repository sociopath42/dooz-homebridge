import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { DoozHomebridgePlatform, DoozDeviceDef } from './platform';

export class DoozHeatingModes {
  static readonly PRESENT = 0;
  static readonly ABSENT = 1;
  static readonly NIGHT = 2;
  static readonly FROSTFREE = 3;
  static readonly OFF = 4;
  static readonly AUTO = 5;
//  constructor();
}

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class DoozHeaterAccessory {
  private service: Service;

  private heaterStates = {
    currentMode: 0, // DoozHeatingModes
    heatingState: 0, // CurrentHeatingCoolingState
    targetHeatingState: 0, // TargetHeatingCoolingState
    currentTemperature: 10.0, // CurrentTemperature
    targetTemperature: 32.4, // TargetTemperature => consigne
    unit: 0,
  };

  constructor(
    private readonly platform: DoozHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
    private readonly device: DoozDeviceDef,
  ) {

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'DOOZ')
      .setCharacteristic(this.platform.Characteristic.Model, 'Dooz heater')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.uniqUuid);

    this.service = this.accessory.getService(this.platform.Service.Thermostat) ||
                   this.accessory.addService(this.platform.Service.Thermostat);

    this.service.setCharacteristic(this.platform.Characteristic.Name,
      device.room + ' - ' + device.equipmentName);

    // et
    //static readonly OFF = 0; // mode off
    //static readonly HEAT = 1; // mode pas off...
    //static readonly COOL = 2; // jamais
    // POURQUOI YA PAS AUTO BOR*@L DE C#*
    this.service.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState)
      .onGet(this.getCurrentHeatingState.bind(this));

    // synthese du mode
    // pour le GET
    //static readonly OFF = 0; // bah... off
    //static readonly HEAT = 1; // pas off
    //static readonly COOL = 2; // jamais
    //static readonly AUTO = 3; // on, en programmation
    // pour le SET
    // OFF = send cmd 'set' DoozHeatingMode.OFF
    // HEAT = send cmd 'set' DoozHeatingMode.PRESENT
    // COOL = send cmd 'set' DoozHeatingMode.FROSTFREE
    // AUTO = send cmd 'get current mode' 'get mode temp' 'set temp'
    this.service.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
      .onGet(this.getTargetHeatingState.bind(this))
      .onSet(this.setTargetHeatingState.bind(this));

    // en deg celsius -270 -> 100 : float step 0.1
    this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .onGet(this.getCurrentTemperature.bind(this));

    // en deg celsius 10 -> 38 : float step 0.1
    // pour le set
    // send cmd 'set' override temp
    this.service.getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .onGet(this.getTargetTemperature.bind(this))
      .onSet(this.setTargetTemperature.bind(this));

    // 0 celsius - 1 fahrenheit
    this.service.getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits) // target
      .onGet(this.getTemperatureDisplayUnits.bind(this))
      .onSet(this.setTemperatureDisplayUnits.bind(this));


    //this.getCurrentHeatingState();
    //this.getCurrentTemperature();
    //this.getTargetTemperature();
    //
    //this.service.updateCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits, this.heaterStates.unit);

    setInterval(() => {
      //const payload = (0x01F << 9).toString(16).padStart(4, '0').toLocaleUpperCase();
      //const sensorServerAddr = (Number('0x'+this.device.unicast) + 3).toString(16).padStart(4, '0').toLocaleUpperCase();
      //this.platform.log.debug('------------------getCurrentTemperature addr', sensorServerAddr, 'payload', payload);
      //this.platform.webSocketClient
      //  .send('set', {address: sensorServerAddr, raw: payload})
      //  .then((result) => {
      //    this.platform.log.debug(result);
      //    this.platform.log.debug('get '+result.result.level+' ok '+this.device.unicast);
      //    if ('level' in result.result) {
      //      this.heaterStates.currentTemperature = result.result.raw / 10.0;
      //      this.service.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.heaterStates.currentTemperature);
      //    }
      //  })
      //  .catch((error) => {
      //    this.platform.log.error('getCurrentTemperature '+this.device.unicast, error);
      //  });
    //  this.platform.log.debug('accessory timer ', this.accessory.displayName);
    }, 1*60*1000);
  }

  getUnicast() {
    return this.device.unicast;
  }

  async updateState(rawString: string) {
    if (rawString === '8000' || rawString === '7FFF') {
      this.platform.log.debug('relay state', (rawString === '8000')?'open':'closed');
      return;
    }
    //console.log('0x'+ rawString);
    const raw = Number('0x'+ rawString);
    const payloadCmd = (raw & 0xE000) >> 13;
    this.platform.log.debug('------------------updateState');
    const payloadTemp = (raw & 0x1FC0) >> 6;
    const payloadModeId = (raw & 0x003F);
    const targetTemp = payloadTemp / 2.0;
    //console.log(payloadCmd);
    //console.log(payloadTemp);
    //console.log(payloadModeId);
    //console.log(this.heaterStates.targetTemperature);
    const heatingSt = payloadModeId === DoozHeatingModes.OFF ?
      this.platform.Characteristic.CurrentHeatingCoolingState.OFF :
      this.platform.Characteristic.CurrentHeatingCoolingState.HEAT;

    if (payloadCmd === 0x04 ||
        payloadCmd === 0x00) {
      if (this.heaterStates.heatingState !== heatingSt) {
        this.heaterStates.heatingState = heatingSt;
        this.service.updateCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState, this.heaterStates.heatingState);
      }
    }
    if (payloadCmd === 0x04) {
      if (this.heaterStates.targetTemperature !== targetTemp) {
        this.heaterStates.targetTemperature = targetTemp;
        this.service.updateCharacteristic(this.platform.Characteristic.TargetTemperature, this.heaterStates.targetTemperature);
      }
    }
  }

  async getCurrentHeatingState(): Promise<CharacteristicValue> {
    this.platform.log.debug('------------------getCurrentHeatingState');
    const payload = 4 << 13; // Dooz magic language.... do not touch this
    this.platform.webSocketClient
      .send('set', {address: this.device.unicast, raw: payload.toString(16).padStart(4, '0').toLocaleUpperCase()})
      .then((result) => {
        this.platform.log.debug(result);
        this.platform.log.debug('get '+result.result.raw+' ok '+this.device.unicast);
        if (!('raw' in result.result)) {
          this.updateState(result.result.level);
        }
      })
      .catch((error) => {
        this.platform.log.error('getCurrentHeatingState fail '+this.device.unicast, error);
      });
    this.platform.log.debug('Get current heating state ->', this.heaterStates.heatingState);
    //this.service.updateCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState, this.heaterStates.heatingState);
    //static readonly OFF = 0; // mode off
    //static readonly HEAT = 1; // mode pas off...
    //static readonly COOL = 2; // jamais
    return this.heaterStates.heatingState;
  }

  async getTargetHeatingState(): Promise<CharacteristicValue> {
    this.platform.log.debug('Get target heating state ->', this.heaterStates.targetHeatingState);
    return this.heaterStates.targetHeatingState;
  }

  setTargetHeatingState(value) {
    this.platform.log.debug('Triggered SET setTargetHeatingState:'+ value);
    let doozHeatingMode = DoozHeatingModes.OFF;
    if (value !== this.platform.Characteristic.CurrentHeatingCoolingState.OFF) {
      value = this.platform.Characteristic.CurrentHeatingCoolingState.HEAT;
      doozHeatingMode = DoozHeatingModes.PRESENT;
    }
    if (value !== this.heaterStates.targetHeatingState) {
      this.heaterStates.targetHeatingState = value;
      this.service.updateCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState, this.heaterStates.targetHeatingState);
    }

    this.platform.webSocketClient
      .send('set', {address: this.device.unicast, raw: doozHeatingMode.toString(16).padStart(4, '0').toLocaleUpperCase()})
      .then((result) => {
        this.platform.log.debug(result);
        if (!('raw' in result.result)) {
          this.platform.log.debug('get '+result.result.raw+' ok '+this.device.unicast);
          const heatingSt = result.result.raw === DoozHeatingModes.OFF ?
            this.platform.Characteristic.CurrentHeatingCoolingState.OFF :
            this.platform.Characteristic.CurrentHeatingCoolingState.HEAT;
          if (heatingSt !== this.heaterStates.heatingState) {
            this.heaterStates.heatingState = heatingSt;
            this.service.updateCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState, this.heaterStates.heatingState);
          }
        }
      })
      .catch((error) => {
        this.platform.log.error('set mode fail '+this.device.unicast, error);
      });
  }

  async getCurrentTemperature(): Promise<CharacteristicValue> {
    this.platform.log.debug('Get current temperature ->', this.heaterStates.currentTemperature);
    return this.heaterStates.currentTemperature;
  }

  async getTargetTemperature(): Promise<CharacteristicValue> {
    this.getCurrentHeatingState();
    return this.heaterStates.targetTemperature;
  }

  setTargetTemperature(value) {
    this.platform.log.debug('------------------setTargetTemperature');
    if (value !== this.heaterStates.targetTemperature) {
      this.heaterStates.targetTemperature = value;
      this.service.updateCharacteristic(this.platform.Characteristic.TargetTemperature, this.heaterStates.targetTemperature);
    }
    const doozTemperatureOverride = Math.round(value * 2.0);
    const payload = (3 << 13) | (doozTemperatureOverride << 6);

    this.platform.webSocketClient
      .send('set', {address: this.device.unicast, level: payload.toString(16).padStart(4, '0').toLocaleUpperCase()})
      .then((result) => {
        this.platform.log.debug(result);
        this.platform.log.debug('set '+result.result.level+' ok '+this.device.unicast);
        if ('level' in result.result) {
          const raw = result.result.raw;
          this.updateState(raw);
          //const payloadTemp = (raw & 0x1FC0) >> 6;
          //const payloadModeId = (raw & 0x003F);
          //this.heaterStates.targetTemperature = payloadTemp / 2.0;
          //this.heaterStates.heatingState = payloadModeId === DoozHeatingModes.OFF ?
          //  this.platform.Characteristic.CurrentHeatingCoolingState.OFF :
          //  this.platform.Characteristic.CurrentHeatingCoolingState.HEAT;
          //this.service.updateCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState, this.heaterStates.heatingState);
          //this.service.updateCharacteristic(this.platform.Characteristic.TargetTemperature, this.heaterStates.targetTemperature);
        }
      })
      .catch((error) => {
        this.platform.log.error('setTargetTemperature fail '+this.device.unicast, error);
      });
  }



  async getTemperatureDisplayUnits(): Promise<CharacteristicValue> {
    this.platform.log.debug('Get getTemperatureDisplayUnits -> 0');
    //this.service.updateCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits, 0);
    // 0 celsius - 1 fahrenheit
    return this.heaterStates.unit;
  }
  //////////////////////////////////

  setTemperatureDisplayUnits(value) {
    this.platform.log.debug('Set setTemperatureDisplayUnits -> ', value);
    this.heaterStates.unit = value;
    this.service.updateCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits, this.heaterStates.unit);
  }


}


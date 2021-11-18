import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { DoozLightAccessory } from './DoozLightAccessory';
import { DoozShutterAccessory } from './DoozShutterAccessory';

import _require2 = require('jaysonic/lib/util/constants');
const ERR_CODES = _require2.ERR_CODES;
const ERR_MSGS = _require2.ERR_MSGS;

export class DoozEquipementType {
  static readonly OnOff = 0;
  static readonly Dimmer = 1;
  static readonly Relay = 2;
  static readonly Shutter = 3;
  static readonly Heater = 4;
  static readonly Pulse = 5;
}

export class DoozDeviceDef {
  public uniqueId = '';
  public mac = '';
  public unicast = '';
  public displayName = '';
  public room = '';
  public output_conf = 0;
}

import dns = require('dns');
import jaysonic = require('jaysonic');

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class DoozHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  public webSocketClient : jaysonic;
  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  public static accessoryLightMap: Map<string, DoozLightAccessory> = new Map<string, DoozLightAccessory>();
  public static accessoryShuttertMap: Map<string, DoozShutterAccessory> = new Map<string, DoozShutterAccessory>();

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name);
    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      log.debug('Leaving didFinishLaunching callback');
      this.connectOopla();
      //      setTimeout(() => {
      //      }, 5000);
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  sendToOopla() {
    this.log.debug('send to oopla');
  }

  connectOopla() {
    this.log.debug('connect oopla');
    let host = this.config.localAddress;
    dns.lookup(this.config.localAddress, (err, result) => {
      host = result;
      // TODO sanity checks if error
    });
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    this.webSocketClient = new jaysonic.client.ws({
      url: 'wss://'+host+':55055',
      secure: true,
      strictSSL: false,
      rejectUnauthorized: false,
      secureProtocol: 'SSLv3_method',
      host: host,
      port: 55055,
    });
    jaysonic.logging.setLogger(this.log);
    this.webSocketClient.serverDisconnected(() => {
      this.log.debug('disconnected');
    });
    this.webSocketClient
      .connect()
      .then((host) => {
        //this.log.debug(host);
        //this.log.debug(this.webSocketClient.pcolInstance);
        this.webSocketClient.pcolInstance.messageBuffer.getMessage = function() {
          //this.log.debug('MY GET MESSAGE');
          let dquote = 0;
          let braketDeepth = 0;
          let delimiterIndex = -1;
          let index;
          for (index = 0; index < this.buffer.length; index++) {
            delimiterIndex++;
            if (this.buffer[index] === '"' && this.buffer[index-1] !== '\\') {
              dquote = (dquote + 1) % 2;
            }
            if (this.buffer[index] === '{' && dquote === 0) {
              braketDeepth += 1;
            }
            if (this.buffer[index] === '}' && dquote === 0) {
              braketDeepth -= 1;
            }
            if (braketDeepth === 0) {
              break;
            }
          }
          //this.log.debug('MY GET MESSAGE ', index, braketDeepth);

          if (delimiterIndex !== -1) {
            const message = this.buffer.slice(0, delimiterIndex+1);
            this.buffer = this.buffer.replace(message, '');
            //this.log.debug(message);
            return message;
          }
          //this.log.debug(this.buffer);
          return (null);
        };
        this.webSocketClient.pcolInstance.messageBuffer.isFinished = function() {
          //this.log.debug('MY IS FINISH BUFFER');
          //this.log.debug(this.buffer);

          if (this.buffer.length === 0) {
            return true;
          }
          let dquote = 0;
          let braketDeepth = 0;
          let index;
          for (index = 0; index < this.buffer.length; index++) {
            if (this.buffer[index] === '"') {
              dquote = (dquote + 1) % 2;
            }
            if (this.buffer[index] === '{' && dquote === 0) {
              braketDeepth += 1;
            }
            if (this.buffer[index] === '}' && dquote === 0) {
              braketDeepth -= 1;
            }
          }
          if (braketDeepth !== 0) {
            return true;
          }
          return false;
        };
        this.webSocketClient.pcolInstance.verifyData = function(chunk) {
          try {
            // will throw an error if not valid json
            const message = JSON.parse(chunk);
            if (Array.isArray(message)) {
              this.gotBatch(message);
            } else if (!(message === Object(message))) {
              // error out if it cant be parsed
              throw SyntaxError();
            } else if (!('id' in message)) {
              // no id, so assume notification
              this.gotNotification(message);
            } else if (message.error) {
              // got an error back so reject the message
              const id = message.id;
              const _message$error = message.error,
                code = _message$error.code,
                data = _message$error.data;
              const errorMessage = message.error.message;

              this._raiseError(errorMessage, code, id, data);
            } else if ('result' in message) {
              // Got a result, so must be a response
              this.gotResponse(message);
            } else if ('method' in message) {
              this.gotNotification(message);
            } else {
              const _code = ERR_CODES.unknown;
              const _errorMessage = ERR_MSGS.unknown;
              this._raiseError(_errorMessage, _code, null);
            }
          } catch (e) {
            if (e instanceof SyntaxError) {
              const _code2 = ERR_CODES.parseError;

              const _errorMessage2 = 'Unable to parse message: \''.concat(chunk, '\'');

              this._raiseError(_errorMessage2, _code2, null);
            } else {
              throw e;
            }
          }
        };
        this.log.info(`connected to ${host.target._url}`);
        this.webSocketClient.subscribe('notify_state', (message) => {
          this.log.debug('lemme handle notify_state');
          this.log.debug(message);
          if ('params' in message) {
            if ('level' in message.params &&
                'address' in message.params) {
              if (DoozHomebridgePlatform.accessoryLightMap.has(message.params.address)) {
                DoozHomebridgePlatform.accessoryLightMap[message.params.address]
                  .updateState(message.params.level);
              } else if (DoozHomebridgePlatform.accessoryShuttertMap.has(message.params.address)) {
                if ('target' in message.params) {
                  DoozHomebridgePlatform.accessoryShuttertMap[message.params.address]
                    .updateState(message.params.level, message.params.target);
                }
              } // TODO find something more elegant with inheritance... this is shit
            }
          }
          // TODO : find the accessory by unicast and update characteristic level
          // {jsonrpc: "2.0", method: "notification", params: []}
        });
        this.onOoplaConnected();
      })
      .catch((error) => {
        this.log.debug(`connection error : ${error}`);
        this.log.debug(error);
      });

    //this.webSocketClient.end(() => this.log.debug('connection ended'));
    //this.log.debug(this.webSocketClient);

  }

  onOoplaSocketError() {
  //  this.log.debug('ERROR');
    this.log.debug('error');
  }

  onOoplaConnected() {
    this.log.debug('connected');
    this.authenticateFireBase();
    // this.log.debug('connected');
  }

  onOoplaDisconnected() {
    this.log.debug('disconnected');
  }

  onOoplaMessage(data) {
    this.log.debug('got from oopla');
    //this.log.debug(`got from oopla : ${data.data} ms`);
    this.log.debug(data);

    setTimeout(() => {
      //      this.webSocket.send('lol');
    }, 60*1000);
  }

  authenticateFireBase() {
    this.log.debug('start auth');
    this.webSocketClient
      .send('authenticate',
        {
          login: this.config.accountEmail,
          password: this.config.accountPassword,
        })
      .then((result) => {
        this.log.debug(result);
        // TODO check if false.....
        this.discoverDevices();      // {jsonrpc: "2.0", result: 3, id: 1}
      })
      .catch((error) => {
        this.log.debug(error);
      });
  }

  onOoplaAuthenticated(message: string) {
    if (message === 'ok') {
      this.log.debug('authentication ok');
      this.discoverDevices();
    }
  }


  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  discoverDevices() {
    this.webSocketClient
      .send('discover', null)
      .then((result) => {
        this.log.debug(result['result']['mesh']);
        //this.log.debug(result['result']['mesh'].keys);
        for (const node of Object.entries(result['result']['mesh'])) {
          if (Array.isArray(node)) {
            //const nodeAddr = node[0];
            const nodeDef = node[1];

            if (typeof nodeDef === 'object' && nodeDef !== null) {
              if ('conf state' in nodeDef && nodeDef['conf state'] === 'CONFIGURED' &&
                  'nodes' in nodeDef && Array.isArray(nodeDef['nodes'])) {
                // --------------------------------- prendre ici les infos du noeud
                //this.log.debug('discovered');
                //this.log.debug('mac '+nodeDef['mac_address']);
                for (const nodeIndex in nodeDef['nodes']) {
                  const equipement = nodeDef['nodes'][nodeIndex];
                  if ('output conf' in equipement &&
                      'name' in equipement &&
                      'address' in equipement) {
                    // --------------------------------- prendre ici les infos de l'equipement
                    //this.log.debug(equipement);
                    const macAddr: string = nodeDef['mac_address'];
                    const unicastAddr: string = equipement['address'];
                    const outputType: number = equipement['output conf'];
                    const eqName: string = equipement['name'];
                    const roomName = equipement['room']['name'];
                    const device: DoozDeviceDef = {
                      uniqueId: macAddr+'::'+unicastAddr,
                      unicast: unicastAddr,
                      mac: macAddr,
                      displayName: eqName+' - '+roomName,
                      room: roomName,
                      output_conf: outputType,
                    };
                    //this.registerDevice(macAddr, unicastAddr, outputType, eqName, roomName);
                    this.registerDevice(device);
                    if (device.output_conf === DoozEquipementType.Shutter) {
                      break;
                    }
                    //this.log.debug('equip name - '+equipement['name']);
                    //this.log.debug('equip addr - '+equipement['address']);
                  }
                }
              }
            }
          }
          //this.log.debug(node['nodes']);
          //for (const equipement of elements['nodes']) {
          //  this.log.debug(equipement);
          //}
        }
      // {jsonrpc: "2.0", result: 3, id: 1}
      })
      .catch((error) => {
        this.log.debug(error);
      });
  }

  //registerDevice(macAddr: string, unicastAddr: string,
  //  outputType: Int16, eqName: string, roomName: string) {
  registerDevice(device: DoozDeviceDef) {
    // EXAMPLE ONLY
    // A real plugin you would discover accessories from the local network, cloud services
    // or a user-defined array in the platform config.
    //const exampleDevices = [
    //  {
    //    uniqueId: '0002',
    //    displayName: 'DooblV 1 testRoom',
    //  },
    //  {
    //    uniqueId: '0007',
    //    displayName: 'Varioo 1 testRoom',
    //  },
    //];


    // generate a unique id for the accessory this should be generated from
    // something globally unique, but constant, for example, the device serial
    // number or MAC address
    const uuid = this.api.hap.uuid.generate(device.uniqueId);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    let existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

      // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
      // existingAccessory.context.device = device;
      // this.api.updatePlatformAccessories([existingAccessory]);

      // create the accessory handler for the restored accessory
      // this is imported from `platformAccessory.ts`

      // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, eg.:
      // remove platform accessories when no longer present
      // this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
      // this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
    } else {
      // the accessory does not yet exist, so we need to create it
      this.log.info('Adding new accessory:', device.displayName);

      // create a new accessory
      existingAccessory = new this.api.platformAccessory(device.displayName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      existingAccessory.context.device = device;

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
    }

    if (device.output_conf === DoozEquipementType.OnOff ||
      device.output_conf === DoozEquipementType.Dimmer) {
      const eq: DoozLightAccessory = new DoozLightAccessory(this, existingAccessory, device);
      DoozHomebridgePlatform.accessoryLightMap[device.unicast] = eq;
    } else if (device.output_conf === DoozEquipementType.Shutter) {
      const eq: DoozShutterAccessory = new DoozShutterAccessory(this, existingAccessory, device);
      DoozHomebridgePlatform.accessoryShuttertMap[device.unicast] = eq;
    } // TODO find something more elegant with inheritance... this is shit

    setInterval(() => {
      //this.log.debug('platform timer ', this.Characteristic.Name);
      //this.webSocketClient.end();
      //this.connectOopla();
      //this.webSocket.send('Date.now');
      //      // EXAMPLE - inverse the trigger
    //      motionDetected = !motionDetected;
    //
    //      // push the new value to HomeKit
    //      motionSensorOneService.updateCharacteristic(this.platform.Characteristic.MotionDetected, motionDetected);
    //      motionSensorTwoService.updateCharacteristic(this.platform.Characteristic.MotionDetected, !motionDetected);
    //
    //      this.platform.log.debug('Triggering motionSensorOneService:', motionDetected);
    //      this.platform.log.debug('Triggering motionSensorTwoService:', !motionDetected);
      //this.discoverDevices();
    }, (10*60*1000)); // once per 10 min
  }
}

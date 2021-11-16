import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { ExamplePlatformAccessory } from './platformAccessory';

import _require2 = require('jaysonic/lib/util/constants');
const ERR_CODES = _require2.ERR_CODES;
const ERR_MSGS = _require2.ERR_MSGS;

export class DoozDeviceDef {
  public uniqueId = '';
  public mac = '';
  public unicast = '';
  public displayName = '';
  public room = '';
  public output_conf = 0;
}

import jaysonic = require('jaysonic');

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class ExampleHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  public webSocketClient : jaysonic;
  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  private static platformRef: ExampleHomebridgePlatform;

  public static accessoryMap: Map<string, ExamplePlatformAccessory> = new Map<string, ExamplePlatformAccessory>();

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name);
    ExampleHomebridgePlatform.platformRef = this;
    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      log.debug('Leaving didFinishLaunching callback');
      ExampleHomebridgePlatform.platformRef.connectOopla();
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
    //const host = '192.168.1.73';
    //const port = 55055;
    //const self = this;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    this.webSocketClient = new jaysonic.client.ws({
      url: 'wss://DOOZ-OOPLA.local:55055',
      secure: true,
      strictSSL: false,
      rejectUnauthorized: false,
      secureProtocol: 'SSLv3_method',
      host: 'DOOZ-OOPLA.local',
      port: 55055,
    });
    jaysonic.logging.setLogger(ExampleHomebridgePlatform.platformRef.log);
    this.webSocketClient.serverDisconnected(() => {
      ExampleHomebridgePlatform.platformRef.log.debug('disconnected');
    });
    this.webSocketClient
      .connect()
      .then((host) => {
        //console.log(host);
        //console.log(this.webSocketClient.pcolInstance);
        this.webSocketClient.pcolInstance.messageBuffer.getMessage = function() {
          //console.log('MY GET MESSAGE');
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
          //console.log('MY GET MESSAGE ', index, braketDeepth);

          if (delimiterIndex !== -1) {
            const message = this.buffer.slice(0, delimiterIndex+1);
            this.buffer = this.buffer.replace(message, '');
            //console.log(message);
            return message;
          }
          //console.log(this.buffer);
          return (null);
        };
        this.webSocketClient.pcolInstance.messageBuffer.isFinished = function() {
          //console.log('MY IS FINISH BUFFER');
          //console.log(this.buffer);

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
        ExampleHomebridgePlatform.platformRef.log.info(`connected to ${host.target._url}`);
        ExampleHomebridgePlatform.platformRef.webSocketClient.subscribe('notify_state', (message) => {
          console.log('lemme handle notify_state');
          console.log(message);
          if ('params' in message) {
            if ('level' in message.params &&
                'address' in message.params) {
              ExampleHomebridgePlatform.accessoryMap[message.params.address].updateState(message.params.level);
            }
          }
          // TODO : find the accessory by unicast and update characteristic level
          // {jsonrpc: "2.0", method: "notification", params: []}
        });
        ExampleHomebridgePlatform.platformRef.onOoplaConnected();
      })
      .catch((error) => {
        ExampleHomebridgePlatform.platformRef.log.debug(`connection error : ${error}`);
        console.log(error);
      });

    //this.webSocketClient.end(() => console.log('connection ended'));
    //console.log(this.webSocketClient);

  }

  onOoplaSocketError() {
  //  this.log.debug('ERROR');
    ExampleHomebridgePlatform.platformRef.log.debug('error');
  }

  onOoplaConnected() {
    ExampleHomebridgePlatform.platformRef.log.debug('connected');
    ExampleHomebridgePlatform.platformRef.authenticateFireBase();
    // this.log.debug('connected');
  }

  onOoplaDisconnected() {
    ExampleHomebridgePlatform.platformRef.log.debug('disconnected');
  }

  onOoplaMessage(data) {
    ExampleHomebridgePlatform.platformRef.log.debug('got from oopla');
    //this.log.debug(`got from oopla : ${data.data} ms`);
    console.log(data);

    setTimeout(() => {
      //      this.webSocket.send('lol');
    }, 60*1000);
  }

  authenticateFireBase() {
    ExampleHomebridgePlatform.platformRef.log.debug('start auth');
    ExampleHomebridgePlatform.platformRef.webSocketClient
      .send('authenticate',
        {
          login: 'email@gmail.com',
          password:'pass',
        })
      .then((result) => {
        // TODO check if false.....
        ExampleHomebridgePlatform.platformRef.discoverDevices();      // {jsonrpc: "2.0", result: 3, id: 1}
      })
      .catch((error) => {
        console.log(error);
      });
  }

  onOoplaAuthenticated(message: string) {
    if (message === 'ok') {
      ExampleHomebridgePlatform.platformRef.log.debug('authentication ok');
      ExampleHomebridgePlatform.platformRef.discoverDevices();
    }
  }


  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  discoverDevices() {
    ExampleHomebridgePlatform.platformRef.webSocketClient
      .send('discover', null)
      .then((result) => {
        //console.log(result['result']['mesh']);
        //console.log(result['result']['mesh'].keys);
        for (const node of Object.entries(result['result']['mesh'])) {
          if (Array.isArray(node)) {
            //const nodeAddr = node[0];
            const nodeDef = node[1];

            if (typeof nodeDef === 'object' && nodeDef !== null) {
              if ('conf state' in nodeDef && nodeDef['conf state'] === 'CONFIGURED' &&
                  'nodes' in nodeDef && Array.isArray(nodeDef['nodes'])) {
                // --------------------------------- prendre ici les infos du noeud
                //console.log('discovered');
                //console.log('mac '+nodeDef['mac_address']);
                for (const nodeIndex in nodeDef['nodes']) {
                  const equipement = nodeDef['nodes'][nodeIndex];
                  if ('output conf' in equipement &&
                      'name' in equipement &&
                      'address' in equipement) {
                    // --------------------------------- prendre ici les infos de l'equipement
                    //console.log(equipement);
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
                    //ExampleHomebridgePlatform.platformRef.registerDevice(macAddr, unicastAddr, outputType, eqName, roomName);
                    ExampleHomebridgePlatform.platformRef.registerDevice(device);
                    //console.log('equip name - '+equipement['name']);
                    //console.log('equip addr - '+equipement['address']);
                  }
                }
              }
            }
          }
          //console.log(node['nodes']);
          //for (const equipement of elements['nodes']) {
          //  console.log(equipement);
          //}
        }
      // {jsonrpc: "2.0", result: 3, id: 1}
      })
      .catch((error) => {
        console.log(error);
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
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

      // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
      // existingAccessory.context.device = device;
      // this.api.updatePlatformAccessories([existingAccessory]);

      // create the accessory handler for the restored accessory
      // this is imported from `platformAccessory.ts`
      const eq: ExamplePlatformAccessory = new ExamplePlatformAccessory(this, existingAccessory, device);

      ExampleHomebridgePlatform.accessoryMap[device.unicast] = eq;

      // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, eg.:
      // remove platform accessories when no longer present
      // this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
      // this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
    } else {
      // the accessory does not yet exist, so we need to create it
      this.log.info('Adding new accessory:', device.displayName);

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.displayName, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;

      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      new ExamplePlatformAccessory(this, accessory, device);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }

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
    }, (24*60*60*1000)); // once a day
  }
}

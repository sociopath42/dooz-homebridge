import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { ExamplePlatformAccessory } from './platformAccessory';


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
      host: '192.168.1.73',
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
            if (this.buffer[index] === '"') {
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

        ExampleHomebridgePlatform.platformRef.log.info(`connected to ${host.target._url}`);
        ExampleHomebridgePlatform.platformRef.onOoplaConnected();
      })
      .catch((error) => {
        ExampleHomebridgePlatform.platformRef.log.debug(`connection error : ${error}`);
        console.log(error);
      });

    //this.webSocketClient.end(() => console.log('connection ended'));
    this.webSocketClient.subscribe('notification', (message) => {
      console.log(message);
      // {jsonrpc: "2.0", method: "notification", params: []}
    });
    this.webSocketClient.subscribe('notify', ExampleHomebridgePlatform.platformRef.onOoplaMessage);
    this.webSocketClient.subscribe('notification', ExampleHomebridgePlatform.platformRef.onOoplaMessage);
    this.webSocketClient.subscribe('result', (message) => {
      console.log(message);
      // {jsonrpc: "2.0", method: "notification", params: []}
    });
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
          login: 'toto@gmail.com',
          password:'toto',
        })
      .then((result) => {
        console.log(result);
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
            const nodeAddr = node[0];
            const nodeDef = node[1];

            if (typeof nodeDef === 'object' && nodeDef !== null) {
              if ('nodes' in nodeDef && Array.isArray(nodeDef['nodes'])) {
                for (const nodeIndex in nodeDef['nodes']) {
                  const equipement = nodeDef['nodes'][nodeIndex];
                  if ('output conf' in equipement &&
                    'name' in equipement &&
                    'address' in equipement) {
                    console.log('discovered');
                    console.log('equip name - '+equipement['name']);
                    console.log('equip addr - '+equipement['address']);
                  }
                }
              }
            }
            // --------------------------------- prendre ici les infos du noeud
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

    // EXAMPLE ONLY
    // A real plugin you would discover accessories from the local network, cloud services
    // or a user-defined array in the platform config.
    const exampleDevices = [
      {
        uniqueId: '0002',
        displayName: 'DooblV 1 testRoom',
      },
      {
        uniqueId: '0007',
        displayName: 'Varioo 1 testRoom',
      },
    ];

    // loop over the discovered devices and register each one if it has not already been registered
    for (const device of exampleDevices) {

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
        new ExamplePlatformAccessory(this, existingAccessory);

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
        new ExamplePlatformAccessory(this, accessory);

        // link the accessory to your platform
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }

    setInterval(() => {
      this.log.debug('platform timer ', this.Characteristic.Name);
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
    }, (60*1000)); // once a day
  }
}

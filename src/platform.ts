import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { DoozLightAccessory } from './DoozLightAccessory';
import { DoozShutterAccessory } from './DoozShutterAccessory';
import { DoozHeaterAccessory } from './DoozHeaterAccessory';
import { DoozSceneAccessory } from './DoozSceneAccessory';
import { DoozLightGroupAccessory } from './DoozLightGroupAccessory';
import { DoozShutterGroupAccessory } from './DoozShutterGroupAccessory';

import _require2 = require('jaysonic/lib/util/constants');
const ERR_CODES = _require2.ERR_CODES;
const ERR_MSGS = _require2.ERR_MSGS;
export class DoozAccessoryDef {
  public uniqUuid = '';
  public equipmentName = '';
}
export class DoozEquipementType {
  static readonly Scene = -1;
  static readonly OnOff = 0;
  static readonly Dimmer = 1;
  static readonly Relay = 2;
  static readonly Shutter = 3;
  static readonly Heater = 4;
  static readonly Pulse = 5;
}
export class DoozDeviceDef {
  public uniqUuid = '';
  public mac = '';
  public unicast = '';
  public equipmentName = '';
  public room = '';
  public output_conf = 0;
}
export class DoozGroupType {
  static readonly DimmerGroup = 101;
  static readonly ShutterGroup = 103;
}
export class DoozGroupDef {
  public uniqUuid = '';
  public unicast = '';
  public equipmentName = '';
  public room = '';
  public groupType = 0;
}
export class DoozSceneDef {
  public uniqUuid = '';
  public sceneId = '';
  public unicast = '';
  public equipmentName = '';
  public room = '';
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
  public static accessoryShutterMap: Map<string, DoozShutterAccessory> = new Map<string, DoozShutterAccessory>();
  public static accessoryHeaterMap: Map<string, DoozHeaterAccessory> = new Map<string, DoozHeaterAccessory>();

  public static accessoryLightGroupMap: Map<string, DoozLightGroupAccessory> = new Map<string, DoozLightGroupAccessory>();
  public static accessoryShutterGroupMap: Map<string, DoozShutterGroupAccessory> = new Map<string, DoozShutterGroupAccessory>();

  private connected = false;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name);
    this.api.on('didFinishLaunching', () => {
      this.connectOopla();
      setInterval(() => {
        const d = new Date();
        this.log.debug('actual time : '+d.getHours()+':'+d.getMinutes());
        if (d.getHours() === 1 && d.getMinutes() <= 5) {
          this.onOoplaDisconnected();
          this.webSocketClient.end();
          this.log.info('daily connection refresh: connection closed');
        }

        if (!this.connected) {
          this.log.debug('Refreshing connection to oopla');
          this.connectOopla();
        }
      }, (5 * 60 * 1000)); // once per 5 min
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
      this.connected = false;
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
        this.webSocketClient.subscribe('notify_state', this.onNotifyState);
        this.onOoplaConnected();
      })
      .catch((error) => {
        this.log.debug(`connection error : ${error}`);
        this.log.debug(error);
      });

    //this.webSocketClient.end(() => this.log.debug('connection ended'));
    //this.log.debug(this.webSocketClient);

  }


  onNotifyState(message) {
    //console.log('lemme handle notify_state');
    //console.log(message);
    if ('params' in message) {
      if ('level' in message.params &&
          'address' in message.params) {
        if (DoozHomebridgePlatform.accessoryLightMap.has(message.params.address)) {
          DoozHomebridgePlatform.accessoryLightMap.get(message.params.address)!
            .updateState(message.params.level);
        } else if (DoozHomebridgePlatform.accessoryShutterMap.has(message.params.address)) {
          if ('target' in message.params) {
            DoozHomebridgePlatform.accessoryShutterMap.get(message.params.address)!
              .updateState(message.params.level, message.params.target);
          }
        } else if (DoozHomebridgePlatform.accessoryHeaterMap.has(message.params.address)) {
          if ('params' in message) {
            if ('level' in message.params) {
                DoozHomebridgePlatform.accessoryHeaterMap.get(message.params.address)!
                  .updateState(message.params.level);
            }
          }
        } // TODO find something more elegant with inheritance... this is shit
      }
    }
    //this.webSocketClient.
    //$send = '{"jsonrpc": "2.0", "result": null, "id": "'.$answer['id'].'"}';

    // TODO : find the accessory by unicast and update characteristic level
    // {jsonrpc: "2.0", method: "notification", params: []}
  }

  onOoplaSocketError() {
  //  this.log.debug('ERROR');
    this.connected = false;
    this.log.debug('error');
  }

  onOoplaConnected() {
    this.log.debug('connected');
    this.connected = true;
    this.authenticateFireBase();
    // this.log.debug('connected');
  }

  onOoplaDisconnected() {
    this.connected = false;
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
        if ('result' in result &&
            'status' in result.result) {
          this.onOoplaAuthenticated(result.result.status);
        } else {
          this.log.error(result);
          // TODO tentative de reco
        }
      })
      .catch((error) => {
        this.log.debug(error);
        this.webSocketClient.end();
        this.connected = false;
      });
  }

  onOoplaAuthenticated(message: string) {
    if (message === 'OK') {
      this.log.debug('authentication ok');
      this.discoverDevices();
    } else {
      this.log.error('authenticate failed');
      // TODO tentative de reco
    }
  }

  onDevicesDiscovered() {
    this.discoverScenes();
    this.discoverGroups();
  }

  discoverScenes() {
    this.webSocketClient
      .send('discover_scenes', null)
      .then((result) => {
        //this.log.debug(result);
        if ('result' in result &&
            'scenes' in result.result) {
          this.log.debug('discovering scenes');
          const allScenesMaster = result.result.scenes;
          this.log.debug(allScenesMaster);
          for (const scenesUid in allScenesMaster) {
            const sceneDesc = allScenesMaster[scenesUid];
            if ('group' in sceneDesc) {
              const sceneGroup = sceneDesc.group;
              if ('scenes' in sceneDesc) {
                for (const sceneIndex in sceneDesc.scenes) {
                  const scene = sceneDesc.scenes[sceneIndex];
                  if ('name' in scene &&
                      'sceneId' in scene) {
                    const sceneName = scene.name;
                    const sceneId = scene.sceneId;
                    const sceneAcc: DoozSceneDef = {
                      uniqUuid: sceneGroup+'::'+sceneId,
                      sceneId: sceneId,
                      unicast: sceneGroup,
                      equipmentName: sceneName,
                      room: '',
                    };
                    const accessory = this.registerScene(sceneAcc);
                    new DoozSceneAccessory(this, accessory, sceneAcc);
                  }
                }
              }
            }
          }
        }
      })
      .catch((error) => {
        this.log.debug(error);
      });
  }

  discoverGroups() {
    this.webSocketClient
      .send('discover_groups', null)
      .then((result) => {
        this.log.debug(result);
        if ('result' in result &&
            'groups' in result.result) {
          this.log.debug('discovering groups');
          const allgroups = result.result.groups;
          //  this.log.debug(allScenesMaster);
          for (const groupName in allgroups) {
            const groupDef = allgroups[groupName];
            //console.log(groupDef);
            if ('groupAddress' in groupDef) {
              //console.log(groupName+' - addr: '+groupDef.groupAddress);

              const groupAddress = groupDef.groupAddress;
              if ('id' in groupDef) {
                //const groupId = groupDef.id;
                if ('equipments' in groupDef) {
                  //console.log(groupDef.equipments);
                  //console.log(groupDef.equipments);
                  // determine if is a shutter or light group
                  // and register it
                  if (Array.isArray(groupDef.equipments) &&
                          groupDef.equipments.length > 0) {
                    const eqAddr: number = groupDef.equipments[0]['nodeId'] + 1;
                    const eqNode: string = eqAddr.toString(16).padStart(4, '0');
                    let eqType: number;
                    if (DoozHomebridgePlatform.accessoryShutterMap.has(eqNode)) {
                      eqType = DoozGroupType.ShutterGroup;
                    } else {
                      eqType = DoozGroupType.DimmerGroup;
                    }
                    const groupAcc: DoozGroupDef = {
                      uniqUuid: groupAddress+'::'+eqType,
                      unicast: groupAddress,
                      equipmentName: groupName,
                      room: '',
                      groupType: eqType,
                    };
                    const accessory = this.registerGroup(groupAcc);
                    if (eqType === DoozGroupType.DimmerGroup) {
                      const group = new DoozLightGroupAccessory(this, accessory, groupAcc);
                      for (const groupEquipement of groupDef.equipments) {
                        if ('name' in groupEquipement &&
                          'nodeId' in groupEquipement) {
                          for (const savedAccessory of DoozHomebridgePlatform.accessoryLightMap.values()) {
                            if ((savedAccessory.getEquipmentName() === groupEquipement.name) &&
                                     (savedAccessory.getUnicast().toUpperCase() ===
                                      (groupEquipement.nodeId + 1).toString(16).toUpperCase().padStart(4, '0') ||
                                      savedAccessory.getUnicast().toUpperCase() ===
                                      (groupEquipement.nodeId + 2).toString(16).toUpperCase().padStart(4, '0'))) {
                              //console.log('Match saved '+savedAccessory.getEquipmentName() + ':'+savedAccessory.getUnicast()+
                              //              ' in grp '+groupEquipement.name+':'+groupEquipement.nodeId.toString(16).padStart(4, '0'));
                              savedAccessory.addToGroup(group);
                            }
                          }
                        }
                      }
                    } else {
                      const group = new DoozShutterGroupAccessory(this, accessory, groupAcc);
                      for (const groupEquipement of groupDef.equipments) {
                        if ('name' in groupEquipement &&
                          'nodeId' in groupEquipement) {
                          for (const savedAccessory of DoozHomebridgePlatform.accessoryShutterMap.values()) {
                            if ((savedAccessory.getEquipmentName() === groupEquipement.name) &&
                                     (savedAccessory.getUnicast().toUpperCase() ===
                                      (groupEquipement.nodeId + 1).toString(16).toUpperCase().padStart(4, '0') ||
                                      savedAccessory.getUnicast().toUpperCase() ===
                                      (groupEquipement.nodeId + 2).toString(16).toUpperCase().padStart(4, '0'))) {
                              //console.log('Match saved '+savedAccessory.getEquipmentName() + ':'+savedAccessory.getUnicast()+
                              //              ' in grp '+groupEquipement.name+':'+groupEquipement.nodeId.toString(16).padStart(4, '0'));
                              savedAccessory.addToGroup(group);
                            }
                          }
                        }
                      }

                    }
                  }








                }
              }
            }
          }
        }
      })
      .catch((error) => {
        this.log.debug(error);
      });
  }

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

            if (typeof nodeDef === 'object' && nodeDef !== null &&
                'conf state' in nodeDef && 'ongoing_conf' in nodeDef) {
              if ( ((nodeDef['conf state'] === 'GHOST') ||
              (nodeDef['conf state'] === 'CONFIGURED') ||
              (nodeDef['conf state'] === 'LOCKED')) ||
              (nodeDef['ongoing_conf'] !== true) &&
              'nodes' in nodeDef && Array.isArray(nodeDef['nodes'])) {
                // --------------------------------- prendre ici les infos du noeud
                this.log.debug('discovered');
                this.log.debug('mac '+nodeDef['mac_address']);
                //console.log(nodeDef);
                if ('name' in nodeDef &&
                    nodeDef['name'] !== null &&
                    nodeDef['name'] !== 'Unknown module name' &&
                    'mac_address' in nodeDef &&
                    nodeDef['mac_address'] !== null
                ) {
                  for (const nodeIndex in nodeDef['nodes']) {
                    const equipement = nodeDef['nodes'][nodeIndex];

                    if ('output conf' in equipement &&
                      equipement.output_conf !== null &&
                      'address' in equipement &&
                      equipement.address !== null &&
                      'room' in equipement &&
                      equipement.room !== null &&
                      equipement.room !== 'unknown module location' &&
                      'name' in equipement.room &&
                      equipement.room.name !== null) {
                    // --------------------------------- prendre ici les infos de l'equipement
                      const macAddr: string = nodeDef['mac_address'];
                      const unicastAddr: string = equipement['address'];
                      const outputType: number = equipement['output conf'];
                      const eqName: string = equipement['name'];
                      const roomName = equipement['room']['name'];
                      const device: DoozDeviceDef = {
                        uniqUuid: macAddr+'::'+unicastAddr,
                        unicast: unicastAddr,
                        mac: macAddr,
                        equipmentName: eqName,
                        room: roomName,
                        output_conf: outputType,
                      };
                      if (device.output_conf === DoozEquipementType.OnOff ||
                          device.output_conf === DoozEquipementType.Relay ||
                          device.output_conf === DoozEquipementType.Dimmer) {
                        const accessory = this.registerDevice(device);
                        const eq: DoozLightAccessory = new DoozLightAccessory(this, accessory, device);
                        DoozHomebridgePlatform.accessoryLightMap.set(device.unicast, eq);
                      } else if (device.output_conf === DoozEquipementType.Shutter) {
                        const accessory = this.registerDevice(device);
                        const eq: DoozShutterAccessory = new DoozShutterAccessory(this, accessory, device);
                        DoozHomebridgePlatform.accessoryShutterMap.set(device.unicast, eq);
                      } else if (device.output_conf === DoozEquipementType.Heater) {
                        //const accessory = this.registerDevice(device);
                        //const eq: DoozHeaterAccessory = new DoozHeaterAccessory(this, accessory, device);
                        //DoozHomebridgePlatform.accessoryHeaterMap.set(device.unicast, eq);
                      }
                      if (device.output_conf === DoozEquipementType.Shutter as number) {
                        break;
                      }
                    }
                  }
                }
              }
            }
          }
        }
        this.onDevicesDiscovered();
      })
      .catch((error) => {
        this.log.debug(error);
      });
  }

  registerDevice(device: DoozDeviceDef): PlatformAccessory {
    const acc: DoozAccessoryDef = {
      uniqUuid : device.uniqUuid,
      equipmentName : device.equipmentName,
    };

    return this.registerAccessory(acc, device);
  }

  registerGroup(group: DoozGroupDef): PlatformAccessory {
    const acc: DoozAccessoryDef = {
      uniqUuid : group.uniqUuid,
      equipmentName : group.equipmentName,
    };
    return this.registerAccessory(acc, group);
  }

  registerScene(scene: DoozSceneDef): PlatformAccessory {
    const acc: DoozAccessoryDef = {
      uniqUuid : scene.uniqUuid,
      equipmentName : scene.equipmentName,
    };
    return this.registerAccessory(acc, scene);
  }

  registerAccessory(accessory: DoozAccessoryDef, device: object): PlatformAccessory {
    const uuid = this.api.hap.uuid.generate(accessory.uniqUuid);
    let existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

    if (existingAccessory) {
      this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
    } else {
      this.log.info('Adding new accessory:', accessory.equipmentName);

      existingAccessory = new this.api.platformAccessory(accessory.equipmentName, uuid);
      existingAccessory.context.device = device;
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
    }

    return existingAccessory;
  }
}

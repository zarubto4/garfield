/**
 * Created by davidhradek on 19.06.17.
 */

import { resolve } from 'path';
import { Logger, LoggerFileTarget, LoggerLevel, LoggerManager } from 'logger';
import { readFileSync } from 'fs';

/**
 * ConfigManager is used to load config json and validate it
 */

export class ConfigManager {

    /**************************************
     *
     * Public interface
     *
     **************************************/

    public static config: ConfigManager;

    /**
     * Config loggers target, colors and level from loggersConfig
     *
     * @param loggersConfig
     * @param loggerVorpalTarget
     */
    public static configLoggers(loggersConfig: any) {

        let keys = Object.keys(loggersConfig);

        keys.forEach((key) => {
            let config = loggersConfig[key];
            let logger = LoggerManager.get(key);

            logger.config.colorsEnabled = config.colors;
            let level = this.stringToLoggerLevel(config.level);
            if (!level) {
                throw new Error('Wrong logger level for logger ' + key);
            }
            logger.config.logLevel = level;

           // logger.loggerTarget = new LoggerFileTarget(config.target)
        });

    }

    public static loadConfig(path: string) {
        // init ConfigManager - if anything fail, exit program
        try {
            ConfigManager.config = new ConfigManager(path, ConfigManager.validator);
            ConfigManager.configLoggers(ConfigManager.config.get('loggers'));
        } catch (e) {
            Logger.error('ConfigManager init failed with', e.toString());
            process.exit();
        }
    }

    /**
     * Constructor needs configPath (relative to homer-core directory or absolute) and configValidator object
     *
     * configValidator object describe structure of config
     *
     * For example:
     * {
     *   type: 'object',
     *   structure: {
     *     someNumber: {
     *       type: 'number'
     *     },
     *     someBoolean: {
     *       type: 'boolean'
     *     },
     *     arrayOfNumbers: {
     *       type: 'array',
     *       of: {
     *         type: 'number'
     *       }
     *     },
     *     objectsOfBooleans: {
     *       type: 'object',
     *       of: {
     *         type: 'boolean'
     *       }
     *     },
     *     structuredObject: {
     *       type: 'object',
     *       structure: {
     *         someString: {
     *           type: 'string'
     *         },
     *         someNumber: {
     *           type: 'number'
     *         }
     *       }
     *     }
     *   }
     * }
     * will match this json:
     * {
     *   "someNumber": 55,
     *   "someBoolean": false,
     *   "arrayOfNumbers": [1, 2, 3],
     *   "objectsOfBooleans": {
     *     "first": true,
     *     "second": false
     *   },
     *   "structuredObject": {
     *     "someString": "hello",
     *     "someNumber": 66
     *   }
     * }
     *
     * @param configPath
     * @param configValidator
     */
    constructor(configPath: string, configValidator: any) {

        this.configValidator = configValidator;

        let path = resolve(__dirname + '/../..', configPath);

        Logger.info('ConfigManager::constructor - loading config file:', path);

        let config = readFileSync(path, 'utf8');

        let configObject = JSON.parse(config);

        this.validateAndLoad(configObject);

    }

    /**
     * Get value of any root key in config
     *
     * @param key
     * @returns {any}
     */
    public get<T>(key: string): T {
        if (this.loadedConfig.hasOwnProperty(key)) {
            return this.loadedConfig[key];
        }
        return null;
    }

    /**
     * Get
     *
     * @returns {any}
     */
    public get config(): any {
        return this.loadedConfig;
    }

    /**
     * Convert LoggerLevel to string
     *
     * @param level
     * @returns {any}
     */
    protected static loggerLevelToString(level: LoggerLevel): string {
        switch (level) {
            case LoggerLevel.None: return 'none';
            case LoggerLevel.Error: return 'error';
            case LoggerLevel.Warn: return 'warn';
            case LoggerLevel.Info: return 'info';
            case LoggerLevel.Debug: return 'debug';
            case LoggerLevel.Trace: return 'trace';
        }
        return 'unknown';
    }

    /**
     * Convert string to LoggerLevel
     *
     * @param level
     * @returns {any}
     */
    protected static  stringToLoggerLevel(level: string): LoggerLevel {
        switch (level.toLowerCase()) {
            case 'none': return LoggerLevel.None;
            case 'error': return LoggerLevel.Error;
            case 'warn': return LoggerLevel.Warn;
            case 'info': return LoggerLevel.Info;
            case 'debug': return LoggerLevel.Debug;
            case 'trace': return LoggerLevel.Trace;
        }
        return null;
    }

    private static validator = {
        type: 'object',
        structure: {
            tyrionHost: {
                type: 'string'
            },
            tyrionSecured: {
                type: 'boolean'
            },
            tyrionReconnectTimeout: {
                type: 'number'
            },
            serial: {
                type: 'object',
                structure: {
                    baudRate: {
                        type: 'number'
                    },
                    ctsrts: {
                        type: 'boolean'
                    },
                    crc: {
                        type: 'boolean'
                    }
                }
            },
            updateURL: {
                type: 'object',
                structure: {
                    win: {
                        type: 'string'
                    },
                    darwin: {
                        type: 'string'
                    },
                    linux: {
                        type: 'string'
                    }
                }
            },
            loggers: {
                type: 'object',
                of: {
                    type: 'object',
                    structure: {
                        level: {
                            type: 'string'
                        },
                        colors: {
                            type: 'boolean'
                        },
                        target: {
                            type: 'string'
                        }
                    }
                }
            },
        }
    };

    /**
     * Validate configObject and set it to loadedConfig
     *
     * @param configObject
     */
    protected validateAndLoad(configObject: any) {
        this.loadedConfig = this.validateField(configObject, this.configValidator, 'config file root');
    }

    /**
     * Validate field depends on descriptor, returns validated field or throw Error
     *
     * @param field
     * @param descriptor
     * @param fieldName
     * @returns {any}
     */
    protected validateField(field: any, descriptor: any, fieldName: string): any {

        let wantedType: string = descriptor.type;

        if (!wantedType) {
            throw new Error('Missing "type" property in configValidator field "' + fieldName + '"');
        }

        let realType: string = typeof field;

        if (Array.isArray(field)) {
            realType = 'array';
        }

        if (wantedType !== realType) {
            throw new Error('Field "' + fieldName + '" have type "' + realType + '" but "' + wantedType + '" needed');
        }

        if (realType === 'object') {
            let structure = descriptor.structure;
            let of = descriptor.of;

            if (!structure && !of) {
                throw new Error('Missing "structure" or "of" property in configValidator field "' + fieldName + '"');
            }

            let outObject = {};
            if (structure) {
                let keys = Object.keys(structure);
                keys.forEach((k) => {
                    if (!field.hasOwnProperty(k)) {
                        throw new Error('Missing key "' + k + '" in field "' + fieldName + '"');
                    }

                    outObject[k] = this.validateField(field[k], structure[k], k);
                });
            } else if (of) {
                let keys = Object.keys(field);
                keys.forEach((k) => {
                    outObject[k] = this.validateField(field[k], of, fieldName + '[' + k + ']');
                });
            }

            return outObject;
        }

        if (realType === 'array') {
            let of = descriptor.of;

            if (!of) {
                throw new Error('Missing "of" property in configValidator field "' + fieldName + '"');
            }

            let outArray = [];
            field.forEach((item, index) => {
                outArray.push(this.validateField(item, of, fieldName + '[' + index + ']'));
            });

            return outArray;
        }

        return field;
    }

    protected loadedConfig: any = null;
    protected configValidator = null;
}

import { Logger, LoggerManager, LoggerLevel, LoggerFileTarget } from 'logger'
import { ConfigManager } from './utils/ConfigManager';

const electron = require('electron')
// Module to control application life.
const app = electron.app
// Module to create native browser window.
const BrowserWindow = electron.BrowserWindow

const path = require('path')
const url = require('url')
const {ipcMain} = require('electron')
const usb = require('usb')

const configValidator = {
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
}

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow
let authToken
let configPath = 'config/default.json'

// init ConfigManager - if anything fail, exit program
let configManager :ConfigManager = null
try {
    configManager = new ConfigManager(configPath, configValidator)
    ConfigManager.configLoggers(configManager.get('loggers'))
} catch (e) {
    Logger.error('ConfigManager init failed with', e.toString())
    process.exit()
}

Logger.info('Config:', configManager.config)

function createWindow () {
/*
  let devices = usb.getDeviceList()

  for (var i = 0; i < devices.length; ++i) {
    Logger.info(JSON.stringify(devices[i]))
  }
*/
  Logger.warn("Creating window")

  // Create the browser window.
  mainWindow = new BrowserWindow({width: 800, height: 600})

  Logger.warn("New browser window")

  Logger.warn(__dirname)

  if (authToken) {

    mainWindow.loadURL(url.format({
      pathname: path.join(__dirname, '../views/index.html'),
      protocol: 'file:',
      slashes: true
    }))

  } else {

    mainWindow.loadURL(url.format({
      pathname: path.join(__dirname, '../views/login.html'),
      protocol: 'file:',
      slashes: true
    }))
  }
  

  // Open the DevTools.
  // mainWindow.webContents.openDevTools()

  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)

// Quit when all windows are closed.
app.on('window-all-closed', function () {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', function () {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

ipcMain.on('login', (event, token) => {
  authToken = token

  Logger.warn(authToken)

  mainWindow.loadURL(url.format({
      pathname: path.join(__dirname, '../views/index.html'),
      protocol: 'file:',
      slashes: true
    }))
  
})

ipcMain.on('config', (event) => {
  event.returnValue = configManager.config()
})

ipcMain.on('tyrionUrl', (event) => {
  event.returnValue = getTyrionUrl()
})

ipcMain.on('requestData', (event,requestedData ) => {
 // if (requestedData=== "login"){
    console.log(authToken);
  event.returnValue = authToken;
 // }
})
function getTyrionUrl() : string {

  Logger.info('getTyrionUrl: getting url')

  let host = configManager.get<string>('tyrionHost').trim()
  let secured = configManager.get<boolean>('tyrionSecured')
  let protocol = (secured ? 'https://' : 'http://')

  return protocol + host
}

usb.on('attach', function(device){
  Logger.warn('Device was connected. ' + JSON.stringify(device))
})

usb.on('detach', function(device){
  Logger.warn('Device was disconnected. ' + JSON.stringify(device))
})
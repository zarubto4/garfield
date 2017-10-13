# Garfield Desktop App

**App is used as a bridge between Becki and TestKit. It provides an interface for serial communication with hardware and file system access.**

For released versions go to:

`releases` folder - Only Windows installer is now available.

## To Run

To run this repository you'll need [Node.js](https://nodejs.org/en/download/) (which comes with [npm](http://npmjs.com)) installed on your computer. From your command line:

```bash
# Clone this repository
# Install dependencies
npm install
# Rebuild modules for the version of Node.js that Electron uses.
# Use 'rebuild-win' or 'rebuild-unix' depending on your platorm.
npm run rebuild-win
# Run the app
npm run build-start
```

## To package 

```bash
# Packaging is now available only for Windows
npm run package-win
```

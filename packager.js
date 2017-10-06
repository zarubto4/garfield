const packager = require('electron-packager')
const winstaller = require('electron-winstaller');

console.log("Beggining packaging of your application");

if (process.argv.length < 3) {
    exitWrongArg();
}

switch (process.argv[2]) {
    case 'win': {
        let options = {
            dir: '.',
            platform: 'win32',
            arch: 'x64',
            asar: true,
            out: 'releases/win',
            overwrite: true,
            icon: 'byzance_logo.png',
            tmpdir: '../temp_electron_build',
            ignore: ['src', 'logs', 'distributions', 'releases']
        };

        packager(options)
            .then((appPaths) => {
                console.log(appPaths.toString());
            }, (err) => {
                console.log(JSON.stringify(err));
            });

        break;
    }
    case 'win': {
        break;
    }
    case 'win': {
        break;
    }
    default: exitWrongArg();
}


/*
resultPromise = winstaller.createWindowsInstaller({
    appDirectory: './distributions/garfield-win32-x64',
    outputDirectory: './distributions/win/installers',
    authors: 'Byzance',
    noMsi: true,
    setupExe: 'Garfield',
    exe: 'garfield.exe'
  });

  resultPromise.then(() => console.log("It worked!"), (e) => console.log(`No dice: ${e.message}`));*/

function exitWrongArg() {
    console.error('Run packager with one these arguments: win, osx, deb');
    process.exit();
}

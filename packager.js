const packager = require('electron-packager');
const winstaller = require('electron-winstaller');
const { spawn } = require('child_process');
const path = require('path');
const prompt = require('prompt');
const wininstaller = require('electron-windows-installer');

console.log("Start packaging of your application");

if (process.argv.length < 3) {
    exitWrongArg();
}

switch (process.argv[2]) {
    case 'win': {
        let options = {
            dir: '.',
            platform: 'win32',
            arch: 'x64',
            // asar: true, // Causing fails in distribution
            out: './builds/win',
            overwrite: true,
            icon: './assets/byzance_logo_grey.ico',
            tmpdir: '../temp_electron_build',
            ignore: ['src/communication', 'src/utils', 'src/renderers', 'src/device', 'src/main.ts', 'src/Garfield.ts', 'logs', 'builds', 'releases', 'app_data', '.idea']
        };

        packager(options)
            .then((appPaths) => {
                console.log(appPaths.toString());
                createWinInstaller();
            }, (err) => {
                console.log(JSON.stringify(err));
                if (err.code === 'EPERM') {
                    console.log('Deleting temporary directory for build');
                    const remove_dir = spawn('rm', ['-rf', '../temp_electron_build']); // Deleting directory
                    remove_dir.on('close', (code) => {
                        if (code !== 0) {
                            console.log(`Unable to remove temporary directory. Remove it manually. Path: '${err.path.substring(0, err.path.lastIndexOf('temp_electron_build') + 19)}'`);
                        }
                    });
                    console.info('Application was successfully packaged.')
                    createWinInstaller();
                }         
            });

        break;
    }
    case 'linux': {
        break;
    }
    case 'darwin': {
        break;
    }
    default: exitWrongArg();
}

function createWinInstaller() {
    prompt.message = '';
    prompt.delimiter = '';
    prompt.start();
    prompt.get({
        properties: {
            decision: {
                description : ' > Would you like to create installer? (y/n)',
                default: 'y',
                required: true,
                pattern: /^y$|^n$|^yes$|^no$/,
                message: 'Response must be \'y\', \'n\', \'yes\' or \'no\'!'
            }
        }
    }, (err, res) => {
        prompt.paused = true;
        if (res.decision === 'y' || res.decision === 'yes') {

            console.info('Creating installer ...')

            resultPromise = wininstaller({
                appDirectory: 'builds/win/garfield-win32-x64',
                outputDirectory: 'releases/win',
                remoteReleases: 'http://localhost:3000/releases/win',
                authors: 'Byzance',
                iconUrl: path.resolve(__dirname, 'assets/byzance_logo_grey.ico'),
                noMsi: true,
                setupExe: 'Garfield.exe',
                setupIcon: 'assets/byzance_logo_grey.ico',
                exe: 'Garfield.exe'
            });

            resultPromise.then(() => {
                console.log("Your installer is ready in './releases/win' directory")
            }, (e) => console.log(`Application was built, but failed to create installer: ${e.message}`));
        }
    });

    
}

function exitWrongArg() {
    console.error('Run packager with one of these arguments: win, linux, darwin');
    process.exit();
}

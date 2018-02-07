import { PowerMeasurement, PowerSource, PinMeasurement, PinMeasurementType } from '../device/Tester';
import { Serial } from '../communication/Serial';

export class Parsers {
    public static parsePowerMeasurement(measurement): PowerMeasurement[] {
        let powerMeasurements: PowerMeasurement[] = [];

        measurement = measurement.replace('ATE:meas_pwr=', ''); // Removing the prefix of the result

        if (measurement.match(/;$/)) {
            measurement = measurement.substring(0, measurement.lastIndexOf(';')); // Striping off last semicolon
        }

        let results: string[] = measurement.split(';'); // Creating an array with semicolon as delimiter

        powerMeasurements = [new PowerMeasurement(PowerSource.Usb),  new PowerMeasurement(PowerSource.External), new PowerMeasurement(PowerSource.PasivePoe), new PowerMeasurement(PowerSource.ActivePoe)];
        powerMeasurements.forEach((meas) => {
            meas.vbus = parseFloat(Serial.getMessageValue(results.shift()));
            meas.v3 = parseFloat(Serial.getMessageValue(results.shift()));
            meas.curr = parseFloat(Serial.getMessageValue(results.shift()));
        });

        return powerMeasurements;
    }

    public static parsePinMeasurement(type: PinMeasurementType, measurement: string): PinMeasurement {
        let pinMeasurement = new PinMeasurement(type);
        measurement = measurement.replace('ATE:meas_pins=', ''); // Removing the prefix of the result

        let results: string[] = measurement.split(';');

        results.forEach((meas) => {

            let pins: ('1' | '0')[] = [];

            let value = meas.substring(meas.lastIndexOf(':') + 1);

            for (let i = 0; i < value.length; i++) {
                pins[i] = value.charAt(i) === '1' ? '1' : '0';
            }

            if (meas.startsWith('X:')) {
                pinMeasurement.x = pins;
            }

            if (meas.startsWith('Y:')) {
                pinMeasurement.y = pins;
            }

            if (meas.startsWith('Z:')) {
                pinMeasurement.z = pins;
            }
        });

        return pinMeasurement;
    }
}

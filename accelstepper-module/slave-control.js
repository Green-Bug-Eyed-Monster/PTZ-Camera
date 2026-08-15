// https://github.com/firmata/firmata.js
//
// Install any version that is compatible with 2.3.0
// npm install firmata@^2.3.0
//
// Install exactly version 2.3.0
// npm install firmata@2.3.0
//
// https://github.com/firmata/firmata.js/tree/master/packages/firmata.js/examples
//

//
// ~/node.js/accelstepper-module/slave-control.js
// slave-control.js
//
// Copyright © 2026, Murray R. Van Luyn. <green@bug-eyed.monster>
//


// slave-control.js
const Board = require("firmata");

const DEFAULT_MAX_STEPS_PER_SEC  = 30;  // Works up to ~650 for 28byj-48-5v unipolar stepper motor.
const DEFAULT_POSITION_INCREMENT = 200;
const DEAD_BAND = 0.05;

const Device = {
  PAN:  0,
  TILT: 1,
  ZOOM: 2,
};

class SlaveControl {
  constructor(maxStepsPerSec = DEFAULT_MAX_STEPS_PER_SEC, positionIncrement = DEFAULT_POSITION_INCREMENT) {
    this.maxStepsPerSec = maxStepsPerSec;
    this.positionIncrement = positionIncrement;
    
    // Stores the last known reported position from the board
    this.posnValue = {
      [Device.PAN]: 0,
      [Device.TILT]: 0,  // Objects keyed by Device enum for clarity and safety
      [Device.ZOOM]: 0,
    };
    // Stores the current input value (-1.0 to 1.0) from the controller/API
    this.inputValue = {
      [Device.PAN]: 0,
      [Device.TILT]: 0,
      [Device.ZOOM]: 0,
    };
    this.board = null;
  }

  configureSlave() {
    this.board.accelStepperConfig({
      deviceNum: Device.PAN,
      type: this.board.STEPPER.TYPE.FOUR_WIRE,
      motorPin1: 2,    // IN2 for 28byj-48-5v unipolar stepper motor drive board.
      motorPin2: 3,    // IN4                        ''
      motorPin3: 4,    // IN1                        ''
      motorPin4: 5,    // IN3                        ''
      stepSize: this.board.STEPPER.STEP_SIZE.WHOLE,
    });
    console.log("x device 0 config");

    this.board.accelStepperConfig({
      deviceNum: Device.TILT,
      type: this.board.STEPPER.TYPE.FOUR_WIRE,
      motorPin1: 6,    // IN2 for 28byj-48-5v unipolar stepper motor drive board.
      motorPin2: 7,    // IN4                        ''
      motorPin3: 8,    // IN1                        ''
      motorPin4: 9,    // IN3                        ''
      stepSize: this.board.STEPPER.STEP_SIZE.WHOLE,
    });
    console.log("y device 1 config");

    this.board.accelStepperConfig({
      deviceNum: Device.ZOOM,
      type: this.board.STEPPER.TYPE.FOUR_WIRE,
      motorPin1: 10,    // IN2 for 28byj-48-5v unipolar stepper motor drive board.
      motorPin2: 11,    // IN4                       ''
      motorPin3: 12,    // IN1                       ''
      motorPin4: 13,    // IN3                       ''
      stepSize: this.board.STEPPER.STEP_SIZE.WHOLE,
    });
    console.log("z device 2 config");
  }

  async deconfigureSlave() {
    console.log("Stopping all steppers.");
    const promises = [
      this.stopStepper(Device.PAN),
      this.stopStepper(Device.TILT),
      this.stopStepper(Device.ZOOM),
    ];
    const results = await Promise.allSettled(promises);
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`Error de-configuring device ${index}:`, result.reason);
      }
    });
    console.log("All devices de-configured.");
  }

  async stopStepper(deviceNum) {
    return new Promise((resolve) => { // Removed reject for simplicity in shutdown
      if (!this.board || !this.board.pins.length) { // Check if board is valid/connected
         console.warn(`Board not available, cannot stop device ${deviceNum}.`);
         return resolve(); // Resolve immediately if no board
      }
      try {
        // Set speed to 0 first
        this.board.accelStepperSpeed(deviceNum, 0);
        
        // Disable the stepper (often sufficient to stop it)
        this.board.accelStepperEnable(deviceNum, false);
        
        // Call accelStepperStop - it sends the command and returns immediately
        this.board.accelStepperStop(deviceNum);
        
        // Resolve the promise immediately after sending the commands
        resolve();
        
      } catch (error) {
        console.error(`Error sending stop commands to device ${deviceNum}:`, error);
        resolve(); // Resolve even if there's an error sending commands
      }
    });
  }

  setStepperValue(deviceNum, value) {
    console.log(`Stepper ${deviceNum} joystick: ${value}`);
    // Request the current position first (this is asynchronous)
    this.board.accelStepperReportPosition(deviceNum, (currentPosition) => {
      // Store the reported position
      this.posnValue[deviceNum] = currentPosition;
      console.log(`Stepper ${deviceNum} position reported: ${currentPosition}`);

      // Check if the input value is outside the deadband
      if (Math.abs(value) <= DEAD_BAND) {
        // If inside deadband, stop the stepper
        this.stopStepper(deviceNum).then(() => { // Assuming stopStepper returns a promise
             console.log(`Stepper ${deviceNum} stopped (within deadband).`);
        });
      } else { 
        // If outside deadband, calculate new target position and speed
        const newPosition = currentPosition + Math.round(value * this.positionIncrement);
        const newSpeed = Math.round((value - DEAD_BAND) * this.maxStepsPerSec);

        // Check if a move is actually needed (speed != 0 and position changes)
        // Note: accelStepperTo might handle stationary targets, but this adds clarity
        if (newSpeed !== 0 && newPosition !== currentPosition) {
          console.log(`Stepper ${deviceNum} setting speed: ${newSpeed}`);
          // Set the speed (this command returns immediately)
          this.board.accelStepperSpeed(deviceNum, newSpeed);

          console.log(`Stepper ${deviceNum} moving to new posn: ${newPosition}`);
          // Command the move and provide a completion callback
          this.board.accelStepperTo(deviceNum, newPosition); // No callbacks here - they accumulate with
                                                             // continuous update before completion
        } else if (newSpeed === 0) {
           // If speed is zero but we were outside deadband (e.g., brief pulse), ensure stop
           this.stopStepper(deviceNum).then(() => {
               console.log(`Stepper ${deviceNum} stopped (calculated speed is 0).`);
           });
        } else {
            console.log(`Stepper ${deviceNum} already at target position ${currentPosition}.`);
        }
      }
    });
  }

  /**
   * Initializes the connection to the Firmata board and configures the steppers.
   * Establishes a connection to the specified serial port and sets up the
   * stepper motor configurations once the board is ready.
   *
   * @param {string} portPath - The serial port path for the Firmata board (e.g., "/dev/ttyUSB0").
   * @param {number} [baudRate=115200] - The baud rate for the serial connection. Defaults to 115200.
   * @returns {Promise<void>} A promise that resolves when the board is successfully connected and configured.
   * @throws {Error} Rejects the promise if there is an error connecting to or communicating with the board.
   */
  startSlaveControl(portPath, baudRate = 115200) {
    return new Promise((resolve, reject) => {
      const options = {
        baud: baudRate,
      };
      this.board = new Board(portPath, options);

      this.board.on("ready", () => {
        console.log("board ready");
        this.configureSlave();
        resolve();
      });

      this.board.on("error", (error) => {
        reject(error);
      });
    });
  }

  /**
   * Stops all stepper motors, deconfigures them, and cleans up the board resources.
   * This method attempts to gracefully stop motion on all configured steppers
   * before nullifying the board reference. It should be called before exiting
   * the application to ensure steppers are left in a safe state.
   *
   * @returns {Promise<void>} A promise that resolves when the shutdown and cleanup process is complete.
   *                          It aims to always resolve, logging errors internally if they occur during shutdown.
   */
  async stopSlaveControl() {
    console.log("\nStopping slave control...");

    if (!this.board) {
      console.log("Board not initialized or already closed.");
      return; // Nothing more to do
    }
    try {
      await this.deconfigureSlave();
      console.log("Board deconfiguration finished.");
     
      if (this.board) {
        // Setting board to null might be enough if event listeners are cleaned up
        this.board = null;
        console.log("Closing board");
      }
    } catch (error) {
      console.error("Error stopping slave control:", error);
    } finally {
      console.log("stopSlaveControl sequence complete.");
    }
  }

  /**
  * Gets the last reported position for a specific device.
  * @param {number} deviceNum - The device number (e.g., Device.PAN, Device.TILT, Device.ZOOM).
  * @returns {number} The last known position of the specified stepper motor.
  * @throws {Error} Throws an error if the deviceNum is invalid.
  */
  getPosnValue(deviceNum) {
    // Check if the provided deviceNum is a valid key in the posnValue object
    if (this.posnValue.hasOwnProperty(deviceNum)) {
      return this.posnValue[deviceNum];
    } else {
      // Throw an error instead of warning and returning undefined
      throw new Error(`Attempted to get position for invalid device number: ${deviceNum}`);
    }
  }

  /**
  * Gets the last reported input for a specific device.
  * @param {number} deviceNum - The device number (e.g., Device.PAN, Device.TILT, Device.ZOOM).
  * @returns {number} The last known input of the specified stepper motor (joystick).
  * @throws {Error} Throws an error if the deviceNum is invalid.
  */
  getInputValue(deviceNum) {
    // Check if the provided deviceNum is a valid key in the inputValue object
    // (Note: Corrected from checking this.posnValue to this.inputValue)
    if (this.inputValue.hasOwnProperty(deviceNum)) {
      return this.inputValue[deviceNum];
    } else {
      // Throw an error instead of warning and returning undefined
      throw new Error(`Attempted to get input for invalid device number: ${deviceNum}`);
    }
  }

  /**
  * Sets the input value for a specific device and updates the stepper motor accordingly.
  * @param {number} deviceNum - The device number (e.g., Device.PAN, Device.TILT, Device.ZOOM).
  * @param {number} value - The input value, typically between -1.0 and 1.0.
  * @throws {Error} Throws an error if the value is not a number or outside the range [-1.0, 1.0].
  * @throws {Error} Throws an error if the deviceNum is invalid.
  */
    setInputValue(deviceNum, value) {
      // Add validation for the value range (-1.0 to 1.0)
      if (typeof value !== 'number' || isNaN(value) || value < -1.0 || value > 1.0) {
        // Throw an error instead of just warning
        throw new Error(`Invalid input value ${value} for device ${deviceNum}. Must be a number between -1.0 and 1.0.`);
      }
      
      // Check if the provided deviceNum is a valid key in the inputValue object
      if (this.inputValue.hasOwnProperty(deviceNum)) {
        // Store the input value for the specified device
        this.inputValue[deviceNum] = value;
        
        // Pass the device number and the new value to the stepper control logic
        this.setStepperValue(deviceNum, value);
      } else {
        // Throw an error for invalid device number
        throw new Error(`Attempted to set input for invalid device number: ${deviceNum}`);
      }
    }  
  
}
module.exports = { SlaveControl, Device };
























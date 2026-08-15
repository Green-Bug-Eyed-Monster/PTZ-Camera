// This Node.js application serves an HTML file (index.html) on the root route ("/").
// It provides a simple interface for controlling pan and tilt values, and also provides access to simulated axes and stepper motor positions.
//
// Functionality:
//   - Serves the index.html file, which can contain JavaScript code to interact with a gamepad and send requests to this server.
//   - Handles PUT requests to the "/joystick" endpoint to update the pan, tilt and zoom values.
//   - Handles GET requests to the "/joystick" endpoint to retrieve the current pan, tilt and zoom values.
//   - Handles GET requests to the "/axes" endpoint to retrieve simulated azimuth, altitude and magnification values.
//   - Handles GET requests to the "/steppers" endpoint to retrieve simulated stepper motor positions.
//   - Serves a 404 Not Found response for any other routes or methods.
//
// "/joystick" PUT Request:
//   - Expects a JSON object in the request body with the following format:
//     - It must contain exactly one key, which can be either "pan", "tilt" or "zoom".
//     - The value associated with the key must be a number between -1.0 and 1.0, inclusive.
//   - Upon receiving a valid PUT request:
//     1. Parses the JSON object from the request body.
//     2. Validates that the object has exactly one key ("pan", "tilt" or "zoom") and that the associated value is a valid number between -1.0 and 1.0.
//     3. If the request is valid, updates the internal `panValue`, `tiltValue` or `zoomValue` accordingly and returns the received JSON object in the response with a 200 OK status.
//     4. If the request is invalid, returns a 400 Bad Request status with a JSON object containing an "error" message describing the issue.
//
// "/joystick" GET Request:
//   - Returns a JSON object containing the current `pan`, `tilt` and `zoom` values.
//   - Example response: { "pan": 0.8, "tilt": -0.5, "zoom": -0.5 }
//
// "/axes" GET Request:
//   - Returns a JSON object containing simulated altitude (`alt`), azimuth (`az`) and magnification (`mag`) values.
//   - Example response: { "alt": 45.0, "az": 180.5, "mag": 20.0 }
//
// "/steppers" GET Request:
//   - Returns a JSON object containing simulated stepper motor positions (`x` and `Y`).
//   - Example response: { "x": 1000, "Y": -500, "Z": 1100 }
//
// The server listens on port 3000.
//
// ~/node.js//accelstepper-module/index.js
// index.js
//
// Copyright © 2026, Murray R. Van Luyn. <green@bug-eyed.monster>

const http = require('http');
const fs = require('fs');
const path = require('path');
const { SlaveControl, Device } = require("./slave-control");

const PORT = 3000;
const portPath = "/dev/ttyUSB0"; // Replace with your actual port path
const portBaudRate = 115200;     // Replace with your actual port baud rate


// Store the values for axes
let azValue = 0.0;
let altValue = 0.0;
let magValue = 0.0;

let slave;  // Declare slave outside of main so it can be accessed in SIGINT handler
let server; // Declare server outside of main so it can be accessed in SIGINT handler


const main = async () => {
  try {
    // Create then start an instance of the SlaveControl class
    slave = new SlaveControl();
    await slave.startSlaveControl(portPath, portBaudRate);
    console.log("Slave control started successfully.");

    // Create HTTP Server for default route and endpoints
    server = http.createServer((req, res) => {
      
      // Handle GET index.html for the root route
      if (req.url === '/' && req.method === 'GET') {
        const filePath = path.join(__dirname, 'index.html');
        fs.readFile(filePath, (err, data) => {
          if (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal Server Error');
            return;
          }
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(data);
        });
      }
    
      // Handle PUT requests to /joystick
      else if (req.url === '/joystick' && req.method === 'PUT') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk.toString();
        });
        req.on('end', () => {
          try {
            // 1. Parse the body as JSON
            const parsedBody = JSON.parse(body);
    
            // 2. Validate the JSON object
            const keys = Object.keys(parsedBody);
    
            if (keys.length !== 1) {
              throw new Error('Invalid input: Must contain exactly one key (pan, tilt, or zoom)');
            }
    
            const key = keys[0];
            const value = parsedBody[key];
    
            if (typeof value !== 'number' || isNaN(value) || value < -1.0 || value > 1.0) {
              throw new Error('Invalid input: Value must be a number between -1.0 and 1.0');
            }
    
            // Map the key to the Device enum value
            let deviceNum;
            switch (key) {
              case 'pan':
                deviceNum = Device.PAN;
                break;
              case 'tilt':
                deviceNum = Device.TILT;
                break;
              case 'zoom':
                deviceNum = Device.ZOOM;
                break;
              default:
                // This case should theoretically not be reached due to earlier validation,
                // but it's good practice for robustness.
                throw new Error('Invalid input: Key must be either pan, tilt, or zoom');
            }

            // Call the unified setInputValue function
            slave.setInputValue(deviceNum, value);
    
            // 3. If all is valid, send the object back
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(parsedBody));
    
          } catch (error) {
            // 4. Handle errors
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
          }
        });
      }
    
      // Handle GET requests to /joystick
      else if (req.url === '/joystick' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ pan: slave.getInputValue(Device.PAN),
                                tilt: slave.getInputValue(Device.TILT),
                                zoom: slave.getInputValue(Device.ZOOM) }));
      }
    
      // Handle GET requests to /axes
      else if (req.url === '/axes' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ az: azValue, alt: altValue, mag: magValue }));
      }
    
      // Handle GET requests to /steppers
      else if (req.url === '/steppers' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ x: slave.getPosnValue(Device.PAN),
                                 y: slave.getPosnValue(Device.TILT),
                                 z: slave.getPosnValue(Device.ZOOM) }));
      }
    
      // Handle 404 Not Found
      else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      }
    });
    
    server.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });

    // Program mills-about here, waiting for Ctrl+C.
    
  } catch (error) {
    console.error("Error:", error);
    if (slave) {
      await slave.stopSlaveControl();
    }
    process.exit(1);
  }
};

let isShuttingDown = false;
const shutdown = async (exitCode = 0) => {
  if (isShuttingDown) return; // Prevent multiple shutdowns
  isShuttingDown = true;
  console.log(`\nInitiating shutdown (exit code ${exitCode})...`);
  
  if (server) {
    console.log("Closing HTTP server...");
    await server.close();  // stays open due to open http connection(s),
    server = null;         // so it gets nulled
    console.log("Server reference nulled.");
  } else {
    console.log("HTTP server was not initialized.");
  }

  if (slave) {
    // stopSlaveControl now handles its own logging
    await slave.stopSlaveControl(); 
  } else {
    console.log("Slave control was not initialized.");
  }
  
  console.log("Shutdown complete. Exiting process.");
  process.exit(exitCode);
};

// Handle Ctrl+C (SIGINT)
process.on("SIGINT", async () => {
  console.log("\nCtrl+C detected...");
  await shutdown(0); // Initiate graceful shutdown with exit code 0
});

// Handle other termination signals for robustness
process.on('SIGTERM', async () => {
    console.log('SIGTERM signal received.');
    await shutdown(0);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // It's often recommended to exit after an uncaught exception
    shutdown(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Optionally exit on unhandled rejections
    // shutdown(1);
});


main(); // Start the application



// --- Testing PUT Requests ---

// Valid:
// curl -X PUT -H "Content-Type: application/json" -d '{"pan": 1.0}' http://localhost:3000/joystick
// # Expected output: {"pan":1.0}
// curl -X PUT -H "Content-Type: application/json" -d '{"tilt": -0.5}' http://localhost:3000/joystick
// # Expected output: {"tilt":-0.5}
// curl -X PUT -H "Content-Type: application/json" -d '{"zoom": 0.7}' http://localhost:3000/joystick
// # Expected output: {"zoom":0.7}

// Invalid (Multiple Keys):
// curl -X PUT -H "Content-Type: application/json" -d '{"pan": 1.0, "tilt": 0.5}' http://localhost:3000/joystick
// # Expected output: {"error":"Invalid input: Must contain exactly one key (pan, tilt, or zoom)"}
// curl -X PUT -H "Content-Type: application/json" -d '{"pan": 1.0, "tilt": 0.5, "zoom": 0.2}' http://localhost:3000/joystick
// # Expected output: {"error":"Invalid input: Must contain exactly one key (pan, tilt, or zoom)"}

// Invalid (Wrong Key):
// curl -X PUT -H "Content-Type: application/json" -d '{"foo": 1.0}' http://localhost:3000/joystick
// # Expected output: {"error":"Invalid input: Key must be either pan, tilt, or zoom"}

// Invalid (Value Too Large):
// curl -X PUT -H "Content-Type: application/json" -d '{"pan": 2.0}' http://localhost:3000/joystick
// # Expected output: {"error":"Invalid input: Value must be a number between -1.0 and 1.0"}
// curl -X PUT -H "Content-Type: application/json" -d '{"tilt": -1.5}' http://localhost:3000/joystick
// # Expected output: {"error":"Invalid input: Value must be a number between -1.0 and 1.0"}
// curl -X PUT -H "Content-Type: application/json" -d '{"zoom": 1.1}' http://localhost:3000/joystick
// # Expected output: {"error":"Invalid input: Value must be a number between -1.0 and 1.0"}

// Invalid (Value Not a Number):
// curl -X PUT -H "Content-Type: application/json" -d '{"pan": "abc"}' http://localhost:3000/joystick
// # Expected output: {"error":"Invalid input: Value must be a number between -1.0 and 1.0"}
// curl -X PUT -H "Content-Type: application/json" -d '{"tilt": "xyz"}' http://localhost:3000/joystick
// # Expected output: {"error":"Invalid input: Value must be a number between -1.0 and 1.0"}
// curl -X PUT -H "Content-Type: application/json" -d '{"zoom": "def"}' http://localhost:3000/joystick
// # Expected output: {"error":"Invalid input: Value must be a number between -1.0 and 1.0"}

// Invalid (Empty body):
// curl -X PUT -H "Content-Type: application/json" -d '' http://localhost:3000/joystick
// # Expected output: {"error":"Unexpected end of JSON input"}


// --- Testing GET Requests ---

// GET Request (Initial Values - Should be null):
// curl -X GET http://localhost:3000/joystick
// # Expected output: {"pan":null,"tilt":null,"zoom":null}

// GET Request (After Setting Values):
// curl -X PUT -H "Content-Type: application/json" -d '{"pan": 0.5}' http://localhost:3000/joystick
// curl -X PUT -H "Content-Type: application/json" -d '{"tilt": -0.2}' http://localhost:3000/joystick
// curl -X PUT -H "Content-Type: application/json" -d '{"zoom": 0.8}' http://localhost:3000/joystick
// curl -X GET http://localhost:3000/joystick
// # Expected output: {"pan":0.5,"tilt":-0.2,"zoom":0.8}

// --- Testing GET Requests for /axes ---

// GET Request (Initial Values):
// curl -X GET http://localhost:3000/axes
// # Expected output: {"az":0,"alt":0,"mag":0}

// --- Testing GET Requests for /steppers ---

// GET Request (Initial Values):
// curl -X GET http://localhost:3000/steppers
// # Expected output: {"x":0,"Y":0,"Z":0}
import HueApi from "./utils/hueApi.js";

// You can set your existing username here
const SAVED_USERNAME = "vGrflKvBO3xuBgs75az-jkpQ1VXGRHgLHRZeBYOF"; // Replace with your saved username if you have one

async function setAllLightsYellow() {
  try {
    // // 1. Discover bridge
    // console.log("Discovering Hue bridge...");
    // //const bridges = await HueApi.discoverBridge();
    // console.log(bridges);

    // if (!bridges || bridges.length === 0) {
    //   throw new Error("No Hue bridges found on the network");
    // }

    const bridgeIp = "192.168.1.53";
    console.log("Found bridge at:", bridgeIp);

    // 2. Initialize API with saved username
    const api = new HueApi(bridgeIp, SAVED_USERNAME, false);

    // 3. Get all lights
    console.log("Getting lights...");
    const lights = await api.getLights();
    console.log("Found lights:", Object.keys(lights).length);

    // // 4. Set each light to soft yellow
    const softYellow = {
      on: true,
      bri: 200, // Moderate brightness
      hue: 7000, // Warmer yellow/orange hue (decreased from 12750)
      sat: 180, // Medium saturation for soft color
    };

    for (const lightId of Object.keys(lights)) {
      console.log(`Setting light ${lightId} to soft yellow...`);
      await api.setLightState(lightId, softYellow);
    }
  } catch (error) {
    console.error("Failed:", error.message);
  }
}

// Run the script
setAllLightsYellow();

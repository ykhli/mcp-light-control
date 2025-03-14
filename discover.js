import HueApi from "./utils/hueApi.js";

async function discoverAndSetup() {
  try {
    // 1. Discover bridge
    console.log("Discovering Hue bridge...");
    const bridges = await HueApi.discoverBridge();

    if (!bridges || bridges.length === 0) {
      throw new Error("No Hue bridges found on the network");
    }

    const bridgeIp = bridges[0].internalipaddress;
    console.log("Found bridge at:", bridgeIp);

    // 2. Initialize API
    const api = new HueApi(bridgeIp, null, false);

    // 3. Create new user
    console.log(
      "\nPress the link button on your Hue bridge, then press Enter to continue..."
    );
    await new Promise((resolve) => process.stdin.once("data", resolve));

    const username = await api.createUser("hue-test-app");
    console.log("\n=== SAVE THIS INFORMATION ===");
    console.log("Bridge IP:", bridgeIp);
    console.log("Username:", username);
    console.log("===========================\n");

    return { bridgeIp, username };
  } catch (error) {
    console.error("Setup failed:", error.message);
    throw error;
  }
}

// Run the discovery and setup
if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  discoverAndSetup();
}

export default discoverAndSetup;

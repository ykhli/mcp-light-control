import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import HueApi, { LightState, Light, Lights } from "./utils/hueApi.js";
import dotenv from "dotenv";
import minimist from "minimist";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const nodeHueApi = require("node-hue-api").v3;

const argv = minimist(process.argv.slice(2));

// Load environment variables from .env file
dotenv.config();

// Types
interface MorseCode {
  [key: string]: string;
}

// Morse code dictionary
const MORSE_CODE: MorseCode = {
  A: ".-",
  B: "-...",
  C: "-.-.",
  D: "-..",
  E: ".",
  F: "..-.",
  G: "--.",
  H: "....",
  I: "..",
  J: ".---",
  K: "-.-",
  L: ".-..",
  M: "--",
  N: "-.",
  O: "---",
  P: ".--.",
  Q: "--.-",
  R: ".-.",
  S: "...",
  T: "-",
  U: "..-",
  V: "...-",
  W: ".--",
  X: "-..-",
  Y: "-.--",
  Z: "--..",
  "0": "-----",
  "1": ".----",
  "2": "..---",
  "3": "...--",
  "4": "....-",
  "5": ".....",
  "6": "-....",
  "7": "--...",
  "8": "---..",
  "9": "----.",
};

// Timing constants (in milliseconds)
const DOT_DURATION = 800;
const DASH_DURATION = DOT_DURATION * 3;
const SYMBOL_SPACE = DOT_DURATION;
const LETTER_SPACE = DOT_DURATION * 3;
const WORD_SPACE = DOT_DURATION * 7;

// Hue bridge configuration - Local API
const SAVED_USERNAME = argv.hue_username || process.env.HUE_USERNAME;
const BRIDGE_IP = argv.bridge_ip || process.env.BRIDGE_IP;

// Remote API configuration
const USE_REMOTE = argv.remote === "true" || process.env.USE_REMOTE === "true";
const REMOTE_CLIENT_ID = argv.remote_client_id || process.env.REMOTE_CLIENT_ID;
const REMOTE_CLIENT_SECRET =
  argv.remote_client_secret || process.env.REMOTE_CLIENT_SECRET;
const REMOTE_ACCESS_TOKEN =
  argv.remote_access_token || process.env.REMOTE_ACCESS_TOKEN;
const REMOTE_REFRESH_TOKEN =
  argv.remote_refresh_token || process.env.REMOTE_REFRESH_TOKEN;

// Check if environment variables are set
if (!USE_REMOTE) {
  // Only check these for local API mode
  if (!BRIDGE_IP) {
    throw new Error(
      "When using local API, BRIDGE_IP is required. Please set it to your Hue bridge IP address."
    );
  }

  if (!SAVED_USERNAME) {
    throw new Error(
      "When using local API, HUE_USERNAME is required. Please set it to your Hue bridge username."
    );
  }
} else {
  // Remote API checks
  if (!REMOTE_CLIENT_ID || !REMOTE_CLIENT_SECRET) {
    throw new Error(
      "When using remote API, REMOTE_CLIENT_ID and REMOTE_CLIENT_SECRET are required."
    );
  }

  if (!REMOTE_ACCESS_TOKEN || !REMOTE_REFRESH_TOKEN) {
    throw new Error(
      "When using remote API, REMOTE_ACCESS_TOKEN and REMOTE_REFRESH_TOKEN are required."
    );
  }
}

// Helper functions
function textToMorse(text: string): string {
  return text
    .toUpperCase()
    .split(" ")
    .map((word) =>
      word
        .split("")
        .map((char) => MORSE_CODE[char] || "")
        .filter((code) => code !== "")
        .join(" ")
    )
    .filter((word) => word !== "")
    .join(" / ");
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Function to connect to the remote Hue API
async function getRemoteHueApi() {
  console.error("Connecting to Hue Remote API...");

  try {
    // Create the remote bootstrap using the official approach
    const remoteBootstrap = nodeHueApi.api.createRemote(
      REMOTE_CLIENT_ID,
      REMOTE_CLIENT_SECRET
    );

    // Connect with tokens
    const api = await remoteBootstrap.connectWithTokens(
      REMOTE_ACCESS_TOKEN,
      REMOTE_REFRESH_TOKEN
    );

    console.error("Successfully connected to Remote Hue API");
    return api;
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error("Failed to connect to Remote API:", error.message);
    } else {
      console.error("Failed to connect to Remote API:", String(error));
    }
    throw error;
  }
}

// Function to control lights - works with both local and remote API
async function controlLights(
  api: any,
  lights: any,
  state: { on: boolean }
): Promise<void> {
  if (USE_REMOTE) {
    // Remote API
    const allLights = await api.lights.getAll();
    const lightIds = allLights.map((light: any) => light.id);
    const promises = lightIds.map((lightId: string) => {
      return api.lights.setLightState(lightId, state);
    });
    await Promise.all(promises);
  } else {
    // Local API
    const promises = Object.keys(lights).map((lightId) =>
      api.setLightState(lightId, state)
    );
    await Promise.all(promises);
  }
}

// Create server instance
const server = new McpServer({
  name: "morse-code-light-service",
  version: "1.0.0",
});

server.tool(
  "control_lights",
  "Turn all Philips Hue lights on or off",
  {
    state: z
      .boolean()
      .describe("True to turn lights on, false to turn them off"),
    specific_lights: z
      .array(z.string())
      .optional()
      .describe(
        "Optional list of light IDs to control. If not provided, all lights will be controlled"
      ),
  },
  async ({
    state,
    specific_lights,
  }: {
    state: boolean;
    specific_lights?: string[];
  }) => {
    try {
      if (USE_REMOTE) {
        try {
          // Check if remote API credentials are available
          if (
            !REMOTE_CLIENT_ID ||
            !REMOTE_CLIENT_SECRET ||
            !REMOTE_ACCESS_TOKEN ||
            !REMOTE_REFRESH_TOKEN
          ) {
            throw new Error(
              "Remote API credentials are not configured. Please set REMOTE_CLIENT_ID, REMOTE_CLIENT_SECRET, REMOTE_ACCESS_TOKEN, and REMOTE_REFRESH_TOKEN."
            );
          }

          const api = await getRemoteHueApi();

          // Get all lights from Remote API
          const allLights = await api.lights.getAll();

          // Determine which lights to control
          const lightIds =
            specific_lights || allLights.map((light: any) => light.id);

          // Control the lights
          const promises = lightIds.map((lightId: string) => {
            const light = allLights.find((l: any) => l.id === lightId);
            if (light) {
              return api.lights.setLightState(lightId, { on: state });
            } else {
              return Promise.resolve();
            }
          });

          await Promise.all(promises);

          return {
            content: [
              {
                type: "text",
                text: `Successfully turned ${
                  state ? "on" : "off"
                } the lights using Remote API`,
              },
            ],
          };
        } catch (error: unknown) {
          throw new Error(
            `Remote API error: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      } else {
        try {
          // Check if local API credentials are available
          if (!BRIDGE_IP || !SAVED_USERNAME) {
            throw new Error(
              "Local API credentials are not configured. Please set BRIDGE_IP and HUE_USERNAME."
            );
          }

          const api = new HueApi(BRIDGE_IP, SAVED_USERNAME, false);

          // Get all lights from Local API
          const lights = await api.getLights();

          // Determine which lights to control
          const lightIds = specific_lights || Object.keys(lights);

          // Control the lights
          const promises = lightIds.map((lightId) => {
            if (lights[lightId]) {
              return api.setLightState(lightId, { on: state });
            } else {
              return Promise.resolve();
            }
          });

          await Promise.all(promises);

          return {
            content: [
              {
                type: "text",
                text: `Successfully turned ${
                  state ? "on" : "off"
                } the lights using Local API`,
              },
            ],
          };
        } catch (error: unknown) {
          throw new Error(
            `Local API error: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
    } catch (error: unknown) {
      throw new Error(
        `Failed to control lights: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
);

server.tool(
  "get_lights_info",
  "Get information about all available Philips Hue lights",
  {},
  async () => {
    try {
      if (USE_REMOTE) {
        try {
          // Check if remote API credentials are available
          if (
            !REMOTE_CLIENT_ID ||
            !REMOTE_CLIENT_SECRET ||
            !REMOTE_ACCESS_TOKEN ||
            !REMOTE_REFRESH_TOKEN
          ) {
            throw new Error(
              "Remote API credentials are not configured. Please set REMOTE_CLIENT_ID, REMOTE_CLIENT_SECRET, REMOTE_ACCESS_TOKEN, and REMOTE_REFRESH_TOKEN."
            );
          }

          const api = await getRemoteHueApi();

          // Get all lights
          const allLights = await api.lights.getAll();
          const lightCount = allLights.length;

          // Format light information
          const lightInfo = allLights.map((light: any) => {
            return {
              id: light.id,
              name: light.name || `Light ${light.id}`,
              on: light.state?.on || false,
              brightness: light.state?.brightness,
              hue: light.state?.hue,
              saturation: light.state?.saturation,
              type: light.type || "Unknown",
              modelid: light.modelid || "Unknown",
            };
          });

          return {
            content: [
              {
                type: "text",
                text: `Found ${lightCount} light(s) using Remote API`,
              },
              {
                type: "text",
                text: JSON.stringify(lightInfo, null, 2),
              },
            ],
          };
        } catch (error: unknown) {
          throw new Error(
            `Remote API error: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      } else {
        try {
          // Check if local API credentials are available
          if (!BRIDGE_IP || !SAVED_USERNAME) {
            throw new Error(
              "Local API credentials are not configured. Please set BRIDGE_IP and HUE_USERNAME."
            );
          }

          const api = new HueApi(BRIDGE_IP, SAVED_USERNAME, false);

          // Get all lights
          const lights = (await api.getLights()) as Lights;
          const lightCount = Object.keys(lights).length;

          // Format light information
          const lightInfo = Object.entries(lights).map(([id, light]) => {
            return {
              id,
              name: (light as Light).name || `Light ${id}`,
              on: (light as Light).state?.on || false,
              brightness: (light as Light).state?.bri,
              hue: (light as Light).state?.hue,
              saturation: (light as Light).state?.sat,
              type: (light as Light).type || "Unknown",
              modelid: (light as Light).modelid || "Unknown",
            };
          });

          return {
            content: [
              {
                type: "text",
                text: `Found ${lightCount} light(s) using Local API`,
              },
              {
                type: "text",
                text: JSON.stringify(lightInfo, null, 2),
              },
            ],
          };
        } catch (error: unknown) {
          throw new Error(
            `Local API error: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
    } catch (error: unknown) {
      throw new Error(
        `Failed to get lights info: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
);

server.tool(
  "send_morse_code_through_light",
  "Sends a message through Philips Hue lights using Morse code",
  {
    message: z.string().describe("The message to send through the lights"),
    speed_multiplier: z
      .number()
      .min(0.1)
      .max(5)
      .default(1)
      .describe(
        "Optional speed multiplier for the Morse code (0.1 to 5, default 1)"
      ),
    restore_state: z
      .boolean()
      .default(true)
      .describe(
        "Whether to restore lights to their original state after sending"
      ),
  },
  async ({
    message,
    speed_multiplier = 1,
    restore_state = true,
  }: {
    message: string;
    speed_multiplier?: number;
    restore_state?: boolean;
  }) => {
    try {
      let api: any;
      let lights: any;
      let originalStates: Record<string, any> = {};
      let lightIds: string[];

      // Adjust timing based on speed multiplier
      const adjustedDot = DOT_DURATION / speed_multiplier;
      const adjustedDash = DASH_DURATION / speed_multiplier;
      const adjustedSymbolSpace = SYMBOL_SPACE / speed_multiplier;
      const adjustedLetterSpace = LETTER_SPACE / speed_multiplier;
      const adjustedWordSpace = WORD_SPACE / speed_multiplier;

      if (USE_REMOTE) {
        try {
          // Check if remote API credentials are available
          if (
            !REMOTE_CLIENT_ID ||
            !REMOTE_CLIENT_SECRET ||
            !REMOTE_ACCESS_TOKEN ||
            !REMOTE_REFRESH_TOKEN
          ) {
            throw new Error(
              "Remote API credentials are not configured. Please set REMOTE_CLIENT_ID, REMOTE_CLIENT_SECRET, REMOTE_ACCESS_TOKEN, and REMOTE_REFRESH_TOKEN."
            );
          }

          // Use Remote API
          api = await getRemoteHueApi();

          // Get all lights and store original states
          const allLights = await api.lights.getAll();
          lightIds = allLights.map((light: any) => light.id);

          if (restore_state) {
            for (const light of allLights) {
              originalStates[light.id] = {
                on: light.state.on,
                bri: light.state.bri,
                hue: light.state.hue,
                sat: light.state.sat,
              };
            }
          }
        } catch (error: unknown) {
          throw new Error(
            `Remote API error: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      } else {
        try {
          // Check if local API credentials are available
          if (!BRIDGE_IP || !SAVED_USERNAME) {
            throw new Error(
              "Local API credentials are not configured. Please set BRIDGE_IP and HUE_USERNAME."
            );
          }

          // Use Local API
          api = new HueApi(BRIDGE_IP, SAVED_USERNAME, false);

          // Get all lights and store original states
          lights = await api.getLights();
          lightIds = Object.keys(lights);
          console.log("originalState: \n", originalStates);
          if (restore_state) {
            for (const [id, light] of Object.entries(lights)) {
              originalStates[id] = {
                on: (light as Light).state.on,
                bri: (light as Light).state.bri,
                hue: (light as Light).state.hue,
                sat: (light as Light).state.sat,
              };
            }
          }
        } catch (error: unknown) {
          throw new Error(
            `Local API error: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }

      // Convert message to Morse code
      const morseCode = textToMorse(message);

      // Split into individual symbols and separators
      const parts = morseCode.split("");

      try {
        // Initialize all lights to off before starting
        await Promise.all(
          lightIds.map((id) => {
            if (USE_REMOTE) {
              return api.lights.setLightState(id, { on: false });
            } else {
              return api.setLightState(id, { on: false });
            }
          })
        );

        // Brief pause before starting
        await sleep(adjustedWordSpace);

        for (let i = 0; i < parts.length; i++) {
          const symbol = parts[i];

          switch (symbol) {
            case ".":
              if (USE_REMOTE) {
                // Turn lights on
                await Promise.all(
                  lightIds.map((id) =>
                    api.lights.setLightState(id, {
                      on: true,
                      bri: 254,
                      sat: 254,
                      hue: 10000,
                    })
                  )
                );
                await sleep(adjustedDot);
                // Turn lights off
                await Promise.all(
                  lightIds.map((id) =>
                    api.lights.setLightState(id, { on: false })
                  )
                );
              } else {
                await controlLights(api, lights, { on: true });
                await sleep(adjustedDot);
                await controlLights(api, lights, { on: false });
              }
              await sleep(adjustedSymbolSpace);
              break;

            case "-":
              if (USE_REMOTE) {
                // Turn lights on
                await Promise.all(
                  lightIds.map((id) =>
                    api.lights.setLightState(id, {
                      on: true,
                      bri: 254,
                      sat: 254,
                      hue: 10000,
                    })
                  )
                );
                await sleep(adjustedDash);
                // Turn lights off
                await Promise.all(
                  lightIds.map((id) =>
                    api.lights.setLightState(id, { on: false })
                  )
                );
              } else {
                await controlLights(api, lights, { on: true });
                await sleep(adjustedDash);
                await controlLights(api, lights, { on: false });
              }
              await sleep(adjustedSymbolSpace);
              break;

            case " ":
              if (parts[i + 1] === "/" && parts[i + 2] === " ") {
                await sleep(adjustedWordSpace);
                i += 2;
              } else {
                await sleep(adjustedLetterSpace);
              }
              break;

            case "/":
              break;
          }
        }

        // Restore original states if needed
        if (restore_state) {
          if (USE_REMOTE) {
            for (const [lightId, state] of Object.entries(originalStates)) {
              if (!state.on) {
                // First turn on to set properties, then turn off
                await api.lights.setLightState(lightId, {
                  on: true,
                  bri: state.bri || 254,
                  hue: state.hue,
                  sat: state.sat,
                });
                await api.lights.setLightState(lightId, { on: false });
              } else {
                await api.lights.setLightState(lightId, {
                  on: true,
                  bri: state.bri || 254,
                  hue: state.hue,
                  sat: state.sat,
                });
              }
            }
          } else {
            for (const [lightId, state] of Object.entries(originalStates)) {
              if (!state.on) {
                await api.setLightState(lightId, { ...state, on: true });
                await api.setLightState(lightId, { on: false });
              } else {
                await api.setLightState(lightId, state);
              }
            }
          }
        } else {
          // Just turn all lights on
          if (USE_REMOTE) {
            await Promise.all(
              lightIds.map((id) => api.lights.setLightState(id, { on: true }))
            );
          } else {
            await controlLights(api, lights, { on: true });
          }
        }

        return {
          content: [
            {
              type: "text",
              text: `Successfully sent message "${message}" in Morse code (${morseCode}) using ${
                USE_REMOTE ? "Remote" : "Local"
              } API. originalStates: ${JSON.stringify(originalStates)}`,
            },
          ],
        };
      } catch (error: unknown) {
        throw new Error(
          `Error during Morse code transmission: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    } catch (error: unknown) {
      throw new Error(
        `Failed to send Morse code: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
);

async function main(): Promise<void> {
  try {
    console.error("Starting Morse code light control service...");

    if (USE_REMOTE) {
      console.error("API mode: Remote API");
    } else {
      console.error(`API mode: Local API with Hue Bridge at IP: ${BRIDGE_IP}`);
    }
    console.error(
      "Note: API mode is determined by the --remote flag or USE_REMOTE environment variable"
    );

    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error("Morse code light control service running on stdio");
    console.error("Available tools:");
    console.error(
      "- send_morse_code_through_light: Send a message through lights using Morse code"
    );
    console.error("- control_lights: Turn lights on or off");
    console.error(
      "- get_lights_info: Get information about all available lights"
    );
  } catch (error) {
    console.error(
      "Error starting server:",
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(
    "Fatal error in main():",
    error instanceof Error ? error.message : String(error)
  );
  process.exit(1);
});

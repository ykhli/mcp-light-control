import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import HueApi, { LightState, Light, Lights } from "./utils/hueApi.js";
import dotenv from "dotenv";
import minimist from "minimist";

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
const DOT_DURATION = 200;
const DASH_DURATION = DOT_DURATION * 3;
const SYMBOL_SPACE = DOT_DURATION;
const LETTER_SPACE = DOT_DURATION * 3;
const WORD_SPACE = DOT_DURATION * 7;

// Hue bridge configuration
const SAVED_USERNAME = argv.hue_username || process.env.HUE_USERNAME;
const BRIDGE_IP = argv.bridge_ip || process.env.BRIDGE_IP;

// Check if environment variables are set
if (!SAVED_USERNAME) {
  throw new Error(
    "Environment variable HUE_USERNAME is not set. Please set it to your Hue bridge username."
  );
}

if (!BRIDGE_IP) {
  throw new Error(
    "Environment variable BRIDGE_IP is not set. Please set it to your Hue bridge IP address."
  );
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

async function controlLights(
  api: HueApi,
  lights: Lights,
  state: { on: boolean }
): Promise<void> {
  const promises = Object.keys(lights).map((lightId) =>
    api.setLightState(lightId, state)
  );
  await Promise.all(promises);
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
      // Initialize API
      const api = new HueApi(BRIDGE_IP, SAVED_USERNAME, false);

      // Get all lights
      const lights = (await api.getLights()) as Lights;

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
            text: `Successfully turned ${state ? "on" : "off"} ${
              lightIds.length
            } light(s)`,
          },
        ],
      };
    } catch (error) {
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
  async ({}: {}) => {
    try {
      // Initialize API
      const api = new HueApi(BRIDGE_IP, SAVED_USERNAME, false);

      // Get all lights
      const lights = (await api.getLights()) as Lights;
      const lightCount = Object.keys(lights).length;

      // Format light information
      const lightInfo = Object.entries(lights).map(([id, light]) => {
        return {
          id,
          name: light.name || `Light ${id}`,
          on: light.state?.on || false,
          brightness: light.state?.bri,
          hue: light.state?.hue,
          saturation: light.state?.sat,
          type: light.type || "Unknown",
          modelid: light.modelid || "Unknown",
        };
      });

      return {
        content: [
          {
            type: "text",
            text: `Found ${lightCount} light(s)`,
          },
          {
            type: "text",
            text: JSON.stringify(lightInfo, null, 2),
          },
        ],
      };
    } catch (error) {
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
  "Send a message through Philips Hue lights using Morse code",
  {
    message: z.string().describe("The message to send through the lights"),
    speed_multiplier: z
      .number()
      .min(0.1)
      .max(5)
      .optional()
      .default(1)
      .describe(
        "Optional speed multiplier for the Morse code (0.1 to 5, default 1)"
      ),
    restore_state: z
      .boolean()
      .optional()
      .default(true)
      .describe(
        "Whether to restore lights to their original state after sending the message"
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
      // Initialize API
      const api = new HueApi(BRIDGE_IP, SAVED_USERNAME, false);

      // Get all lights
      const lights = (await api.getLights()) as Lights;

      // Save original states if needed
      const originalStates: { [key: string]: LightState } = {};
      if (restore_state) {
        for (const lightId of Object.keys(lights)) {
          const lightInfo = (await api.getLight(lightId)) as Light;
          originalStates[lightId] = lightInfo.state;
        }
      }

      // Convert message to Morse code
      const morseCode = textToMorse(message);

      // Adjust timing based on speed multiplier
      const adjustedDot = DOT_DURATION / speed_multiplier;
      const adjustedDash = DASH_DURATION / speed_multiplier;
      const adjustedSymbolSpace = SYMBOL_SPACE / speed_multiplier;
      const adjustedLetterSpace = LETTER_SPACE / speed_multiplier;
      const adjustedWordSpace = WORD_SPACE / speed_multiplier;

      // Play the Morse code
      const parts = morseCode.split("");
      for (let i = 0; i < parts.length; i++) {
        const symbol = parts[i];

        switch (symbol) {
          case ".":
            await controlLights(api, lights, { on: true });
            await sleep(adjustedDot);
            await controlLights(api, lights, { on: false });
            await sleep(adjustedSymbolSpace);
            break;

          case "-":
            await controlLights(api, lights, { on: true });
            await sleep(adjustedDash);
            await controlLights(api, lights, { on: false });
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
        for (const [lightId, state] of Object.entries(originalStates)) {
          if (!state.on) {
            await api.setLightState(lightId, { ...state, on: true });
            await api.setLightState(lightId, { on: false });
          } else {
            await api.setLightState(lightId, state);
          }
        }
      } else {
        await controlLights(api, lights, { on: true });
      }

      return {
        content: [
          {
            type: "text",
            text: `Successfully sent message "${message}" in Morse code (${morseCode})`,
          },
        ],
      };
    } catch (error) {
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
    console.error(`Using Hue Bridge at IP: ${BRIDGE_IP}`);

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

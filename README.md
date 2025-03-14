# Morse Code Light Service 💡

This is an MCP server that allows you to control Philips Hue lights and send messages through them using Morse code. Now you can let Cursor or Claude Desktop control your smart lights and even transmit messages through light patterns!

Built with:

- [Philips Hue API](https://developers.meethue.com/)
- [Anthropic MCP](https://docs.anthropic.com/en/docs/agents-and-tools/mcp)
- [Cursor](https://cursor.so/)

## Setup

### Prerequisites

- Philips Hue bridge and lights
- Hue bridge username and IP (you could run the discovery script to get it)

### Cursor

1. First, you need to get your Philips Hue bridge IP address and username (API key). If you don't have one, run the discovery script:

   ```bash
   node discover.js
   ```

   Follow the prompts to press the link button on your Hue bridge and get your API key.

2. Clone this project locally.

3. Run `npm install`, `npm run build` under the project dir. This will generate the MCP server script in the `/build` directory.

Then go to Cursor Settings -> MCP -> Add new MCP server

- Name = `control_lights` (or choose your own name)
- Type = command
- Command: `node ABSOLUTE_PATH_TO_MCP_SERVER/build/index.js --hue_username=YOUR_HUE_USERNAME --bridge_ip=YOUR_BRIDGE_IP`

You can also set these values as environment variables in the MCP configuration.

### Claude Desktop

Same setup as above, and then add the following MCP config:

```json
{
  "mcpServers": {
    "control_lights": {
      "command": "node",
      "args": ["ABSOLUTE_PATH_TO_MCP_SERVER/build/index.js"],
      "env": {
        "HUE_USERNAME": "YOUR_HUE_USERNAME",
        "BRIDGE_IP": "YOUR_BRIDGE_IP"
      }
    }
  }
}
```

## Available Tools

### `control_lights`

Turn all Philips Hue lights on or off.

Parameters:

- `state` (boolean): True to turn lights on, false to turn them off
- `specific_lights` (array of strings, optional): Optional list of light IDs to control

### `get_lights_info`

Get information about all available Philips Hue lights.

Parameters: None

### `send_morse_code_through_light`

Sends a message through Philips Hue lights using Morse code.

Parameters:

- `message` (string): The message to send through the lights
- `speed_multiplier` (number, optional): Speed multiplier for the Morse code (0.1 to 5, default 1)
- `restore_state` (boolean, optional): Whether to restore lights to their original state after sending

## Important Note

Since MCP tools run remotely, they cannot directly access your local network. To use this tool:

1. Make sure your Cursor or Claude Desktop is running on the same network as your Hue bridge (TODO - maybe add instructions for proxy?)
2. Ensure the bridge IP address is correct and accessible
3. If you're having connection issues, try using the included `control-lights.js` script directly:
   ```bash
   node control-lights.js
   # or to turn off
   node control-lights.js off
   ```

## Development

```bash
npm install
npm run build
```

For development mode:

```bash
npm run dev
```

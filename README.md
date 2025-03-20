# Morse Code Light MCP Server (Philips Hue) 💡

**This MCP server allows Cursor or Claude Desktop to control Philips Hue lights and send messages through them using Morse code.**

💡Example use case💡: tell Cursor agent to send a Morse code message to you when it's done with a task.

Built with:

- [Philips Hue API](https://developers.meethue.com/)
- [Anthropic MCP](https://docs.anthropic.com/en/docs/agents-and-tools/mcp)
- [Cursor](https://cursor.so/)

## Setup

### Prerequisites

- Philips Hue bridge and lights
- Hue bridge username (API key)
- Node.js (v14 or higher)
- Cursor or Claude Desktop

## Local API Setup

1. Clone this repository locally.
2. Obtain your Philips Hue bridge IP address and username. If you don't have one, run the discovery script:

   ```bash
   node build/discover-bridge.js
   ```

   Follow the prompts to press the link button on your Hue bridge and receive your API key.

3. Run `npm install` followed by `npm run build` in the project directory. This will generate the MCP server script in the `/build` directory.

4. Add the following MCP configuration. In Cursor it's under Settings -> MCP -> Add new MCP server. In Claude Desktop it's under Settings -> MCP -> Add new MCP server.

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

## Remote API Setup

This project supports controlling your Philips Hue lights remotely (from outside your local network) using the Hue Remote API. This enables you to control your lights from anywhere with an internet connection.

### Getting Remote API Credentials

1. **Create a Hue Developer Account**:

   - Register at https://developers.meethue.com/

2. **Create a Remote Hue API App**:

   - Go to https://developers.meethue.com/my-apps/
   - Create a new app with these details:
     - App name: Choose a name for your app
     - Callback URL: Use `http://localhost/` for simple testing
     - Application description: Brief description of your app
   - After creating the app, you'll receive:
     - Client ID
     - Client Secret

3. **Get Access and Refresh Tokens**:

   a. Construct an authorization URL and open it in your browser:

   ```
   https://api.meethue.com/oauth2/auth?clientid=YOUR_CLIENT_ID&response_type=code&state=anystring&appid=YOUR_APP_NAME&deviceid=test-device&devicename=TestDevice
   ```

   Replace `YOUR_CLIENT_ID` and `YOUR_APP_NAME` with your values.

   b. Log in with your Hue developer account and authorize the app.

   c. You'll be redirected to your callback URL with a code parameter.

   d. Extract the code from the URL (e.g., `?code=abcd1234&state=anystring`).

   e. Exchange the code for tokens using cURL or Postman:

   ```bash
   curl -X POST https://api.meethue.com/oauth2/token \
     -d "code=YOUR_AUTHORIZATION_CODE&grant_type=authorization_code" \
     -u "YOUR_CLIENT_ID:YOUR_CLIENT_SECRET"
   ```

   f. The response will contain:

   ```json
   {
     "access_token": "YOUR_ACCESS_TOKEN",
     "refresh_token": "YOUR_REFRESH_TOKEN",
     "token_type": "bearer",
     "expires_in": 604800
   }
   ```

   Store these tokens securely. The access token is valid for approximately 7 days, and the refresh token for approximately 100 days.

Add this to your MCP configuration:

```json
{
  "mcpServers": {
    "control_lights": {
      "command": "node",
      "args": ["ABSOLUTE_PATH_TO_MCP_SERVER/build/index.js"],
      "env": {
        "USE_REMOTE": "true",
        "REMOTE_CLIENT_ID": "YOUR_CLIENT_ID",
        "REMOTE_CLIENT_SECRET": "YOUR_CLIENT_SECRET",
        "REMOTE_ACCESS_TOKEN": "YOUR_ACCESS_TOKEN",
        "REMOTE_REFRESH_TOKEN": "YOUR_REFRESH_TOKEN"
      }
    }
  }
}
```

## Available Tools

### `control_lights`

Turn specific or all Philips Hue lights on or off.

Parameters:

- `state` (boolean): True to turn lights on, false to turn them off
- `specific_lights` (array of strings, optional): List of specific light IDs to control

### `get_lights_info`

Retrieve information about all available Philips Hue lights.

Parameters: None

### `send_morse_code_through_light`

Send a message through Philips Hue lights using Morse code.

Parameters:

- `message` (string): The message to send through the lights
- `speed_multiplier` (number, optional): Speed multiplier for the Morse code (0.1 to 5, default 1)
- `restore_state` (boolean, optional): Whether to restore lights to their original state after sending

## Development

```bash
npm install
npm run build
```

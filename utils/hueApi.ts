import axios from "axios";

// Define an interface for the bridge discovery response
interface HueBridge {
  id: string;
  internalipaddress: string;
  macaddress?: string;
  name?: string;
}

interface LightState {
  on: boolean;
  bri?: number;
  hue?: number;
  sat?: number;
  xy?: [number, number];
  ct?: number;
  effect?: string;
}

interface Light {
  state: LightState;
  [key: string]: any;
}

interface Lights {
  [key: string]: Light;
}

class HueApi {
  private baseUrl: string;
  private username: string;
  private debug: boolean;

  constructor(bridgeIp: string, username: string, debug: boolean = false) {
    this.baseUrl = `http://${bridgeIp}/api`;
    this.username = username;
    this.debug = debug;
  }

  // Add static method to discover Hue bridges
  static async discoverBridge(): Promise<HueBridge[]> {
    // Try different discovery methods
    try {
      // Method 1: Try the official Philips discovery endpoint
      const response = await axios.get("https://discovery.meethue.com/");
      if (
        response.data &&
        Array.isArray(response.data) &&
        response.data.length > 0
      ) {
        return response.data;
      }
    } catch (error) {
      console.log("Official discovery method failed, trying N-UPnP...");
    }

    try {
      // Method 2: Try N-UPnP discovery
      const response = await axios.get("https://discovery.meethue.com/");
      if (
        response.data &&
        Array.isArray(response.data) &&
        response.data.length > 0
      ) {
        return response.data;
      }
    } catch (error) {
      console.log("N-UPnP discovery failed");
    }

    // Return empty array if no bridges found
    return [];
  }

  async createUser(deviceType: string): Promise<string> {
    const url = `${this.baseUrl}/`;
    this.log("Creating user with device type:", deviceType);

    try {
      const response = await axios.post(url, { devicetype: deviceType });
      this.log("User creation response:", response.data);

      if (
        response.data &&
        Array.isArray(response.data) &&
        response.data.length > 0
      ) {
        if (response.data[0].success) {
          return response.data[0].success.username;
        } else if (response.data[0].error) {
          throw new Error(response.data[0].error.description);
        }
      }

      throw new Error("Unexpected response format");
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `User creation failed: ${error.response?.data || error.message}`
        );
      }
      throw error;
    }
  }

  private log(...args: any[]): void {
    if (this.debug) {
      console.log(...args);
    }
  }

  private async makeRequest<T>(
    method: string,
    endpoint: string,
    data?: any
  ): Promise<T> {
    const url = `${this.baseUrl}/${this.username}${endpoint}`;
    this.log(`${method} ${url}`, data || "");

    try {
      const response = await axios({
        method,
        url,
        data,
      });
      this.log("Response:", response.data);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `Hue API request failed: ${error.response?.data || error.message}`
        );
      }
      throw error;
    }
  }

  async getLights(): Promise<Lights> {
    return this.makeRequest<Lights>("GET", "/lights");
  }

  async getLight(id: string): Promise<Light> {
    return this.makeRequest<Light>("GET", `/lights/${id}`);
  }

  async setLightState(id: string, state: Partial<LightState>): Promise<any> {
    return this.makeRequest("PUT", `/lights/${id}/state`, state);
  }
}

export default HueApi;
export type { LightState, Light, Lights, HueBridge };

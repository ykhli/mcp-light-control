import axios from "axios";

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
export type { LightState, Light, Lights };

const AGENT_API = "http://localhost:8080"; // Web agent local API

export const agentService = {
  async getStatus() {
    const res = await fetch(`${AGENT_API}/status`);
    return res.json();
  },

  async updateConfig(config: any) {
    await fetch(`${AGENT_API}/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config)
    });
  },

  async selfUpdate() {
    await fetch(`${AGENT_API}/update`, { method: "POST" });
  }
};

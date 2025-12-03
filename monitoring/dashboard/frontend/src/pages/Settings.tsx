import { useState } from "react";

export default function Settings() {
  const [threshold, setThreshold] = useState(200);

  const save = async () => {
    await fetch("/api/agent/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestThreshold: threshold })
    });
    alert("Config updated");
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Agent Settings</h1>
      <label className="block mb-2">Request Threshold:</label>
      <input
        type="number"
        value={threshold}
        onChange={(e) => setThreshold(parseInt(e.target.value))}
        className="border p-2 rounded mb-4"
      />
      <button
        onClick={save}
        className="bg-blue-600 text-white px-4 py-2 rounded"
      >
        Save
      </button>
    </div>
  );
}

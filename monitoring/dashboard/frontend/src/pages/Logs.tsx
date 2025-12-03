import { useEffect, useState } from "react";

export default function Logs() {
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/logs")
      .then(res => res.json())
      .then(setLogs);
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Recent Logs</h1>
      <pre className="bg-gray-100 p-4 rounded h-96 overflow-y-scroll">
        {logs.join("\n")}
      </pre>
    </div>
  );
}

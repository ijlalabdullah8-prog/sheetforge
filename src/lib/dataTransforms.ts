export async function runAI(prompt: string) {
  const res = await fetch("http://localhost:3001/ai", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ prompt })
  });

  if (!res.ok) {
    throw new Error("AI request failed");
  }

  return await res.json();
}
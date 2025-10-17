export type Level =
  | "Elementary School Level" | "Middle School Level" | "High School Level"
  | "Undergraduate Level" | "Advanced Undergraduate Level"
  | "Graduate Level" | "Advanced Graduate Level";

export type QuestionPayload = {
  index: number;
  total: number;
  q_id: string;
  question: string;
  answer_type: "text" | "numeric";
};

const BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

export async function start(subject: string, level: Level) {
  const r = await fetch(`${BASE}/api/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subject, level }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{ session_id: string; level: Level; question: QuestionPayload | null }>;
}

export async function submitAnswer(session_id: string, q_id: string, answer: string) {
  const r = await fetch(`${BASE}/api/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id, q_id, answer }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{
    score: number;
    reason: string;
    correct_answer: string;
    explanation: string;
    next_question: QuestionPayload | null;
    batch_complete: boolean;
  }>;
}

export async function continueNext(session_id: string, cont: boolean) {
  const r = await fetch(`${BASE}/api/continue`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id, continue: cont }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{
    level: Level;
    question: QuestionPayload | null;
    batch_summary?: { count: number; total: number; avg: number };
  }>;
}

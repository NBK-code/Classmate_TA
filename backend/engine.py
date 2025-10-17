from typing import Annotated, Sequence, TypedDict, Literal, NotRequired
import json, re, uuid
from dotenv import load_dotenv
from langchain_core.messages import BaseMessage, SystemMessage, HumanMessage
from langchain_openai import ChatOpenAI
from langgraph.graph.message import add_messages

load_dotenv()

def sum_counts(existing: int | None, new: int | None) -> int:
    return (existing or 0) + (new or 0)
def extend_dict_list(existing: list[dict] | None, new: list[dict] | None) -> list[dict]:
    return (existing or []) + (new or [])
def extend_int_list(existing: list[int] | None, new: list[int] | None) -> list[int]:
    return (existing or []) + (new or [])
def extend_str_list(existing: list[str] | None, new: list[str] | None) -> list[str]:
    return (existing or []) + (new or [])

Level = Literal[
    "Elementary School Level","Middle School Level","High School Level",
    "Undergraduate Level","Advanced Undergraduate Level","Graduate Level","Advanced Graduate Level",
]
LEVELS: list[Level] = [
    "Elementary School Level","Middle School Level","High School Level",
    "Undergraduate Level","Advanced Undergraduate Level","Graduate Level","Advanced Graduate Level",
]
LEVEL_DESC: dict[Level, str] = {
    "Elementary School Level": "Single-fact recall; everyday language; no calculations.",
    "Middle School Level": "1–2 step reasoning; simple numerics; basic units/sign awareness.",
    "High School Level": "Multi-step reasoning; algebraic manipulation; standard science vocabulary.",
    "Undergraduate Level": "Conceptual + quantitative; occasional calculus; brief justification.",
    "Advanced Undergraduate Level": "Multi-concept synthesis; approximations; careful units & error.",
    "Graduate Level": "Rigorous definitions; nontrivial derivations; edge cases & assumptions.",
    "Advanced Graduate Level": "Research-style twists; novel combinations; concise formal arguments.",
}
PROMOTE_THRESHOLD = 8.5
DEMOTE_THRESHOLD  = 6.5

class QAItem(TypedDict):
    q_id: str
    question: str
    explanation: NotRequired[str]
    answer: str
    answer_type: Literal["text", "numeric"]

class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], add_messages]
    question_count: Annotated[int, sum_counts]
    score: Annotated[int, sum_counts]
    subject: NotRequired[str]
    batch: NotRequired[list[QAItem]]
    cursor: NotRequired[int]
    responses: Annotated[list[dict], extend_dict_list]   # {"q_id","answer"}
    batch_avg: NotRequired[float]
    level: NotRequired[Level]
    seen_questions: Annotated[list[str], extend_str_list]
    batch_scores: Annotated[list[int], extend_int_list]

generator_llm = ChatOpenAI(
    model="gpt-4o-mini", temperature=0.9,
    model_kwargs={"response_format": {"type": "json_object"}}
)
judge_llm = ChatOpenAI(
    model="gpt-4o-mini", temperature=0.0,
    model_kwargs={"response_format": {"type": "json_object"}}
)

def new_session(subject: str, level: Level | None = None) -> AgentState:
    level = level or "High School Level"
    return {
        "messages": [], "question_count": 0, "score": 0,
        "subject": subject, "batch": [], "cursor": 0,
        "responses": [], "seen_questions": [], "batch_scores": [], "level": level,
    }

def generate_batch(state: AgentState) -> AgentState:
    subject = state.get("subject") or "general science"
    level: Level = state.get("level", "High School Level")
    avoid_list = state.get("seen_questions", [])[-12:]
    avoid_text = "\n- " + "\n- ".join(avoid_list) if avoid_list else " (none)"

    sys = SystemMessage(content=(
        f"You are a teaching assistant for {subject}.\n"
        f"Target **{level}**.\n"
        f"Level profile: {LEVEL_DESC[level]}\n\n"
        "Generate 5 distinct short subject-matter questions AND their correct final answers.\n"
        "Provide a brief explanation (1–3 sentences) that supports the final answer.\n"
        "No meta-questions or follow-ups. Do NOT include the solution value inside `question`.\n"
        "Avoid repeating or paraphrasing ANY of these recent questions:\n"
        f"{avoid_text}\n\n"
        "For numeric answers, `answer` must be a bare number string (no units/words).\n"
        'Return ONLY JSON: {"items":[{"question","explanation","answer","answer_type"}]} (5 items).'
    ))
    ai = generator_llm.invoke([sys])
    try:
        items = json.loads(ai.content).get("items", [])
    except Exception:
        items = []

    batch: list[QAItem] = []
    seen = set(state.get("seen_questions", []))
    for it in items:
        q = str(it.get("question","")).strip()
        exp = str(it.get("explanation","")).strip()
        ans = str(it.get("answer","")).strip()
        at  = (it.get("answer_type") or "text").strip().lower()
        if not q or not ans: continue
        if at not in ("text","numeric"):
            try: float(ans); at="numeric"
            except Exception: at="text"
        if q in seen: continue
        batch.append({"q_id": str(uuid.uuid4()), "question": q, "explanation": exp, "answer": ans, "answer_type": at})
        seen.add(q)
        if len(batch)==5: break

    if not batch:
        q = f"Name one key concept in {subject}."
        batch = [{"q_id": str(uuid.uuid4()), "question": q, "explanation": "", "answer": "Answers vary", "answer_type": "text"}]
        seen.add(q)

    return {**state, "batch": batch, "cursor": 0, "responses": [], "batch_scores": [], "seen_questions": list(seen)}

def get_current_question(state: AgentState) -> dict:
    batch = state.get("batch") or []; cursor = state.get("cursor", 0)
    if cursor >= len(batch): return {}
    it = batch[cursor]
    return {"index": cursor, "total": len(batch), "q_id": it["q_id"], "question": it["question"], "answer_type": it["answer_type"]}

def submit_answer(state: AgentState, q_id: str, answer: str) -> AgentState:
    return {
        **state,
        "responses": [*state.get("responses", []), {"q_id": q_id, "answer": answer}],
        "cursor": state.get("cursor", 0) + 1,
        "question_count": 1,
        "messages": [*state.get("messages", []), HumanMessage(content=answer)],
    }

def grade_last(state: AgentState) -> tuple[AgentState, dict]:
    batch = state.get("batch") or []; cursor = state.get("cursor", 0)
    idx = cursor - 1
    if idx < 0 or idx >= len(batch): return state, {"score": 0, "reason": ""}

    item = batch[idx]; qid = item["q_id"]
    user_answer = ""
    for rec in reversed(state.get("responses", [])):
        if rec.get("q_id") == qid:
            user_answer = str(rec.get("answer","")).strip(); break

    sys = SystemMessage(content=(
        "You are a fair grader focused on conceptual correctness.\n"
        "Judge the student's answer against the ground truth answer.\n"
        "Consider synonyms, paraphrases, and numeric/text equivalence (e.g., '+1' vs 'positive').\n"
        "Score from 0 to 10 (0=blank/off-topic, 10=perfect). Include a brief rationale.\n"
        'Return ONLY JSON: {"score": <int 0..10>, "explanation": "<short rationale>"}'
    ))
    payload = {
        "question": item["question"], "ground_truth_answer": item["answer"],
        "answer_type": item["answer_type"], "model_explanation": item.get("explanation",""),
        "student_answer": user_answer
    }
    judge_raw = judge_llm.invoke([sys, HumanMessage(content=json.dumps(payload, ensure_ascii=False))]).content
    try:
        obj = json.loads(judge_raw); s = int(obj.get("score", 0)); reason = str(obj.get("explanation","")).strip()
    except Exception:
        m = re.search(r"\b(\d{1,2})\b", judge_raw); s = int(m.group(1)) if m else 0; reason = judge_raw.strip()
    s = max(0, min(10, s))
    new_state = {**state, "score": s, "batch_scores": [*state.get("batch_scores", []), s]}
    feedback = {"score": s, "reason": reason, "correct_answer": item["answer"], "explanation": item.get("explanation","")}
    return new_state, feedback

def batch_done(state: AgentState) -> bool:
    batch = state.get("batch") or []
    return state.get("cursor", 0) >= len(batch)

def summarize_batch(state: AgentState) -> tuple[AgentState, dict]:
    batch = state.get("batch") or []; n = len(batch)
    scores = state.get("batch_scores", [])
    total = sum(scores); denom = (n if len(scores)==n else max(1,len(scores)))
    avg = total / denom
    return {**state, "batch_avg": avg}, {"count": n, "total": total, "avg": round(avg, 2)}

def decide_next_level(state: AgentState) -> AgentState:
    level: Level = state.get("level", "High School Level")
    idx = LEVELS.index(level); avg = float(state.get("batch_avg", 0.0))
    if avg >= PROMOTE_THRESHOLD and idx < len(LEVELS)-1: level = LEVELS[idx+1]
    elif avg < DEMOTE_THRESHOLD and idx > 0: level = LEVELS[idx-1]
    return {**state, "level": level}
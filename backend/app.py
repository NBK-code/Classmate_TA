from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, Dict
import uuid

from engine import (
    AgentState, Level,
    new_session, generate_batch, get_current_question,
    submit_answer, grade_last, batch_done, summarize_batch, decide_next_level,
)

app = FastAPI(title="TA Backend")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

SESSIONS: Dict[str, AgentState] = {}

class StartRequest(BaseModel):
    subject: str
    level: Optional[Level] = Field(default="High School Level")
class StartResponse(BaseModel):
    session_id: str
    level: Level
    question: Optional[dict] = None

class AnswerRequest(BaseModel):
    session_id: str
    q_id: str
    answer: str
class AnswerResponse(BaseModel):
    score: int
    reason: str
    correct_answer: str
    explanation: str
    next_question: Optional[dict] = None
    batch_complete: bool

class ContinueRequest(BaseModel):
    session_id: str
    continue_: bool = Field(alias="continue")
class ContinueResponse(BaseModel):
    level: Level
    question: Optional[dict] = None
    batch_summary: Optional[dict] = None

@app.post("/api/start", response_model=StartResponse)
def start(req: StartRequest):
    sid = str(uuid.uuid4())
    state = new_session(req.subject, req.level)
    state = generate_batch(state)
    SESSIONS[sid] = state
    q = get_current_question(state)
    return StartResponse(session_id=sid, level=state["level"], question=(q or None))

@app.post("/api/answer", response_model=AnswerResponse)
def answer(req: AnswerRequest):
    state = SESSIONS.get(req.session_id)
    if not state: raise HTTPException(404, "session not found")

    state = submit_answer(state, req.q_id, req.answer)
    state, feedback = grade_last(state)
    SESSIONS[req.session_id] = state

    if batch_done(state):
        return AnswerResponse(score=feedback["score"], reason=feedback["reason"],
                              correct_answer=feedback["correct_answer"], explanation=feedback["explanation"],
                              next_question=None, batch_complete=True)
    else:
        next_q = get_current_question(state)
        return AnswerResponse(score=feedback["score"], reason=feedback["reason"],
                              correct_answer=feedback["correct_answer"], explanation=feedback["explanation"],
                              next_question=next_q, batch_complete=False)

@app.post("/api/continue", response_model=ContinueResponse)
def continue_or_next(req: ContinueRequest):
    state = SESSIONS.get(req.session_id)
    if not state: raise HTTPException(404, "session not found")

    if req.continue_:
        state, batch_summary = summarize_batch(state)
        state = decide_next_level(state)
        state = generate_batch(state)
        SESSIONS[req.session_id] = state
        q = get_current_question(state)
        return ContinueResponse(level=state["level"], question=q, batch_summary=batch_summary)
    else:
        state, batch_summary = summarize_batch(state)
        SESSIONS[req.session_id] = state
        return ContinueResponse(level=state["level"], question=None, batch_summary=batch_summary)

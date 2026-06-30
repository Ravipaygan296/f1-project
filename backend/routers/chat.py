"""
F1 Analytics — Chat Router
Exposes the AI Analyst as a POST endpoint.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from backend.ai_analyst import ask_analyst
import os
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["AI Analyst"])


class Question(BaseModel):
    question: str


class ChatResponse(BaseModel):
    answer: str | None = None
    sql: str | None = None
    data: list = []
    row_count: int = 0
    error: str | None = None


@router.post("/ask", response_model=ChatResponse)
def ask(q: Question):
    """
    Ask the AI analyst a question about F1 data.
    The LLM generates SQL, runs it on real data, and narrates the result.
    Every answer shows the underlying SQL for full transparency.
    """
    if not q.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    if len(q.question) > 500:
        raise HTTPException(status_code=400, detail="Question too long (max 500 characters)")

    # Check if Groq API key is configured
    api_key = os.environ.get("GROQ_API_KEY", "")
    if not api_key or api_key == "your_groq_api_key_here":
        return ChatResponse(
            error="AI Analyst is not configured. Please get a free API key from console.groq.com and set GROQ_API_KEY in your .env file.",
            answer=None,
            sql=None,
            data=[],
        )

    logger.info(f"AI Analyst question: {q.question[:100]}")
    result = ask_analyst(q.question)

    return ChatResponse(
        answer=result.get("answer"),
        sql=result.get("sql"),
        data=result.get("data", []),
        row_count=result.get("row_count", 0),
        error=result.get("error"),
    )


@router.get("/examples")
def get_example_questions():
    """Return example questions to help users get started."""
    return {
        "examples": [
            "Who has the most wins in 2024?",
            "Compare Verstappen vs Norris average lap time at Monza 2024",
            "Which team has the fastest average pit stop in 2024?",
            "Show me tyre degradation rates for SOFT compound at Silverstone",
            "How many DNFs has each driver had in 2025?",
            "Compare Ferrari and McLaren total points in 2024",
            "What is the typical pit window at Monaco?",
            "Who are the most consistent drivers by finishing position this season?",
            "Which tracks does Red Bull dominate historically?",
            "Compare Hamilton and Russell qualifying head-to-head in 2024",
        ]
    }

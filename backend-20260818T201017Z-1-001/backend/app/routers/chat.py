from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.services import rag, safety

router = APIRouter(prefix="/api/chat", tags=["chat"])

CRISIS_RESOURCES_NOTE = (
    "It sounds like you might be going through something really painful right now. "
    "You deserve support — please consider reaching out to a crisis line or emergency "
    "services in your area right now, or contacting someone you trust so you're not alone with this."
)


def _compute_confidence(evidence: list[dict], crisis_flag: bool) -> tuple[str, str]:
    """بيحسب مستوى الثقة الفعلي بناءً على أعلى score في الـ evidence."""
    if crisis_flag:
        return "Low", "red"
    if not evidence:
        return "Low", "red"

    top_score = max(e["score"] for e in evidence)
    if top_score >= 0.75:
        return "High", "green"
    if top_score >= 0.5:
        return "Medium", "orange"
    return "Low", "red"


@router.post("", response_model=schemas.ChatResponse)
def chat(payload: schemas.ChatRequest, db: Session = Depends(get_db)):
    # 1. Resolve or create the conversation
    if payload.conversation_id:
        convo = db.get(models.Conversation, payload.conversation_id)
        if not convo:
            raise HTTPException(status_code=404, detail="Conversation not found")
        convo.role = payload.role
    else:
        title = payload.message.strip()[:60] or "New chat"
        convo = models.Conversation(title=title, role=payload.role)
        db.add(convo)
        db.flush()

    # 2. Persist the user's message
    user_msg = models.Message(conversation_id=convo.id, role="user", content=payload.message)
    db.add(user_msg)
    db.flush()

    # 3. Build short conversational history for the LLM (last 10 turns)
    prior = db.query(models.Message).filter(
        models.Message.conversation_id == convo.id
    ).order_by(models.Message.created_at.asc()).all()
    history = [{"role": m.role, "content": m.content} for m in prior[-10:] if m.id != user_msg.id]

    crisis_flag = safety.is_potential_crisis(payload.message)

    # 4. RAG: retrieve evidence + generate a grounded answer
    answer_text, evidence = rag.answer_question(role=payload.role, question=payload.message, history=history)
    if crisis_flag:
        answer_text = f"{CRISIS_RESOURCES_NOTE}\n\n{answer_text}"

    # 5. Persist the assistant's message + evidence
    assistant_msg = models.Message(conversation_id=convo.id, role="assistant", content=answer_text)
    db.add(assistant_msg)
    db.flush()

    # نضيف الـ evidence كلها الأول من غير ما نبني الـ output، عشان الـ id يتحدد
    ev_pairs = []
    for e in evidence:
        ev_model = models.Evidence(
            message_id=assistant_msg.id,
            source_title=e["source_title"],
            source_meta=e["source_meta"],
            snippet=e["snippet"],
            full_text=e["full_text"],
            score=e["score"],
            used=1 if e["used"] else 0,
            rank=e["rank"],
        )
        db.add(ev_model)
        ev_pairs.append((ev_model, e))

    db.flush()  # دلوقتي كل ev_model.id بقى موجود فعلاً

    evidence_out_list = [
        {
            "id": str(ev_model.id),
            "source_title": e["source_title"],
            "source_meta": e["source_meta"],
            "snippet": e["snippet"],
            "full_text": e["full_text"],
            "score": e["score"],
            "used": bool(e["used"]),
            "rank": e["rank"],
        }
        for ev_model, e in ev_pairs
    ]

    confidence, confidence_color = _compute_confidence(evidence, crisis_flag)

    db.commit()
    db.refresh(assistant_msg)

    return schemas.ChatResponse(
        conversation_id=str(convo.id),
        message={
            "id": str(assistant_msg.id),
            "role": assistant_msg.role,
            "content": assistant_msg.content,
            "created_at": str(assistant_msg.created_at),
            "evidence": evidence_out_list,
        },
        crisis_flag=crisis_flag,
        confidence=confidence,
        confidence_color=confidence_color,
    )
from app.config import settings
from app.services import vector_store, llm


def retrieve_evidence(question: str) -> list[dict]:
    """Retrieve candidate chunks and mark which ones clear the relevance threshold."""
    raw = vector_store.query(question, top_k=settings.retrieval_top_k)

    shaped = []
    for rank, c in enumerate(raw, start=1):
        shaped.append({
            "source_title": c["title"],
            "source_meta": f"{c['category']} • p. {c['page']}" if c["category"] else f"p. {c['page']}",
            "snippet": _summarize(c["text"]),
            "full_text": c["text"],
            "score": c["score"],
            "used": c["score"] >= settings.retrieval_min_score,
            "rank": rank,
        })
    return shaped


def _summarize(text: str, max_chars: int = 160) -> str:
    text = " ".join(text.split())
    return text if len(text) <= max_chars else text[:max_chars].rsplit(" ", 1)[0] + "…"


def answer_question(role: str, question: str, history: list[dict]) -> tuple[str, list[dict]]:
    """
    Full RAG turn: retrieve relevant approved chunks, generate a grounded answer,
    return (answer_text, evidence_list). `history` is prior turns as
    [{"role": "user"|"assistant", "content": "..."}], used for conversational context.
    """
    evidence = retrieve_evidence(question)
    used_chunks = [e for e in evidence if e["used"]] or evidence[:1]

    context_chunks = [
        {
            "title": e["source_title"],
            "category": e["source_meta"].split("•")[0].strip(),
            "page": e["source_meta"].split("p.")[-1].strip(),
            "text": e["full_text"],
        }
        for e in used_chunks
    ]

    answer = llm.generate_answer(role=role, question=question, context_chunks=context_chunks, history=history)
    return answer, evidence

"""
repo_qa/service.py
Core orchestration service for Ask Repo question answering.
Coordinates intent classification, evidence ranking, source extraction,
OpenAI chat completions, streaming generation, and deterministic fallbacks.
"""

import os
import re
import json
import logging
from typing import Dict, Any, List, Optional, Generator
from openai import OpenAI

from repo_qa.intents import classify_query_intent, QueryIntent, QueryIntentInfo
from repo_qa.retrieval import rank_relevant_files, RankedCandidate
from repo_qa.source_retriever import get_source_excerpts_for_files
from repo_qa.evidence import build_evidence_pack, EvidencePack
from repo_qa.fallback import generate_deterministic_qa_response
from repo_qa.prompts import build_qa_messages

logger = logging.getLogger(__name__)


def extract_citations_from_text(
    text: str,
    known_files: List[str]
) -> List[Dict[str, Any]]:
    """
    Extract file citations and line references from generated markdown text.
    Matches markdown file links [label](file://path#L10) and known file paths.
    """
    citations = []
    seen = set()

    # 1. Match [label](file://path) or [label](file:///path)
    file_link_pattern = re.compile(r"\[([^\]]+)\]\(file:///?([^)#\s]+)(?:#L(\d+))?\)")
    for match in file_link_pattern.finditer(text):
        label, path, line = match.groups()
        norm_path = path.replace("\\", "/").strip("/")
        if norm_path not in seen:
            seen.add(norm_path)
            citations.append({
                "file": norm_path,
                "line": int(line) if line else None,
                "label": label
            })

    # 2. Check for known files mentioned in backticks `path/to/file`
    backtick_pattern = re.compile(r"`([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)`")
    known_set = set(known_files)
    for match in backtick_pattern.finditer(text):
        cand = match.group(1).replace("\\", "/")
        if cand in known_set and cand not in seen:
            seen.add(cand)
            citations.append({
                "file": cand,
                "line": None,
                "label": cand.split("/")[-1]
            })

    return citations


class AskService:
    def __init__(self, openai_client: Optional[OpenAI] = None):
        self._client = openai_client

    def _get_client(self) -> Optional[OpenAI]:
        """Lazy initialization of OpenAI client if API key exists."""
        if self._client:
            return self._client
        api_key = os.getenv("OPENAI_API_KEY")
        if api_key and not api_key.startswith("your_openai_api_key"):
            try:
                self._client = OpenAI(api_key=api_key)
                return self._client
            except Exception as e:
                logger.warning("Failed to initialize OpenAI client: %s", e)
                return None
        return None

    def ask(
        self,
        query: str,
        repo_model: Dict[str, Any],
        conversation_history: Optional[List[Dict[str, str]]] = None,
        scoped_file: Optional[str] = None,
        scoped_edge: Optional[Dict[str, str]] = None,
        available_contents: Optional[Dict[str, str]] = None,
        owner: str = "",
        repo: str = "",
        branch: str = "main"
    ) -> Dict[str, Any]:
        """
        Answer a developer question about the repository using grounded evidence.
        Falls back seamlessly to deterministic engine if OpenAI is not available.
        """
        # 1. Classify intent
        intent = classify_query_intent(query, repo_model, scoped_file)

        # 2. Rank candidate files & expand along dependency graph
        ranked = rank_relevant_files(
            query=query,
            repo_model=repo_model,
            intent=intent,
            scoped_file=scoped_file,
            scoped_edge=scoped_edge,
            limit=6
        )

        ranked_paths = [r.path for r in ranked]

        # 3. Retrieve safe, budget-capped source code excerpts
        source_excerpts = get_source_excerpts_for_files(
            file_paths=ranked_paths,
            available_contents=available_contents,
            owner=owner,
            repo=repo,
            branch=branch,
            max_files=4
        )

        # 4. Assemble Evidence Pack
        evidence = build_evidence_pack(
            repo_model=repo_model,
            ranked_candidates=ranked,
            source_excerpts=source_excerpts,
            intent=intent,
            scoped_file=scoped_file,
            scoped_edge=scoped_edge
        )

        # 5. Deterministic fast-path for purely structural questions
        if intent.is_structural_only:
            return generate_deterministic_qa_response(query, repo_model, intent, evidence)

        # 6. Check LLM availability
        client = self._get_client()
        if not client:
            logger.info("OpenAI client not configured or key absent; using deterministic QA.")
            return generate_deterministic_qa_response(query, repo_model, intent, evidence)

        # 7. LLM Chat Completion
        messages = build_qa_messages(query, evidence, conversation_history)
        model = os.getenv("OPENAI_QA_MODEL") or os.getenv("OPENAI_MODEL") or "gpt-4o-mini"
        fallback_model = os.getenv("OPENAI_CHAT_MODEL") or "gpt-4o"

        answer_text = ""
        try:
            response = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=0.2,
                timeout=40
            )
            answer_text = response.choices[0].message.content or ""
        except Exception as e:
            logger.warning("Primary QA model (%s) failed: %s. Trying fallback model...", model, e)
            try:
                response = client.chat.completions.create(
                    model=fallback_model,
                    messages=messages,
                    temperature=0.2,
                    timeout=40
                )
                answer_text = response.choices[0].message.content or ""
            except Exception as e2:
                logger.warning("OpenAI QA request failed completely: %s. Returning deterministic fallback.", e2)
                return generate_deterministic_qa_response(query, repo_model, intent, evidence)

        # 8. Extract citations and related files
        all_file_paths = list(repo_model.get("files", {}).keys())
        extracted_citations = extract_citations_from_text(answer_text, all_file_paths)

        # Combine with candidate files
        for r in ranked[:3]:
            if not any(c["file"] == r.path for c in extracted_citations):
                extracted_citations.append({"file": r.path, "line": None})

        related_files = list(dict.fromkeys([c["file"] for c in extracted_citations] + ranked_paths[:4]))

        evidence_summary = [
            f"Analyzed {len(ranked)} relevant file(s) across repository.",
            f"Classified query intent as `{intent.intent}`."
        ]
        if source_excerpts:
            evidence_summary.append(f"Inspected source code from {len(source_excerpts)} file(s).")

        return {
            "answer": answer_text,
            "citations": extracted_citations,
            "related_files": related_files,
            "confidence": "high",
            "evidence_summary": evidence_summary,
            "intent": intent.intent,
            "insufficient_evidence": "insufficient evidence" in answer_text.lower(),
        }

    def ask_stream(
        self,
        query: str,
        repo_model: Dict[str, Any],
        conversation_history: Optional[List[Dict[str, str]]] = None,
        scoped_file: Optional[str] = None,
        scoped_edge: Optional[Dict[str, str]] = None,
        available_contents: Optional[Dict[str, str]] = None,
        owner: str = "",
        repo: str = "",
        branch: str = "main"
    ) -> Generator[str, None, None]:
        """
        Stream the answer token by token using Server-Sent Events (SSE).
        Emits SSE events: 'start', 'chunk', and 'done'.
        """
        intent = classify_query_intent(query, repo_model, scoped_file)
        ranked = rank_relevant_files(query, repo_model, intent, scoped_file, scoped_edge, limit=6)
        ranked_paths = [r.path for r in ranked]

        source_excerpts = get_source_excerpts_for_files(
            file_paths=ranked_paths,
            available_contents=available_contents,
            owner=owner,
            repo=repo,
            branch=branch,
            max_files=4
        )

        evidence = build_evidence_pack(repo_model, ranked, source_excerpts, intent, scoped_file, scoped_edge)

        # Emit start event
        start_payload = {
            "event": "start",
            "intent": intent.intent,
            "candidate_files": ranked_paths[:4],
        }
        yield f"data: {json.dumps(start_payload)}\n\n"

        # Deterministic path if structural or no client
        client = self._get_client()
        if intent.is_structural_only or not client:
            resp = generate_deterministic_qa_response(query, repo_model, intent, evidence)
            chunk_payload = {"event": "chunk", "text": resp["answer"]}
            yield f"data: {json.dumps(chunk_payload)}\n\n"

            done_payload = {
                "event": "done",
                "citations": resp["citations"],
                "related_files": resp["related_files"],
                "confidence": resp["confidence"],
                "evidence_summary": resp["evidence_summary"],
                "intent": resp["intent"],
                "insufficient_evidence": resp["insufficient_evidence"]
            }
            yield f"data: {json.dumps(done_payload)}\n\n"
            return

        # Stream from OpenAI
        messages = build_qa_messages(query, evidence, conversation_history)
        model = os.getenv("OPENAI_QA_MODEL") or os.getenv("OPENAI_MODEL") or "gpt-4o-mini"

        accumulated_text = []
        try:
            stream = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=0.2,
                stream=True,
                timeout=40
            )

            for chunk in stream:
                delta = chunk.choices[0].delta.content if chunk.choices else None
                if delta:
                    accumulated_text.append(delta)
                    yield f"data: {json.dumps({'event': 'chunk', 'text': delta})}\n\n"

        except Exception as e:
            logger.warning("Streaming failed: %s. Emitting fallback answer.", e)
            resp = generate_deterministic_qa_response(query, repo_model, intent, evidence)
            yield f"data: {json.dumps({'event': 'chunk', 'text': resp['answer']})}\n\n"
            yield f"data: {json.dumps({'event': 'done', **resp})}\n\n"
            return

        full_answer = "".join(accumulated_text)
        all_file_paths = list(repo_model.get("files", {}).keys())
        extracted_citations = extract_citations_from_text(full_answer, all_file_paths)

        for r in ranked[:3]:
            if not any(c["file"] == r.path for c in extracted_citations):
                extracted_citations.append({"file": r.path, "line": None})

        related_files = list(dict.fromkeys([c["file"] for c in extracted_citations] + ranked_paths[:4]))

        done_payload = {
            "event": "done",
            "citations": extracted_citations,
            "related_files": related_files,
            "confidence": "high",
            "evidence_summary": [
                f"Analyzed {len(ranked)} relevant file(s).",
                f"Classified query intent as `{intent.intent}`."
            ],
            "intent": intent.intent,
            "insufficient_evidence": "insufficient evidence" in full_answer.lower()
        }
        yield f"data: {json.dumps(done_payload)}\n\n"


# Global singleton instance
default_ask_service = AskService()

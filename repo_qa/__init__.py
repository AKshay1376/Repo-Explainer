"""
repo_qa package
Context-Aware Ask Repo Code Intelligence Q&A System.
"""

from repo_qa.intents import classify_query_intent, QueryIntent, QueryIntentInfo
from repo_qa.retrieval import rank_relevant_files, RankedCandidate
from repo_qa.evidence import build_evidence_pack, EvidencePack
from repo_qa.fallback import generate_deterministic_qa_response
from repo_qa.service import AskService, default_ask_service

__all__ = [
    "classify_query_intent",
    "QueryIntent",
    "QueryIntentInfo",
    "rank_relevant_files",
    "RankedCandidate",
    "build_evidence_pack",
    "EvidencePack",
    "generate_deterministic_qa_response",
    "AskService",
    "default_ask_service",
]

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from shopping_copilot.catalog.store import CatalogStore
from shopping_copilot.core.config import AppConfig
from shopping_copilot.core.interfaces import (
    Policy,
    QueryPlanner,
    Ranker,
    ResponseBuilder,
    Retriever,
    StateTracker,
    TraceSink,
)
from shopping_copilot.observability.decision_view import ConsoleDecisionTraceSink
from shopping_copilot.observability.trace import (
    CompositeTraceSink,
    JsonlTraceSink,
    NullTraceSink,
)
from shopping_copilot.planning.query_planner import RuleQueryPlanner
from shopping_copilot.policy.coverage import CandidateCoverageManager
from shopping_copilot.policy.heuristic import HeuristicPolicy
from shopping_copilot.ranking.heuristic import HeuristicRanker
from shopping_copilot.ranking.evidence import EvidenceRanker
from shopping_copilot.response.builder import OfficialResponseBuilder
from shopping_copilot.retrieval.bm25 import BM25Retriever
from shopping_copilot.retrieval.category_anchor import (
    CategoryAnchorRetriever,
    DisabledCategoryAnchorRetriever,
)
from shopping_copilot.retrieval.dense import DisabledDenseRetriever
from shopping_copilot.retrieval.hybrid import HybridRetriever
from shopping_copilot.retrieval.structured import StructuredRetriever
from shopping_copilot.state.rule_state import RuleStateTracker


@dataclass(frozen=True)
class Components:
    state_tracker: StateTracker
    planner: QueryPlanner
    retriever: Retriever
    ranker: Ranker
    policy: Policy
    coverage_manager: CandidateCoverageManager
    response_builder: ResponseBuilder
    trace_sink: TraceSink


def build_components(
    catalog_path: str | Path,
    config: AppConfig,
    *,
    console_trace: bool = False,
) -> Components:
    """Build the fixed pipeline and optionally attach the console trace sink."""

    store = CatalogStore(catalog_path)
    lexical = BM25Retriever(store, config.search)
    dense = DisabledDenseRetriever()
    structured: Retriever = (
        StructuredRetriever(store)
        if config.search.structured_enabled
        else DisabledDenseRetriever()
    )
    category_anchor: Retriever = (
        CategoryAnchorRetriever(store, full_pool=config.search.category_anchor_full_pool)
        if config.search.category_anchor_enabled
        else DisabledCategoryAnchorRetriever()
    )
    retriever = HybridRetriever(
        lexical=lexical,
        dense=dense,
        structured=structured,
        category_anchor=category_anchor,
        preserve_anchor_pool=config.search.category_anchor_full_pool,
    )

    trace_sinks: list[object] = []
    if config.trace.enabled:
        trace_sinks.append(JsonlTraceSink(config.trace.path))
    if console_trace:
        trace_sinks.append(ConsoleDecisionTraceSink())
    trace_sink: TraceSink = (
        CompositeTraceSink(trace_sinks)
        if len(trace_sinks) > 1
        else trace_sinks[0]
        if trace_sinks
        else NullTraceSink()
    )
    return Components(
        state_tracker=RuleStateTracker(),
        planner=RuleQueryPlanner(config.search),
        retriever=retriever,
        ranker=(
            EvidenceRanker(store, config.ranking)
            if config.ranking.implementation == "evidence"
            else HeuristicRanker(store, config.ranking)
        ),
        policy=HeuristicPolicy(config.search, config.policy, store),
        coverage_manager=CandidateCoverageManager(config.policy),
        response_builder=OfficialResponseBuilder(store),
        trace_sink=trace_sink,
    )

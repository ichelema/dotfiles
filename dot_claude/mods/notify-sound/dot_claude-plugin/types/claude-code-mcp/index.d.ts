// The inputs of the MCP tools the session had connected when this mod
// was last saved, from each server's tools/list inputSchema.
// Merges into the engine's ToolCallInput (types/ McpToolInputs) so
// `e.tool === "mcp__<server>__<tool>"` narrows to the tool's arguments.
// Written again at a save of the mod with a server connected.
export {}
declare module 'claude-code' {
  interface McpToolInputs {
    /** Cancel a pending or running async operation. */
    mcp__hindsight__cancel_operation: {
      /** The ID of the operation to cancel */
      operation_id: string
    }
    /** Delete a document and its associated memories. Permanently removes a document and all memories linked to it. */
    mcp__hindsight__delete_document: {
      /** The ID of the document to delete */
      document_id: string
    }
    /** Get the profile of this memory bank. Returns bank metadata including name, disposition, and mission. */
    mcp__hindsight__get_bank: {}
    /** Get a specific document by ID. Returns document metadata and associated memory information. */
    mcp__hindsight__get_document: {
      /** The ID of the document to retrieve */
      document_id: string
    }
    /** Get a specific memory by ID. Returns the full memory unit including content, metadata, and timestamps. */
    mcp__hindsight__get_memory: {
      /** The ID of the memory to retrieve */
      memory_id: string
    }
    /** Get the status of an async operation. Check progress of background tasks like retain processing or mental model refresh. */
    mcp__hindsight__get_operation: {
      /** The ID of the operation to check */
      operation_id: string
    }
    /** Soft-retire a memory unit (or restore a previously retired one). Invalidating moves the fact out of the active set: it's excluded from recall, consolidation, and the knowledge graph, its links are pruned, and its derived observations are recomputed without it — but it's kept for audit and is fully reversible. Pass restore=True to bring it back. Only raw world/experience facts can be invalidated; observations are derived. */
    mcp__hindsight__invalidate_memory: {
      memory_id: string
      reason?: string | null
      restore?: boolean
    }
    /** List documents in this memory bank. Documents are containers for related memories (e.g., a conversation transcript, a meeting notes file). Memories created with a document_id are grouped under that document. */
    mcp__hindsight__list_documents: {
      /** Optional search query to filter documents */
      q?: string | null
      /** Maximum number of results (default: 100) */
      limit?: number
      /** Pagination offset (default: 0). Page until the returned items add up to 'total'. */
      offset?: number
    }
    /** Browse stored memories with optional filtering. Lists memory units (facts) stored in the bank. Unlike recall, this is a direct browse/search without relevance ranking. */
    mcp__hindsight__list_memories: {
      /** Filter by fact type: 'world', 'experience', or 'observation' */
      type?: string | null
      /** Optional text search query to filter memories */
      q?: string | null
      /** Maximum number of results (default: 100) */
      limit?: number
      /** Pagination offset (default: 0) */
      offset?: number
      /** Optional list of tag names to filter by. */
      tags?: string[] | null
      /** How to combine tags: 'any' (OR, default) or 'all' (AND) both also include untagged memories; 'any_strict'/'all_strict' exclude untagged; 'exact' matches the tag set exactly. */
      tags_match?: "any" | "all" | "any_strict" | "all_strict" | "exact"
    }
    /** List async operations for this memory bank. Operations track background tasks like retain processing, mental model refresh, etc. */
    mcp__hindsight__list_operations: {
      /** Filter by status: 'pending', 'running', 'completed', 'failed', 'cancelled' */
      status?: string | null
      /** Filter by operation type: 'retain', 'consolidation', 'refresh_mental_model', 'file_convert_retain', 'webhook_delivery' */
      type?: string | null
      /** Maximum number of results, 1-100 (default: 20) */
      limit?: number
      /** Number of operations to skip (default: 0). Page until you reach 'total'. */
      offset?: number
      /** Exclude parent batch operations (default: False) */
      exclude_parents?: boolean
    }
    /** List tags used in this memory bank. Tags are used to organize and filter memories, directives, and mental models. */
    mcp__hindsight__list_tags: {
      /** Optional pattern to filter tags (e.g., 'project:*') */
      q?: string | null
      /** Maximum number of results (default: 100) */
      limit?: number
      /** Pagination offset (default: 0). Page until the returned items add up to 'total'. */
      offset?: number
    }
    /** Search memories to provide personalized, context-aware responses. Use this tool PROACTIVELY to: - Check user's preferences before making suggestions - Recall user's history to provide continuity - Remember user's goals and context - Personalize responses based on past interactions */
    mcp__hindsight__recall: {
      query: string
      max_tokens?: number
      budget?: string
      types?: string[] | null
      prefer_observations?: boolean
      tags?: string[] | null
      tags_match?: string
      tag_groups?: {}[] | null
      query_timestamp?: string | null
      min_scores?: {} | null
      temporal_window?: {} | null
    }
    /** Generate thoughtful analysis by synthesizing stored memories with the bank's personality. WHEN TO USE THIS TOOL: Use reflect when you need reasoned analysis, not just fact retrieval. This tool thinks through the question using everything the bank knows and its personality traits. EXAMPLES OF GOOD QUERIES: - "What patterns have emerged in how I approach debugging?" - "Based on my past decisions, what architectural style do I prefer?" - "What might be the best approach for this problem given what you know about me?" - "How should I prioritize these tasks based on my goals?" HOW IT DIFFERS FROM RECALL: - recall: Returns raw facts matching your search (fast lookup) - reflect: Reasons across memories to form a synthesized answer (deeper analysis) Use recall for "what did I say about X?" and reflect for "what should I do about X?" */
    mcp__hindsight__reflect: {
      /** The question or topic to reflect on */
      query: string
      /** Optional context about why this reflection is needed */
      context?: string | null
      /** Search budget - 'low', 'mid', or 'high' (default: 'low') */
      budget?: string
      /** Maximum tokens for the response (default: 4096) */
      max_tokens?: number
      /** Optional JSON schema for structured output. When provided, the response includes a 'structured_output' field. */
      response_schema?: {} | null
      /** Optional tags to filter memories by (e.g., ['project:alpha']) */
      tags?: string[] | null
      /** How to match tags - 'any' (match any tag) or 'all' (match all tags). Default: 'any' */
      tags_match?: string
      /** Apply every active directive regardless of tags. By default directives are scoped like memories (untagged always apply; tagged apply only when tags match). Set true to apply all directives, ignoring tag scope. */
      apply_all_directives?: boolean
      /** Include source facts used for synthesis. Defaults to false because broad reflections can exceed MCP client result limits. */
      include_based_on?: boolean
      /** Include the reflection's internal trace fields (tool_trace/llm_trace and directives_applied). Defaults to false because the trace can be tens of KB and overflow MCP client context; enable only for debugging. */
      include_trace?: boolean
    }
    /** Store important information to long-term memory. Use this tool PROACTIVELY whenever the user shares: - Personal facts, preferences, or interests - Important events or milestones - User history, experiences, or background - Decisions, opinions, or stated preferences - Goals, plans, or future intentions - Relationships or people mentioned - Work context, projects, or responsibilities */
    mcp__hindsight__retain: {
      content: string
      context?: string
      timestamp?: string | null
      tags?: string[] | null
      metadata?: {} | null
      document_id?: string | null
      strategy?: string | null
      update_mode?: string | null
    }
    /** Store information to long-term memory and wait for completion. Unlike retain (which is asynchronous), this tool blocks until the memory is fully stored and immediately available for recall. */
    mcp__hindsight__sync_retain: {
      /** The fact/memory to store (be specific and include relevant details) */
      content: string
      /** Category for the memory (e.g., 'preferences', 'work', 'hobbies', 'family'). Default: 'general' */
      context?: string
      /** When this event/fact occurred (ISO format, e.g., '2024-01-15T10:30:00Z'). Useful for timeline tracking. */
      timestamp?: string | null
      /** Optional tags for scoped visibility filtering (e.g., ['project:alpha', 'user:123']) */
      tags?: string[] | null
      /** Optional key-value metadata to attach (e.g., {'source': 'slack', 'channel': 'general'}) */
      metadata?: {} | null
      /** Optional document ID to associate this memory with */
      document_id?: string | null
      /** Optional named retain strategy (e.g., 'exact' for verbatim storage). Strategies are defined in the bank config. */
      strategy?: string | null
    }
    /** Edit a memory unit to correct what was extracted. Pass any of text / context / occurred_start / occurred_end / fact_type / entities. For context and the dates, "" clears the field and omitting it leaves it unchanged; entities replaces the fact's entity set ([] detaches all). The memory is re-embedded and its derived observations, links, and graph are recomputed automatically. resolve_entities controls how the names in entities are matched. The default True behaves like retain and may resolve a name onto a similar entity that already exists, which silently discards a correction when the bank holds a near-duplicate name. Pass False whenever you are correcting a fact deliberately: an existing entity is then reused only on a case-insensitive name match, and any other name becomes its own entity. Only raw world/experience facts can be edited; observations are derived. To retire or restore a fact, use invalidate_memory instead. */
    mcp__hindsight__update_memory: {
      memory_id: string
      text?: string | null
      context?: string | null
      occurred_start?: string | null
      occurred_end?: string | null
      fact_type?: string | null
      entities?: string[] | null
      resolve_entities?: boolean
    }
  }
}

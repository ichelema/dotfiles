"""Regression checks: mise exec python@3.13.13 -- python -m unittest discover -s ~/.litellm -p test_callbacks.py -v"""
import asyncio
import copy
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import callbacks
import responses_bridge as bridge
from litellm.completion_extras.litellm_responses_transformation.handler import (
    ResponsesToCompletionBridgeHandler,
)
from litellm.completion_extras.litellm_responses_transformation.transformation import (
    LiteLLMResponsesTransformationHandler,
)
from litellm.llms.anthropic.experimental_pass_through.adapters.transformation import (
    LiteLLMAnthropicMessagesAdapter,
)
from litellm.types.llms.openai import ResponsesAPIResponse

SYSTEM = [{"type": "text", "text": "First: α\nline", "cache_control": {"type": "ephemeral"}},
          {"type": "text", "text": "Second: preserve all instructions"}]


def hook(data):
    return asyncio.run(callbacks.proxy_handler_instance.async_pre_call_hook(None, None, data, "anthropic_messages"))


def wire_system(system):
    messages = [{"role": "user", "content": "Hello"}]
    LiteLLMAnthropicMessagesAdapter()._add_system_message_to_messages(messages, {"system": system})
    return LiteLLMResponsesTransformationHandler().convert_chat_completion_messages_to_responses_api(messages)


class CallbackTests(unittest.TestCase):
    def test_reproduce_upstream_bug(self):
        items, _ = wire_system(copy.deepcopy(SYSTEM))
        self.assertIn("system", [item.get("role") for item in items])

    def test_fixed_wire_payload_all_configured_chatgpt_aliases(self):
        import yaml
        config = yaml.safe_load(Path(callbacks.__file__).with_name("litellm_config.yaml").read_text(encoding="utf-8"))
        aliases = [m["model_name"] for m in config["model_list"] if m["litellm_params"]["model"].startswith("chatgpt/")]
        self.assertTrue(aliases)
        for model in aliases + ["chatgpt/gpt-5.6-luna"]:
            with self.subTest(model=model):
                data = {"model": model, "system": copy.deepcopy(SYSTEM), "messages": [{"role": "user", "content": "Hello"}]}
                original_messages = copy.deepcopy(data["messages"])
                result = hook(data)
                items, instructions = wire_system(result["system"])
                self.assertNotIn("system", [item.get("role") for item in items])
                self.assertEqual(instructions, "\n\n".join(b["text"] for b in SYSTEM))
                self.assertEqual(data["messages"], original_messages)
                self.assertEqual(hook(copy.deepcopy(result)), result)

    def test_non_chatgpt_unchanged(self):
        for model in ("claude-opus", "claude-sonnet", "claude-haiku", "claude-fable", "claude-kimi-k3-high", "claude-deepseek-flash", "openai/gpt-5"):
            with self.subTest(model=model):
                data = {"model": model, "system": copy.deepcopy(SYSTEM), "tools": [], "litellm_session_id": "typingmind"}
                self.assertEqual(hook(copy.deepcopy(data)), data)

    def test_strings_missing_empty_and_unknown_blocks(self):
        for system in (None, "text\nunchanged", [], [{"type": "image", "source": "unknown"}], [{"type": "text", "text": 3}], ["invalid"]):
            with self.subTest(system=system):
                data = {"model": "claude-gpt-5-6-luna-high", "system": system}
                result = hook(copy.deepcopy(data))
                if system == []:
                    self.assertIn(result["system"], ([], ""))
                else:
                    self.assertEqual(result, data)
        data = {"model": "claude-gpt-5-6-luna-high"}
        self.assertEqual(hook(copy.deepcopy(data)), data)

    def test_conversation_tools_and_effort_untouched(self):
        data = {"model": "claude-gpt-5-6-luna-high", "system": copy.deepcopy(SYSTEM),
                "messages": [{"role": "user", "content": "question"}, {"role": "assistant", "content": [{"type": "tool_use", "id": "t1", "name": "Read", "input": {"path": "a"}}]},
                             {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "t1", "content": "result"}]}, {"role": "system", "content": "mid-turn unchanged"}],
                "tools": [{"name": "Read", "input_schema": {"type": "object"}}],
                "reasoning": {"effort": "high"}, "stream": True}
        expected = copy.deepcopy(data)
        result = hook(data)
        result.pop("system")
        expected.pop("system")
        self.assertEqual(result, expected)

    def test_typingmind_tools_merge_idempotent_preserve_options(self):
        data = {"model": "claude-gpt-5-6-luna-high", "litellm_session_id": "typingmind",
                "input": [{"role": "user", "content": "test"}], "instructions": "unchanged",
                "tools": [{"type": "function", "name": "canvas"}, {"type": "web_search", "search_context_size": "low"}]}
        result = hook(data)
        self.assertEqual([t["type"] for t in result["tools"]], ["function", "web_search", "image_generation"])
        self.assertEqual(result["tools"][1]["search_context_size"], "low")
        self.assertEqual(result["tools"][1]["search_content_types"], ["text", "image"])
        self.assertEqual(result["instructions"], "unchanged")
        self.assertEqual(hook(copy.deepcopy(result)), result)

    def test_typingmind_effort(self):
        with patch.object(callbacks.SystemToInstructions, "_effort_configurato", return_value="max"):
            for initial, expected in (({}, "max"), ({"summary": "auto"}, "max"), ({"effort": "low"}, "low")):
                result = hook({"model": "claude-gpt-5-6-sol-max", "litellm_session_id": "typingmind", "reasoning": initial.copy()})
                self.assertEqual(result["reasoning"]["effort"], expected)
                if "summary" in initial:
                    self.assertEqual(result["reasoning"]["summary"], "auto")


ITEM = {"type": "message", "role": "assistant", "content": [{"type": "output_text", "text": "OK"}]}
EVENTS = [{"type": "response.output_item.done", "output_index": 0, "item": ITEM},
          {"type": "response.completed", "response": {"id": "test", "output": []}}]
SSE = "".join("data: " + json.dumps(e) + "\n\n" for e in EVENTS).encode()


class BridgeTests(unittest.TestCase):
    def test_existing_stream_patch_sync_and_async(self):
        class Stream:
            completed_response = SimpleNamespace(response=ResponsesAPIResponse.model_construct(id="test", output=[]))
            def __iter__(self):
                return iter(copy.deepcopy(EVENTS))
            async def __aiter__(self):
                for event in copy.deepcopy(EVENTS):
                    yield event
        handler = ResponsesToCompletionBridgeHandler()
        self.assertEqual(handler._collect_response_from_stream(Stream()).output, [ITEM])
        self.assertEqual(asyncio.run(handler._collect_response_from_stream_async(Stream())).output, [ITEM])

    def test_aggregation(self):
        self.assertEqual(bridge._aggrega(SSE.decode())["output"], [ITEM])
        self.assertIsNone(bridge._aggrega("data: invalid\n"))

    def test_images_written_and_linked(self):
        import base64
        scratch = Path(callbacks.__file__).parent.parent / ".pi" / "agent" / "tmp"
        scratch.mkdir(parents=True, exist_ok=True)
        with (
            tempfile.TemporaryDirectory(dir=scratch) as directory,
            patch.object(bridge, "IMG_DIR", directory),
        ):
            response = {"output": [copy.deepcopy(ITEM), {"type": "image_generation_call", "result": base64.b64encode(b"test-image").decode()}]}
            self.assertEqual(bridge._estrai_immagini(response, "http://localhost:4000"), 1)
            self.assertEqual(next(Path(directory).iterdir()).read_bytes(), b"test-image")
            self.assertIn("http://localhost:4000/img/", response["output"][0]["content"][0]["text"])
            self.assertEqual(response["output"][1]["result"], "")

    def test_websearch_translation_and_mixed_tools(self):
        self.assertTrue(bridge._is_web_search_only([{"type": "web_search_20250305", "name": "web_search"}]))
        self.assertFalse(bridge._is_web_search_only([{"name": "web_search"}, {"name": "Read"}]))
        events = [{"type": "response.output_item.done", "item": {"type": "web_search_call", "action": {"query": "test"}}},
                  {"type": "response.output_text.annotation.added", "annotation": {"url": "https://example.com", "title": "Example"}},
                  {"type": "response.output_text.delta", "delta": "answer"}]
        query, citations, text = bridge._estrai_web_search("".join("data: " + json.dumps(e) + "\n" for e in events))
        response = bridge._costruisci_risposta("test", query, citations, text)
        self.assertEqual(response["usage"]["server_tool_use"]["web_search_requests"], 1)
        self.assertEqual(text, "answer")
        output = bridge._sse_antropico(response)
        for kind in (b"message_start", b"server_tool_use", b"web_search_tool_result", b"message_stop"):
            self.assertIn(kind, output)

    def test_middleware_chunked_stream_json_and_passthrough(self):
        async def run(stream, session, path="/v1/responses", upstream=SSE, content_type=b"text/event-stream"):
            data = {"model": "test", "stream": stream, "litellm_session_id": session, "input": "hello"}
            body = json.dumps(data).encode()
            received, output = [], []
            incoming = [{"type": "http.request", "body": body[:9], "more_body": True}, {"type": "http.request", "body": body[9:], "more_body": False}]
            async def receive():
                return incoming.pop(0) if incoming else {"type": "http.disconnect"}
            async def send(message):
                output.append(message)
            async def app(scope, receive, send):
                while True:
                    m = await receive()
                    received.append(m.get("body", b""))
                    if not m.get("more_body"):
                        break
                await send({"type": "http.response.start", "status": 200, "headers": [(b"content-type", content_type), (b"access-control-allow-origin", b"*")]})
                for i in range(0, len(upstream), 7):
                    await send({"type": "http.response.body", "body": upstream[i:i+7], "more_body": i+7 < len(upstream)})
            with patch.object(bridge, "_log"):
                await bridge._Ponte(app)({"type": "http", "method": "POST", "path": path, "headers": [(b"host", b"localhost:4000")]}, receive, send)
            self.assertEqual(b"".join(received), body)
            self.assertIn((b"access-control-allow-origin", b"*"), output[0]["headers"])
            return b"".join(m.get("body", b"") for m in output), output[0]["status"]
        output, status = asyncio.run(run(False, "typingmind"))
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(output)["output"], [ITEM])
        output, _ = asyncio.run(run(True, "typingmind"))
        self.assertEqual(bridge._aggrega(output.decode())["output"], [ITEM])
        for path in ("/v1/responses", "/v1/messages", "/v1/chat/completions"):
            output, _ = asyncio.run(run(True, "other", path))
            self.assertEqual(output, SSE)
        output, _ = asyncio.run(run(False, "typingmind", upstream=b'{"error":"unchanged"}', content_type=b"application/json"))
        self.assertEqual(output, b'{"error":"unchanged"}')
        output, status = asyncio.run(run(False, "typingmind", upstream=b"data: {}\n\n"))
        self.assertEqual(status, 502)


if __name__ == "__main__":
    unittest.main(verbosity=2)

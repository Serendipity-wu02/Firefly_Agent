import assert from "node:assert/strict";
import test from "node:test";
import {
  createStreamingAccumulator,
  finalizeAccumulator,
  processSseChunk,
} from "../../../dist/main/main/orchestrator/providers/sse-tool-parser.js";

test("streaming tool arguments survive an SSE data line split across chunks", () => {
  const accumulator = createStreamingAccumulator();
  const event = `data: ${JSON.stringify({
    choices: [{
      delta: {
        tool_calls: [{
          index: 0,
          id: "file-call-1",
          function: {
            name: "file_read",
            arguments: JSON.stringify({ selectionId: "selection-1", fileId: "file-1" }),
          },
        }],
      },
    }],
  })}\n`;
  const splitAt = event.indexOf("selectionId");
  assert.ok(splitAt > 0);

  processSseChunk(event.slice(0, splitAt), accumulator);
  processSseChunk(event.slice(splitAt), accumulator);

  const result = finalizeAccumulator(accumulator);
  assert.deepEqual(result.toolCalls, [{
    id: "file-call-1",
    name: "file_read",
    arguments: { selectionId: "selection-1", fileId: "file-1" },
  }]);
});

/** Dispatch a ResponseStreamEvent to the appropriate StreamHandler callback. */
export function dispatchStreamEvent(event, handler, ctx) {
    handler.onEvent?.(event, ctx);
    switch (event.type) {
        case "response.output_text.delta":
            handler.onTextDelta?.(event.delta, ctx);
            break;
        case "response.reasoning_text.delta":
            handler.onReasoningDelta?.(event.delta, ctx);
            break;
        case "response.output_item.added":
            if (event.item.type === "function_call") {
                handler.onToolCallStart?.(event.item.name, event.item.call_id, ctx);
            }
            break;
    }
}
//# sourceMappingURL=stream.js.map
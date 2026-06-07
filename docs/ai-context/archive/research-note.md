# Note — reporting a problem through the help chat

> Status: **superseded**. Dify was removed; the AI stack is now direct
> Gemini/DeepSeek/OpenAI provider calls via `chat.service.ts`. Report flow
> still uses the booking_support context type — see `POST /chat/session`
> with `contextType: 'booking_support'`.

## Original intent (preserved for reference)

The idea was to let the AI chatbot recognise a customer problem report from
natural conversation and automatically create a `Report` row. This was never
implemented. The `chatGuard.ts` prompt-injection ban and `FAQ` tier-based
system prompt are the only remaining AI chatbot features beyond Q&A.

Booking support context (`booking_support`) is passed via `contextId` to give
the AI awareness of which booking the user is talking about.

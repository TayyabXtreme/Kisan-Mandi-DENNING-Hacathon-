# AWS Bedrock AI: how it works, models, configure, use

## How a request flows
```
App screen ──useAction(api.ai.chat)──▶ Convex action (convex/ai.ts, "use node")
   checks login (ctx.auth) ──▶ Vercel AI SDK generateText() ──▶ @ai-sdk/amazon-bedrock
   ──signed HTTPS (AWS SigV4)──▶ bedrock-runtime.<region>.amazonaws.com ──▶ model ──▶ text back to the app
```
- AWS keys live **only** in Convex env vars. The app never sees them, and only signed-in users can call AI.
- `api.ai.chat` args: `{ provider: "bedrock" | "groq", system?: string, messages: { role: "user" | "assistant", content: string }[] }` (1–50 messages, `maxOutputTokens: 1024`). Returns a string.
- The model comes from `BEDROCK_MODEL_ID` (default `us.anthropic.claude-sonnet-4-6`).

## Configure
```bash
npx convex env set AWS_ACCESS_KEY_ID AKIA...
npx convex env set AWS_SECRET_ACCESS_KEY ...
npx convex env set AWS_REGION us-east-1
npx convex env set BEDROCK_MODEL_ID us.anthropic.claude-sonnet-4-6   # optional
# Alternative to the key pair: a Bedrock API key
npx convex env set AWS_BEARER_TOKEN_BEDROCK ...
npx convex env list
```
- Changing `BEDROCK_MODEL_ID` applies to the next call; no redeploy needed.
- The IAM user needs `bedrock:InvokeModel` (and `bedrock:InvokeModelWithResponseStream` for streaming).
- **Model access:** an ID can be listed in the region but still return "not available for this account". Enable it in AWS Console → Bedrock → *Model access* (or accept its Marketplace offer), then retry.
- **ID format:** use inference-profile IDs. `us.` routes within US regions; `global.` routes worldwide. Newer models can't be called with the bare `anthropic.…` ID.

## Models tested with this account (us-east-1, 2026-10-21)
| Model ID | Good for | Latency* |
|---|---|---|
| `us.anthropic.claude-sonnet-4-6` (**default**) / `global.anthropic.claude-sonnet-4-6` | Best all-round: chat, reasoning, code, JSON | ~1.7 s |
| `us.anthropic.claude-opus-4-6-v1` | Hardest tasks, highest quality, slower and costlier | ~2.1 s |
| `us.anthropic.claude-opus-4-5-20251101-v1:0` | Strong alternative to Opus 4.6 | ~2.0 s |
| `us.anthropic.claude-sonnet-4-5-20250929-v1:0` | Previous Sonnet | ~2.5 s |
| `us.anthropic.claude-haiku-4-5-20251001-v1:0` | Fast and cheap: classify, extract, short replies | ~1.5 s |
| `us.amazon.nova-pro-v1:0` / `us.amazon.nova-2-lite-v1:0` / `us.amazon.nova-micro-v1:0` | Amazon models, very cheap (micro = text only) | ~1.5 s |
| `us.meta.llama3-3-70b-instruct-v1:0`, `us.meta.llama4-maverick-17b-instruct-v1:0` | Open-weight Llama | ~1.2 s |
| `us.mistral.pixtral-large-2502-v1:0` | Mistral, image input | ~1.3 s |
| `us.deepseek.r1-v1:0` | Step-by-step reasoning (slower) | ~2.7 s |

\*Measured on a one-word reply; real latency grows with output length.

**Listed but "not available for this account"** (enable access first): Claude Sonnet/Opus/Haiku 5.x, Fable 5/5.1, Opus 4.7/4.8, `openai.gpt-*`.

## Use from the app
```tsx
import { useAction, useConvexAuth } from "convex/react";
import { api } from "../../convex/_generated/api";

const chat = useAction(api.ai.chat);
const { isAuthenticated } = useConvexAuth(); // wait for this before calling
const reply = await chat({
  provider: "bedrock",
  system: "You are a concise travel guide.",
  messages: [{ role: "user", content: "Plan one day in Lahore" }],
});
```
For a multi-turn chat, send the whole history (user and assistant turns) each time. See `src/app/ai-demo.tsx` (Groq/Bedrock toggle and 🎤 voice input via `api.ai.transcribe`).

## Add your own AI action (convex/ai.ts)
Structured JSON output (tested on Haiku 4.5):
```ts
import { generateText, Output } from "ai";
import { z } from "zod";

export const suggestPlaces = action({
  args: { city: v.string() },
  handler: async (ctx, args) => {
    if (!(await ctx.auth.getUserIdentity())) throw new Error("Sign in to use AI.");
    const { output } = await generateText({
      model: getModel("bedrock"), // or createAmazonBedrock({...})("us.anthropic.claude-haiku-4-5-20251001-v1:0")
      output: Output.object({ schema: z.object({ places: z.array(z.string()).max(5) }) }),
      prompt: `Suggest places to visit in ${args.city}.`,
    });
    return output; // { places: [...] }
  },
});
```
- **Different model per action:** build the provider the same way as `getModel` and call `bedrock("<model id>")`.
- **Save results:** an action has no `ctx.db`. Call an internal mutation (`ctx.runMutation(internal.x.save, {...})`) and use `requireUser` there.
- **Streaming:** an action returns one value. To show tokens live, use `streamText` and write chunks to a table that the screen reads with `useQuery`.
- **Limits:** Convex actions time out after 10 minutes; keep `maxOutputTokens` small for speed and cost.

## Test & troubleshoot
```bash
# As a signed-in user (sessionId from betterAuth → session table):
npx convex run ai:chat '{"provider":"bedrock","messages":[{"role":"user","content":"hi"}]}' \
  --identity '{"subject":"<authUserId>","issuer":"https://<dep>.convex.site","sessionId":"<sessionId>"}'
npx convex logs        # watch A(ai:chat) calls and errors
```
| Error | Fix |
|---|---|
| `Sign in to use AI.` | The app called before Convex auth was ready; gate on `useConvexAuth().isAuthenticated` |
| `Set AWS_ACCESS_KEY_ID …` | Env vars missing on this deployment (`npx convex env list`) |
| `… is not available for this account` | Enable model access in the Bedrock console, or pick a model from the table |
| `The provided model identifier is invalid` | Typo, or a bare `anthropic.…` ID; use the `us.`/`global.` profile ID |
| `UnrecognizedClientException` / `security token … invalid` | Wrong, rotated or deactivated key; set new keys |
| `ThrottlingException` | Too many requests; retry later or switch to Haiku/Nova |

**Security:** rotate the AWS key after the hackathon (IAM → Users → Security credentials). Never put AWS keys in `app.json` or app code.

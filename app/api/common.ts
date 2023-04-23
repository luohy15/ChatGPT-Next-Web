import { NextRequest } from "next/server";
// @ts-expect-error
import wasm from "@dqbd/tiktoken/lite/tiktoken_bg.wasm?module";
import model from "@dqbd/tiktoken/encoders/cl100k_base.json";
import { init, Tiktoken } from "@dqbd/tiktoken/lite/init";

const OPENAI_URL = "api.openai.com";
const DEFAULT_PROTOCOL = "https";
const PROTOCOL = process.env.PROTOCOL ?? DEFAULT_PROTOCOL;
const BASE_URL = process.env.BASE_URL ?? OPENAI_URL;

export async function requestOpenai(req: NextRequest) {
  const apiKey = req.headers.get("token");
  const openaiPath = req.headers.get("path");

  let baseUrl = BASE_URL;

  if (!baseUrl.startsWith("http")) {
    baseUrl = `${PROTOCOL}://${baseUrl}`;
  }

  console.log("[Proxy] ", openaiPath);
  console.log("[Base Url]", baseUrl);

  if (process.env.OPENAI_ORG_ID) {
    console.log("[Org ID]", process.env.OPENAI_ORG_ID);
  }

  return fetch(`${baseUrl}/${openaiPath}`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(process.env.OPENAI_ORG_ID && {
        "OpenAI-Organization": process.env.OPENAI_ORG_ID,
      }),
    },
    method: req.method,
    body: req.body,
  });
}

export async function numTokensFromText(message: string) {
  await init((imports) => WebAssembly.instantiate(wasm, imports));
  const encoding = new Tiktoken(
    model.bpe_ranks,
    model.special_tokens,
    model.pat_str,
  );
  const numTokens = encoding.encode(message).length;
  encoding.free();
  return numTokens;
}

export async function numTokensFromMessages(
  messages: any[],
  modelName: string,
): Promise<number> {
  let tokensPerMessage = 4;
  let tokensPerName = -1;
  if (modelName === "gpt-3.5-turbo") {
    return numTokensFromMessages(messages, "gpt-3.5-turbo-0301");
  } else if (modelName === "gpt-4") {
    return numTokensFromMessages(messages, "gpt-4-0314");
  } else if (modelName === "gpt-3.5-turbo-0301") {
    tokensPerMessage = 4; // every message follows <|start|>{role/name}\n{content}<|end|>\n
    tokensPerName = -1; // if there's a name, the role is omitted
  } else if (modelName === "gpt-4-0314") {
    tokensPerMessage = 3;
    tokensPerName = 1;
  } else {
    throw new Error(
      `num_tokens_from_messages() is not implemented for model ${modelName}. See https://github.com/openai/openai-python/blob/main/chatml.md for information on how messages are converted to tokens.`,
    );
  }
  let numTokens: number = 0;
  await init((imports) => WebAssembly.instantiate(wasm, imports));
  const encoding = new Tiktoken(
    model.bpe_ranks,
    model.special_tokens,
    model.pat_str,
  );
  for (let message of messages) {
    numTokens += tokensPerMessage;
    for (const key in message) {
      numTokens += encoding.encode(message[key]).length;
      if (key === "name") {
        numTokens += tokensPerName;
      }
    }
  }
  encoding.free();
  numTokens += 3; // every reply is primed with <|start|>assistant<|message|>
  return numTokens;
}

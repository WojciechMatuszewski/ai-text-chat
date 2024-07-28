import { Message, MessagesSchema } from "@/lib/schemas";
import OpenAI from "openai";

export const maxDuration = 30;

const client = new OpenAI();

async function* getAIResponse(messages: Message[]) {
  const response = client.beta.chat.completions.stream({
    model: "gpt-4-turbo",
    messages: [
      {
        role: "system",
        content: "You are a helpful assistant."
      },
      ...messages.map((message) => {
        return {
          role: message.role === "ai" ? "assistant" : "user",
          content: message.content
        } as const;
      })
    ]
  });

  for await (const completion of response) {
    yield completion;
  }
}

export async function POST(req: Request) {
  const data = await req.json();
  const messages = MessagesSchema.parse(data);

  const aiResponse = getAIResponse(messages);

  const stream = new ReadableStream({
    async pull(controller) {
      const { done, value } = await aiResponse.next();
      if (done) {
        controller.close();
      } else {
        const response = value.choices[0]?.delta?.content ?? "";
        controller.enqueue(response);
      }
    }
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/plain",
      "Transfer-Encoding": "chunked"
    }
  });
}

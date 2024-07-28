"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Message } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { useState } from "react";

export default function Home() {
  const { messages, handleInputChange, input, handleSubmit } =
    useSyncStoreChat();

  return (
    <div className={"max-w-lg m-auto flex flex-col gap-4"}>
      <ul className={"flex flex-col gap-2"}>
        {messages.map((message) => {
          const roleToLabel = {
            user: "User",
            ai: "AI"
          };
          const isAi = message.role === "ai";

          return (
            <li key={message.id} className={cn("inline-flex flex-col", {})}>
              <span className={"font-bold"}>{roleToLabel[message.role]}</span>
              <p
                className={cn({
                  [`ai-message-${message.id}`]: isAi
                })}
                style={{ viewTransitionName: `ai-response-${message.id}` }}
              >
                {message.content}
              </p>
            </li>
          );
        })}
      </ul>
      <form onSubmit={handleSubmit}>
        <fieldset className={"flex gap-2 flex-col"}>
          <Input name="prompt" value={input} onChange={handleInputChange} />
          <Button className={"self-end"}>Submit</Button>
        </fieldset>
      </form>
    </div>
  );
}

async function* getAiResponse({ messages }: { messages: Message[] }) {
  const chatResponseId = Math.random().toString();
  const chatResponse = await fetch("/api/chat", {
    method: "POST",
    body: JSON.stringify(messages)
  });
  if (!chatResponse.ok) {
    throw new Error("Failed to make a request");
  }
  if (!chatResponse.body) {
    throw new Error("Body is empty");
  }

  const decoder = new TextDecoder();
  const reader = chatResponse.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      yield { text: decoder.decode(value), id: chatResponseId };
    }
  } finally {
    reader.releaseLock();
  }
}

function useSyncStoreChat() {
  const [messages, setMessages] = useState<Record<string, Message>>({});
  const allMessages = Object.values(messages);

  const getResponse = async (message: Message) => {
    const aiResponse = getAiResponse({ messages: [...allMessages, message] });

    for await (const { text, id } of aiResponse) {
      viewTransition(() => {
        setMessages((existingMessages) => {
          const existingMessage = existingMessages[id];
          if (!existingMessage) {
            return {
              ...existingMessages,
              [id]: {
                id,
                role: "ai",
                content: text
              }
            };
          } else {
            return {
              ...existingMessages,
              [id]: {
                ...existingMessage,
                content: existingMessage.content.concat(text)
              }
            };
          }
        });
      });
    }
  };

  const [text, setText] = useState("");

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (
    event
  ) => {
    event.preventDefault();

    const id = Math.random().toString();

    setMessages({ ...messages, [id]: { id, role: "user", content: text } });

    void getResponse({ content: text, id, role: "user" });

    setText("");
  };

  return {
    messages: allMessages,
    input: text,
    handleInputChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      setText(event.target.value);
    },
    handleSubmit
  };
}

function viewTransition(callback: VoidFunction) {
  const hasViewTransitions =
    "startViewTransition" in document &&
    typeof document.startViewTransition === "function";

  if (!hasViewTransitions) {
    return callback();
  }

  // @ts-ignore
  return document.startViewTransition(callback);
}
